// Install, remove and inspect the workstation schedule.
// Registration is transactional: a failed reinstall restores the previous
// working files and registration instead of deleting a valid schedule.

import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { hasManagedCron, installCron, removeCron } from "./cron.js";
import type { CommandExecutor } from "./exec.js";
import {
	buildPlan,
	detectSystemd,
	launchdPlistPath,
	type PlanCommand,
	resolveBackend,
	type ScheduleContext,
	type SchedulePlan,
	type SchedulerBackend,
	systemdServicePath,
	systemdTimerPath,
	WINDOWS_TASK,
} from "./plan.js";

/** Failures that mean "there was nothing registered", not "removal failed". */
const ALREADY_ABSENT =
	/not found|could not find|no such|not loaded|not registered|not running|does not exist|unknown/i;

export interface InstallScheduleOptions {
	backend?: string;
	exec: CommandExecutor;
	hasSystemd?: boolean;
}

export interface InstallResult {
	backend: SchedulerBackend;
	files: string[];
}

export interface RemoveResult {
	backend: SchedulerBackend;
	removed: string[];
	warnings: string[];
}

export interface InspectResult {
	backend: SchedulerBackend;
	installed: boolean;
	files: string[];
}

function describe(command: PlanCommand): string {
	return command.argv.join(" ");
}

function failureDetail(result: Awaited<ReturnType<CommandExecutor>>): string {
	return result.stderr.trim() || result.stdout.trim() || `exit ${result.code ?? "null"}`;
}

async function runCommandOrThrow(exec: CommandExecutor, command: PlanCommand): Promise<void> {
	const result = await exec(command.argv[0] as string, command.argv.slice(1), {
		timeoutMs: command.timeoutMs ?? 15_000,
	});
	if (result.spawnError) {
		throw new Error(`${command.argv[0]} could not start: ${result.spawnError}`);
	}
	if (result.code !== 0 && !command.tolerateFailure) {
		throw new Error(`${describe(command)} failed: ${failureDetail(result)}`);
	}
}

/** Unregister, tolerating only "nothing registered" answers. */
async function runUnregister(exec: CommandExecutor, command: PlanCommand): Promise<string | null> {
	const result = await exec(command.argv[0] as string, command.argv.slice(1), {
		timeoutMs: command.timeoutMs ?? 15_000,
	});
	if (result.spawnError) {
		throw new Error(`${command.argv[0]} could not start: ${result.spawnError}`);
	}
	if (result.code === 0) {
		return null;
	}
	const detail = failureDetail(result);
	if (ALREADY_ABSENT.test(detail)) {
		return `${describe(command)}: ${detail}`;
	}
	throw new Error(`${describe(command)} failed: ${detail}`);
}

/** Resolve the backend that would be installed right now. */
export function resolveInstallBackend(
	context: ScheduleContext,
	options: Pick<InstallScheduleOptions, "backend" | "hasSystemd">,
): SchedulerBackend {
	return resolveBackend(options.backend, context.platform, options.hasSystemd ?? detectSystemd());
}

function writePlanFiles(plan: SchedulePlan): string[] {
	const written: string[] = [];
	for (const file of plan.files) {
		mkdirSync(dirname(file.path), { recursive: true });
		writeFileSync(file.path, file.content, { mode: file.mode });
		written.push(file.path);
	}
	return written;
}

interface PreviousFile {
	path: string;
	content: string;
}

function snapshotPlanFiles(plan: SchedulePlan): PreviousFile[] {
	const snapshot: PreviousFile[] = [];
	for (const file of plan.files) {
		if (existsSync(file.path)) {
			snapshot.push({ path: file.path, content: readFileSync(file.path, "utf-8") });
		}
	}
	return snapshot;
}

function restoreFiles(files: readonly PreviousFile[]): void {
	for (const file of files) {
		mkdirSync(dirname(file.path), { recursive: true });
		writeFileSync(file.path, file.content, { mode: 0o644 });
	}
}

/**
 * Locale-independent task existence and XML through the Task Scheduler COM API.
 * The command is constant; the task name travels in the environment. Known
 * not-found HRESULTs are reported structurally, every other failure as an error.
 */
export const WINDOWS_TASK_SNAPSHOT_SCRIPT = [
	"$ErrorActionPreference='Stop'",
	"$result=[ordered]@{exists=$false;xml=$null;notFound=$false;error=$null;hresult=$null}",
	"try{",
	"$service=New-Object -ComObject Schedule.Service",
	"$service.Connect()",
	"$task=$service.GetFolder('\\').GetTask($env:BAT_TASK_NAME)",
	"$result.exists=$true",
	"$result.xml=$task.Xml",
	"}catch{",
	"$ex=$_.Exception",
	"while(($ex.GetType().FullName -eq 'System.Management.Automation.MethodInvocationException') -and $ex.InnerException){$ex=$ex.InnerException}",
	"try{$hr=[int64]$ex.HResult -band 0xFFFFFFFF}catch{$hr=0}",
	"$result.hresult=('0x{0:X8}' -f $hr)",
	"if($hr -eq 0x80070002 -or $hr -eq 0x8004130F){$result.notFound=$true}else{$result.error=$ex.Message}",
	"}",
	"ConvertTo-Json -Compress -InputObject $result",
].join("\n");

export interface WindowsTaskSnapshot {
	exists: boolean;
	xml: string | null;
	notFound: boolean;
	error: string | null;
	hresult: string | null;
}

/** Parse the structured COM result; malformed output is an error, never absence. */
export function parseWindowsTaskSnapshot(stdout: string): WindowsTaskSnapshot {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout.trim());
	} catch {
		throw new Error("task query returned invalid JSON");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("task query returned an invalid payload");
	}
	const record = parsed as Record<string, unknown>;
	if (typeof record.exists !== "boolean" || typeof record.notFound !== "boolean") {
		throw new Error("task query returned an incomplete payload");
	}
	return {
		exists: record.exists,
		xml: typeof record.xml === "string" ? record.xml : null,
		notFound: record.notFound,
		error: typeof record.error === "string" && record.error.length > 0 ? record.error : null,
		hresult: typeof record.hresult === "string" ? record.hresult : null,
	};
}

/**
 * Windows has no plan files: the previous task definition is its state.
 * Only the structured not-found answer may return null; any other snapshot
 * failure must abort before the task is replaced or deleted.
 */
async function snapshotWindowsTask(exec: CommandExecutor): Promise<string | null> {
	const result = await exec(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-Command", WINDOWS_TASK_SNAPSHOT_SCRIPT],
		{ env: { BAT_TASK_NAME: WINDOWS_TASK }, timeoutMs: 10_000 },
	);
	if (result.spawnError) {
		throw new Error(`task query could not start: ${result.spawnError}`);
	}
	if (result.timedOut) {
		throw new Error("task query timed out; refusing to replace the task");
	}
	if (result.aborted) {
		throw new Error("task query was cancelled; refusing to replace the task");
	}
	const snapshot = parseWindowsTaskSnapshot(result.stdout);
	if (snapshot.error) {
		const code = snapshot.hresult ? ` (${snapshot.hresult})` : "";
		throw new Error(`task query failed: ${snapshot.error}${code}`);
	}
	if (snapshot.notFound) {
		return null;
	}
	if (!snapshot.exists) {
		throw new Error("task query returned no existence flag; refusing to replace the task");
	}
	if (!snapshot.xml || !/<Task\b/.test(snapshot.xml)) {
		throw new Error("task query returned no task XML; refusing to replace the task");
	}
	return snapshot.xml;
}

async function restoreWindowsTask(
	exec: CommandExecutor,
	xml: string,
	backupPath: string,
): Promise<void> {
	mkdirSync(dirname(backupPath), { recursive: true });
	writeFileSync(backupPath, xml, { mode: 0o600 });
	try {
		const result = await exec(
			"schtasks",
			["/Create", "/TN", WINDOWS_TASK, "/XML", backupPath, "/F"],
			{ timeoutMs: 15_000 },
		);
		if (result.spawnError) {
			throw new Error(`schtasks could not start: ${result.spawnError}`);
		}
		if (result.code !== 0) {
			throw new Error(`restoring the task failed: ${failureDetail(result)}`);
		}
	} finally {
		try {
			unlinkSync(backupPath);
		} catch {
			// The backup file is already gone.
		}
	}
}

function removeFiles(paths: readonly string[]): string[] {
	const removed: string[] = [];
	for (const path of paths) {
		if (existsSync(path)) {
			rmSync(path, { force: true });
			removed.push(path);
		}
	}
	return removed;
}

/** Re-register a previously working schedule after a failed reinstall. */
async function restoreRegistration(exec: CommandExecutor, plan: SchedulePlan): Promise<void> {
	for (const command of plan.register) {
		try {
			await runCommandOrThrow(exec, { ...command, tolerateFailure: true });
		} catch {
			// Best effort restore; the original failure is the useful error.
		}
	}
}

/** Install or refresh the schedule; safe to run repeatedly. */
export async function installSchedule(
	context: ScheduleContext,
	options: InstallScheduleOptions,
): Promise<InstallResult> {
	const backend = resolveInstallBackend(context, options);
	if (backend === "cron") {
		await installCron(options.exec, context);
		return { backend, files: [] };
	}

	const plan = buildPlan(context, backend);
	const previous = snapshotPlanFiles(plan);
	const previousTask = backend === "windows" ? await snapshotWindowsTask(options.exec) : null;
	const written = writePlanFiles(plan);
	try {
		for (const command of plan.register) {
			await runCommandOrThrow(options.exec, command);
		}
	} catch (err) {
		if (backend === "windows" && previousTask !== null) {
			const backupPath = join(context.home, ".config", "bat", "workstation", "task-backup.xml");
			try {
				await restoreWindowsTask(options.exec, previousTask, backupPath);
			} catch (restoreErr) {
				throw new Error(
					`${(err as Error).message}; restoring the previous task also failed: ${(restoreErr as Error).message}`,
				);
			}
		} else if (previous.length > 0) {
			restoreFiles(previous);
			await restoreRegistration(options.exec, plan);
			removeFiles(written.filter((path) => !previous.some((file) => file.path === path)));
		} else {
			for (const command of plan.unregister) {
				try {
					await runUnregister(options.exec, command);
				} catch {
					// Best effort rollback; the original error is the useful one.
				}
			}
			removeFiles(written);
		}
		throw err;
	}
	return { backend, files: written };
}

/** Remove only the files and units this CLI owns. */
export async function removeSchedule(
	context: ScheduleContext,
	backend: SchedulerBackend,
	exec: CommandExecutor,
): Promise<RemoveResult> {
	if (backend === "cron") {
		const removed = await removeCron(exec);
		return {
			backend,
			removed: [],
			warnings: removed ? [] : ["no workstation cron block found"],
		};
	}

	if (backend === "windows") {
		const warnings: string[] = [];
		const existing = await snapshotWindowsTask(exec);
		if (existing === null) {
			warnings.push("no workstation task found");
		} else {
			const result = await exec("schtasks", ["/Delete", "/TN", WINDOWS_TASK, "/F"], {
				timeoutMs: 15_000,
			});
			if (result.spawnError) {
				throw new Error(`schtasks could not start: ${result.spawnError}`);
			}
			if (result.code !== 0) {
				throw new Error(`schtasks /Delete failed: ${failureDetail(result)}`);
			}
		}
		return { backend, removed: [], warnings };
	}

	const plan = buildPlan(context, backend);
	const warnings: string[] = [];
	for (const command of plan.unregister) {
		const alreadyAbsent = await runUnregister(exec, command);
		if (alreadyAbsent) {
			warnings.push(alreadyAbsent);
		}
	}

	const removed = removeFiles(plan.files.map((file) => file.path));
	if (removed.length === 0) {
		warnings.push("no workstation schedule files found");
	}

	for (const command of plan.finalize) {
		try {
			await runCommandOrThrow(exec, { ...command, tolerateFailure: true });
		} catch (err) {
			warnings.push((err as Error).message);
		}
	}
	return { backend, removed, warnings };
}

/** Read only local source configuration; never mutates system state. */
export async function inspectSchedule(
	context: ScheduleContext,
	backend: SchedulerBackend,
	exec: CommandExecutor,
): Promise<InspectResult> {
	if (backend === "cron") {
		return { backend, installed: await hasManagedCron(exec), files: [] };
	}
	if (backend === "windows") {
		const xml = await snapshotWindowsTask(exec);
		return { backend, installed: xml !== null, files: [] };
	}
	const files =
		backend === "launchd"
			? [launchdPlistPath(context.home)]
			: [systemdServicePath(context.home), systemdTimerPath(context.home)];
	return { backend, installed: files.every((path) => existsSync(path)), files };
}
