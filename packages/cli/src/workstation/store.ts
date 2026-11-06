// Workstation credential and installation store.
// Lives in ~/.config/bat/workstation/, separate from the server CLI profile.
// The installation UUID survives logout; the credential file does not.

import { randomUUID } from "node:crypto";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isUuid, isWorkstationToken } from "@bat/shared";
import type { CommandExecutor } from "./scheduler/exec.js";
import { SCHEDULER_BACKENDS, type SchedulerBackend } from "./scheduler/plan.js";

export interface WorkstationPaths {
	dir: string;
	installationPath: string;
	credentialPath: string;
	lockPath: string;
	schedulePath: string;
	logPath: string;
}

export interface WorkstationCredential {
	workstation_id: string;
	worker_url: string;
	token: string;
}

export interface ScheduleRecord {
	backend: string;
	installed_at: number;
}

/** Resolve every workstation-owned path below a home directory. */
export function getWorkstationPaths(home = homedir()): WorkstationPaths {
	const dir = join(home, ".config", "bat", "workstation");
	return {
		dir,
		installationPath: join(dir, "installation.json"),
		credentialPath: join(dir, "workstation.json"),
		lockPath: join(dir, "probe.lock"),
		schedulePath: join(dir, "schedule.json"),
		logPath: join(dir, "probe.log"),
	};
}

function ensureDirectory(paths: WorkstationPaths, platform: NodeJS.Platform): void {
	mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
	if (platform !== "win32") {
		chmodSync(paths.dir, 0o700);
	}
}

/** Files we own must never be group or world readable. */
export function enforcePrivateFile(
	path: string,
	platform: NodeJS.Platform = process.platform,
): void {
	if (platform === "win32") {
		return;
	}
	chmodSync(path, 0o600);
}

/**
 * Windows user ACL: remove inherited entries and grant only the current user.
 * Runs only on an explicit login on Windows, never in tests.
 */
export async function restrictWindowsAcl(path: string, exec: CommandExecutor): Promise<void> {
	const user = process.env.USERNAME;
	if (!user) {
		throw new Error("USERNAME is not set — cannot restrict the workstation config ACL");
	}
	const result = await exec("icacls", [path, "/inheritance:r", "/grant:r", `${user}:F`, "/T"], {});
	if (result.code !== 0) {
		throw new Error(`icacls failed: ${result.stderr.trim() || `exit ${result.code ?? "null"}`}`);
	}
}

function writeAtomic(path: string, content: string): void {
	const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
	try {
		writeFileSync(tmp, content, { mode: 0o600 });
		renameSync(tmp, path);
	} catch (err) {
		try {
			unlinkSync(tmp);
		} catch {
			// The temp file was never created or is already gone.
		}
		throw err;
	}
}

export interface StoreDeps {
	platform?: NodeJS.Platform;
	acl?: (path: string) => Promise<void>;
}

/** Read the installation UUID if it exists, repairing file permissions first. */
export function readInstallationId(paths: WorkstationPaths, deps: StoreDeps = {}): string | null {
	if (!existsSync(paths.installationPath)) {
		return null;
	}
	enforcePrivateFile(paths.installationPath, deps.platform ?? process.platform);
	const raw = JSON.parse(readFileSync(paths.installationPath, "utf-8")) as unknown;
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		throw new Error("installation.json is corrupt — remove it and login again");
	}
	const id = (raw as Record<string, unknown>).installation_id;
	if (typeof id !== "string" || !isUuid(id)) {
		throw new Error("installation.json has no valid installation_id — login again");
	}
	return id;
}

/** Return the stable installation UUID, creating it once for this machine. */
export async function ensureInstallationId(
	paths: WorkstationPaths,
	deps: StoreDeps = {},
): Promise<string> {
	const existing = readInstallationId(paths, deps);
	if (existing) {
		return existing;
	}
	const platform = deps.platform ?? process.platform;
	ensureDirectory(paths, platform);
	if (deps.acl) {
		await deps.acl(paths.dir);
	}
	const id = randomUUID();
	writeAtomic(paths.installationPath, `${JSON.stringify({ installation_id: id }, null, 2)}\n`);
	enforcePrivateFile(paths.installationPath, platform);
	return id;
}

function isLoopbackHost(hostname: string): boolean {
	return ["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname);
}

/** Stored worker_url must be https or a loopback http origin. */
export function isAcceptableWorkerUrl(input: string): boolean {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return false;
	}
	if (url.username !== "" || url.password !== "") {
		return false;
	}
	if (url.protocol === "https:") {
		return url.pathname === "/" && url.search === "" && url.hash === "";
	}
	if (url.protocol !== "http:" || !isLoopbackHost(url.hostname)) {
		return false;
	}
	return url.pathname === "/" && url.search === "" && url.hash === "";
}

function readJsonObject(path: string): Record<string, unknown> | null {
	const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
		return null;
	}
	return raw as Record<string, unknown>;
}

/** Read the workstation credential, or null when this machine is not logged in. */
export function readCredential(
	paths: WorkstationPaths,
	deps: StoreDeps = {},
): WorkstationCredential | null {
	if (!existsSync(paths.credentialPath)) {
		return null;
	}
	enforcePrivateFile(paths.credentialPath, deps.platform ?? process.platform);
	const raw = readJsonObject(paths.credentialPath);
	if (!raw) {
		throw new Error("workstation config is corrupt — run 'bat workstation logout' then login");
	}
	const { workstation_id: workstationId, worker_url: workerUrl, token } = raw;
	if (typeof workstationId !== "string" || !isUuid(workstationId)) {
		throw new Error("workstation config has no valid workstation_id — login again");
	}
	if (typeof workerUrl !== "string" || !isAcceptableWorkerUrl(workerUrl)) {
		throw new Error("workstation config has no valid worker_url — login again");
	}
	if (typeof token !== "string" || !isWorkstationToken(token)) {
		throw new Error("workstation config has no valid batw_ token — login again");
	}
	return { workstation_id: workstationId, worker_url: workerUrl, token };
}

/** Atomically persist the workstation credential with 0600 permissions. */
export async function writeCredential(
	paths: WorkstationPaths,
	credential: WorkstationCredential,
	deps: StoreDeps = {},
): Promise<void> {
	const platform = deps.platform ?? process.platform;
	ensureDirectory(paths, platform);
	// Restrict the directory before the secret exists; a denied ACL must never
	// leave a plaintext token on disk.
	if (deps.acl) {
		await deps.acl(paths.dir);
	}
	writeAtomic(paths.credentialPath, `${JSON.stringify(credential, null, 2)}\n`);
	enforcePrivateFile(paths.credentialPath, platform);
}

/** Remove the credential; the installation UUID stays. */
export function deleteCredential(paths: WorkstationPaths): boolean {
	if (!existsSync(paths.credentialPath)) {
		return false;
	}
	unlinkSync(paths.credentialPath);
	return true;
}

export function readScheduleRecord(paths: WorkstationPaths): ScheduleRecord | null {
	if (!existsSync(paths.schedulePath)) {
		return null;
	}
	const raw = readJsonObject(paths.schedulePath);
	if (!raw) {
		throw new Error("schedule.json is corrupt — run 'bat workstation setup --remove'");
	}
	const backend = raw.backend;
	const installedAt = raw.installed_at;
	if (
		typeof backend !== "string" ||
		!SCHEDULER_BACKENDS.includes(backend as SchedulerBackend) ||
		typeof installedAt !== "number"
	) {
		throw new Error("schedule.json is corrupt — run 'bat workstation setup --remove'");
	}
	return { backend, installed_at: installedAt };
}

export function writeScheduleRecord(paths: WorkstationPaths, record: ScheduleRecord): void {
	ensureDirectory(paths, process.platform);
	writeAtomic(paths.schedulePath, `${JSON.stringify(record, null, 2)}\n`);
}

export function deleteScheduleRecord(paths: WorkstationPaths): boolean {
	if (!existsSync(paths.schedulePath)) {
		return false;
	}
	unlinkSync(paths.schedulePath);
	return true;
}

/** Redact a token for display; the plaintext never reaches logs. */
export function maskToken(token: string): string {
	return `${token.slice(0, 9)}…${token.slice(-4)}`;
}
