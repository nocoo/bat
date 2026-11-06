// Tests for the workstation credential and installation store.

import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	deleteCredential,
	deleteScheduleRecord,
	enforcePrivateFile,
	ensureInstallationId,
	getWorkstationPaths,
	isAcceptableWorkerUrl,
	maskToken,
	readCredential,
	readInstallationId,
	readScheduleRecord,
	restrictWindowsAcl,
	type WorkstationCredential,
	writeCredential,
	writeScheduleRecord,
} from "./store.js";

let home: string;
const TOKEN = `batw_${"a".repeat(43)}`;

const CREDENTIAL: WorkstationCredential = {
	workstation_id: "771e8400-e29b-41d4-a716-446655440000",
	worker_url: "https://bat-ingest.worker.hexly.ai",
	token: TOKEN,
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bat-ws-store-"));
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
	vi.unstubAllEnvs();
});

describe("paths", () => {
	test("places everything under the workstation directory", () => {
		const paths = getWorkstationPaths(home);
		expect(paths.dir).toBe(join(home, ".config", "bat", "workstation"));
		expect(paths.credentialPath).toBe(join(paths.dir, "workstation.json"));
		expect(paths.installationPath).toBe(join(paths.dir, "installation.json"));
		expect(paths.lockPath).toBe(join(paths.dir, "probe.lock"));
		expect(paths.schedulePath).toBe(join(paths.dir, "schedule.json"));
		expect(paths.logPath).toBe(join(paths.dir, "probe.log"));
	});

	test("defaults to the current home", () => {
		vi.stubEnv("HOME", home);
		vi.stubEnv("USERPROFILE", home);
		expect(getWorkstationPaths().dir).toBe(join(home, ".config", "bat", "workstation"));
	});
});

describe("installation id", () => {
	test("is created once and stays stable", async () => {
		const paths = getWorkstationPaths(home);
		const first = await ensureInstallationId(paths);
		const second = await ensureInstallationId(paths);
		expect(first).toBe(second);
		expect(readInstallationId(paths)).toBe(first);
	});

	test("writes a private directory and file on POSIX", async () => {
		const paths = getWorkstationPaths(home);
		await ensureInstallationId(paths);
		expect(statSync(paths.dir).mode & 0o777).toBe(0o700);
		expect(statSync(paths.installationPath).mode & 0o777).toBe(0o600);
	});

	test("skips chmod on Windows", async () => {
		const paths = getWorkstationPaths(home);
		await ensureInstallationId(paths, { platform: "win32" });
		expect(readInstallationId(paths, { platform: "win32" })).toBeTruthy();
	});

	test("runs the Windows ACL hook only when provided", async () => {
		const paths = getWorkstationPaths(home);
		const acl = vi.fn(async () => {
			expect(existsSync(paths.installationPath)).toBe(false);
		});
		await ensureInstallationId(paths, { acl });
		expect(acl).toHaveBeenCalledWith(paths.dir);
	});

	test("returns null when no installation exists", () => {
		expect(readInstallationId(getWorkstationPaths(home))).toBeNull();
	});

	test("rejects a corrupt installation file", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.installationPath, "[]");
		expect(() => readInstallationId(paths)).toThrow(/installation.json is corrupt/);
	});

	test("rejects an invalid installation uuid", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.installationPath, JSON.stringify({ installation_id: "nope" }));
		expect(() => readInstallationId(paths)).toThrow(/no valid installation_id/);
	});

	test("repairs permissions on an existing file", async () => {
		const paths = getWorkstationPaths(home);
		await ensureInstallationId(paths);
		chmodSync(paths.installationPath, 0o644);
		readInstallationId(paths);
		expect(statSync(paths.installationPath).mode & 0o777).toBe(0o600);
	});

	test("enforcePrivateFile is a no-op on Windows", () => {
		const path = join(home, "file.json");
		writeFileSync(path, "{}");
		chmodSync(path, 0o644);
		enforcePrivateFile(path, "win32");
		expect(statSync(path).mode & 0o777).toBe(0o644);
	});
});

describe("credential", () => {
	test("round-trips and stays private", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		expect(readCredential(paths)).toStrictEqual(CREDENTIAL);
		expect(statSync(paths.credentialPath).mode & 0o777).toBe(0o600);
	});

	test("returns null when absent and deletes only when present", () => {
		const paths = getWorkstationPaths(home);
		expect(readCredential(paths)).toBeNull();
		expect(deleteCredential(paths)).toBe(false);
	});

	test("deletes an existing credential and keeps the installation", async () => {
		const paths = getWorkstationPaths(home);
		await ensureInstallationId(paths);
		await writeCredential(paths, CREDENTIAL);
		expect(deleteCredential(paths)).toBe(true);
		expect(existsSync(paths.credentialPath)).toBe(false);
		expect(readInstallationId(paths)).toBeTruthy();
	});

	test("rejects corrupt JSON", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.credentialPath, "not json");
		expect(() => readCredential(paths)).toThrow();
	});

	test("rejects a non-object credential", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.credentialPath, "3");
		expect(() => readCredential(paths)).toThrow(/corrupt/);
	});

	test("rejects an invalid workstation id", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.credentialPath, JSON.stringify({ ...CREDENTIAL, workstation_id: "x" }));
		expect(() => readCredential(paths)).toThrow(/workstation_id/);
	});

	test("rejects an untrusted worker url", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(
			paths.credentialPath,
			JSON.stringify({ ...CREDENTIAL, worker_url: "http://example.com" }),
		);
		expect(() => readCredential(paths)).toThrow(/worker_url/);
	});

	test("rejects a non-batw token", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.credentialPath, JSON.stringify({ ...CREDENTIAL, token: "bat_x" }));
		expect(() => readCredential(paths)).toThrow(/token/);
	});

	test("restricts the directory before the secret is written", async () => {
		const paths = getWorkstationPaths(home);
		const acl = vi.fn(async () => {
			expect(existsSync(paths.credentialPath)).toBe(false);
		});
		await writeCredential(paths, CREDENTIAL, { acl });
		expect(acl).toHaveBeenCalledWith(paths.dir);
	});

	test("fails closed when the directory ACL is denied", async () => {
		const paths = getWorkstationPaths(home);
		const acl = vi.fn().mockRejectedValue(new Error("icacls failed"));
		await expect(writeCredential(paths, CREDENTIAL, { acl })).rejects.toThrow(/icacls failed/);
		expect(existsSync(paths.credentialPath)).toBe(false);
	});

	test("writes with 0600 and repairs an existing permissive file", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		chmodSync(paths.credentialPath, 0o644);
		readCredential(paths);
		expect(statSync(paths.credentialPath).mode & 0o777).toBe(0o600);
	});
});

describe("worker url policy", () => {
	test("accepts https origins and loopback http", () => {
		expect(isAcceptableWorkerUrl("https://bat.hexly.ai")).toBe(true);
		expect(isAcceptableWorkerUrl("https://bat-ingest.worker.hexly.ai/")).toBe(true);
		expect(isAcceptableWorkerUrl("http://127.0.0.1:8787")).toBe(true);
		expect(isAcceptableWorkerUrl("http://[::1]:8787/")).toBe(true);
		expect(isAcceptableWorkerUrl("http://localhost:8787")).toBe(true);
	});

	test("rejects paths, queries, credentials and remote http", () => {
		expect(isAcceptableWorkerUrl("https://bat.hexly.ai/api")).toBe(false);
		expect(isAcceptableWorkerUrl("https://bat.hexly.ai?x=1")).toBe(false);
		expect(isAcceptableWorkerUrl("https://user:pass@bat.hexly.ai")).toBe(false);
		expect(isAcceptableWorkerUrl("http://bat.hexly.ai")).toBe(false);
		expect(isAcceptableWorkerUrl("not a url")).toBe(false);
		expect(isAcceptableWorkerUrl("ftp://127.0.0.1")).toBe(false);
	});
});

describe("schedule record", () => {
	test("round-trips and deletes", () => {
		const paths = getWorkstationPaths(home);
		expect(readScheduleRecord(paths)).toBeNull();
		writeScheduleRecord(paths, { backend: "launchd", installed_at: 1700000000 });
		expect(readScheduleRecord(paths)).toStrictEqual({
			backend: "launchd",
			installed_at: 1700000000,
		});
		expect(deleteScheduleRecord(paths)).toBe(true);
		expect(readScheduleRecord(paths)).toBeNull();
		expect(deleteScheduleRecord(paths)).toBe(false);
	});

	test("rejects unknown backends and corrupt files", () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.schedulePath, JSON.stringify({ backend: "at", installed_at: 1 }));
		expect(() => readScheduleRecord(paths)).toThrow(/corrupt/);
		writeFileSync(paths.schedulePath, "[]");
		expect(() => readScheduleRecord(paths)).toThrow(/corrupt/);
		writeFileSync(paths.schedulePath, JSON.stringify({ backend: "cron", installed_at: "x" }));
		expect(() => readScheduleRecord(paths)).toThrow(/corrupt/);
	});
});

describe("tokens and ACL", () => {
	test("masks the token without revealing it", () => {
		expect(maskToken(TOKEN)).toBe("batw_aaaa…aaaa");
		expect(maskToken(TOKEN)).not.toBe(TOKEN);
	});

	test("restricts a Windows ACL with argv-only icacls", async () => {
		vi.stubEnv("USERNAME", "tester");
		const exec = vi.fn().mockResolvedValue({ code: 0, signal: null, stdout: "", stderr: "" });
		await restrictWindowsAcl("C:\\cfg", exec);
		expect(exec).toHaveBeenCalledWith(
			"icacls",
			["C:\\cfg", "/inheritance:r", "/grant:r", "tester:F", "/T"],
			{},
		);
	});

	test("fails the ACL when icacls fails or USERNAME is missing", async () => {
		vi.stubEnv("USERNAME", "tester");
		const failing = vi.fn().mockResolvedValue({
			code: 1,
			signal: null,
			stdout: "",
			stderr: "denied",
		});
		await expect(restrictWindowsAcl("C:\\cfg", failing)).rejects.toThrow(/icacls failed: denied/);

		const silent = vi.fn().mockResolvedValue({ code: 2, signal: null, stdout: "", stderr: "" });
		await expect(restrictWindowsAcl("C:\\cfg", silent)).rejects.toThrow(/icacls failed: exit 2/);

		vi.stubEnv("USERNAME", "");
		const missing = vi.fn();
		await expect(restrictWindowsAcl("C:\\cfg", missing)).rejects.toThrow(/USERNAME/);
		expect(missing).not.toHaveBeenCalled();
	});
});

describe("serialized credential file", () => {
	test("is pretty printed JSON with a trailing newline", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		const raw = readFileSync(paths.credentialPath, "utf-8");
		expect(raw.endsWith("\n")).toBe(true);
		expect(JSON.parse(raw)).toStrictEqual(CREDENTIAL);
	});
});
