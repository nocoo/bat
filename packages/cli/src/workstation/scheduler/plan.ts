// Native per-user schedule definitions: launchd, systemd --user and Task Scheduler.
// Every file and command is ours only; nothing else is touched.

import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { WORKSTATION_INTERVAL_SECONDS } from "@bat/shared";
import { escapeXml } from "../../lib/xml.js";

export type SchedulerBackend = "launchd" | "systemd" | "cron" | "windows";

export const SCHEDULER_BACKENDS: readonly SchedulerBackend[] = [
	"launchd",
	"systemd",
	"cron",
	"windows",
] as const;

export const LAUNCHD_LABEL = "ai.hexly.bat.workstation";
export const SYSTEMD_UNIT = "ai.hexly.bat.workstation";
export const WINDOWS_TASK = "bat-workstation";

export interface ScheduleContext {
	home: string;
	nodePath: string;
	entryPath: string;
	logPath: string;
	platform: NodeJS.Platform;
	uid: number;
	intervalSeconds: number;
}

export interface PlanFile {
	path: string;
	content: string;
	mode: number;
}

export interface PlanCommand {
	argv: string[];
	tolerateFailure?: boolean;
	timeoutMs?: number;
}

export interface SchedulePlan {
	backend: SchedulerBackend;
	files: PlanFile[];
	register: PlanCommand[];
	unregister: PlanCommand[];
	/** Runs after our files are removed. */
	finalize: PlanCommand[];
}

export interface ScheduleContextDeps {
	home?: string;
	platform?: NodeJS.Platform;
	nodePath?: string;
	entryPath?: string;
	logPath?: string;
	uid?: number;
	argvEntry?: string | undefined;
}

/** Absolute, existing entry point; a scheduler must never depend on PATH or a shim. */
export function resolveEntryPath(argvEntry: string | undefined = process.argv[1]): string {
	if (!argvEntry) {
		throw new Error("cannot determine the bat entry point — run the installed CLI");
	}
	const resolved = realpathSync(argvEntry);
	return resolved;
}

/** Scheduler files are line oriented; control characters must never reach them. */
export function assertSingleLine(value: string, label: string): string {
	if (/[\r\n\0]/.test(value)) {
		throw new Error(`${label} must not contain newlines or NUL bytes`);
	}
	return value;
}

function validateContext(context: ScheduleContext): ScheduleContext {
	assertSingleLine(context.nodePath, "node path");
	assertSingleLine(context.entryPath, "entry path");
	assertSingleLine(context.logPath, "log path");
	return context;
}

export function buildScheduleContext(deps: ScheduleContextDeps = {}): ScheduleContext {
	const home = deps.home ?? homedir();
	return {
		home,
		nodePath: deps.nodePath ?? process.execPath,
		entryPath: deps.entryPath ?? resolveEntryPath(deps.argvEntry),
		logPath: deps.logPath ?? join(home, ".config", "bat", "workstation", "probe.log"),
		platform: deps.platform ?? process.platform,
		uid: deps.uid ?? process.getuid?.() ?? 501,
		intervalSeconds: WORKSTATION_INTERVAL_SECONDS,
	};
}

export function launchdPlistPath(home: string): string {
	return join(home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
}

export function systemdServicePath(home: string): string {
	return join(home, ".config", "systemd", "user", `${SYSTEMD_UNIT}.service`);
}

export function systemdTimerPath(home: string): string {
	return join(home, ".config", "systemd", "user", `${SYSTEMD_UNIT}.timer`);
}

export function launchdPlist(context: ScheduleContext): string {
	validateContext(context);
	const args = [context.nodePath, context.entryPath, "workstation", "probe"]
		.map((arg) => `\t\t<string>${escapeXml(arg)}</string>`)
		.join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${LAUNCHD_LABEL}</string>
	<key>ProgramArguments</key>
	<array>
${args}
	</array>
	<key>StartInterval</key>
	<integer>${context.intervalSeconds}</integer>
	<key>RunAtLoad</key>
	<false/>
	<key>StandardOutPath</key>
	<string>${escapeXml(context.logPath)}</string>
	<key>StandardErrorPath</key>
	<string>${escapeXml(context.logPath)}</string>
</dict>
</plist>
`;
}

/**
 * systemd expands `%` specifiers everywhere, so they are doubled. `$` is only
 * expanded in ExecStart, not in file-style settings such as StandardOutput.
 */
export function systemdValue(value: string): string {
	assertSingleLine(value, "systemd value");
	return value.replace(/\\/g, () => "\\\\").replace(/%/g, () => "%%");
}

/** ExecStart argv: environment references are expanded there, so `$` doubles. */
function systemdArgumentValue(value: string): string {
	return systemdValue(value).replace(/\$/g, () => "$$");
}

/** systemd argv quoting: escape backslash, quote, percent and dollar. */
export function systemdQuote(value: string): string {
	return `"${systemdArgumentValue(value).replace(/"/g, '\\"')}"`;
}

export function systemdServiceUnit(context: ScheduleContext): string {
	validateContext(context);
	const execStart = [context.nodePath, context.entryPath, "workstation", "probe"]
		.map(systemdQuote)
		.join(" ");
	const logPath = systemdValue(context.logPath);
	return `[Unit]
Description=bat workstation probe

[Service]
Type=oneshot
ExecStart=${execStart}
StandardOutput=append:${logPath}
StandardError=append:${logPath}
`;
}

export function systemdTimerUnit(context: ScheduleContext): string {
	validateContext(context);
	return `[Unit]
Description=bat workstation probe timer

[Timer]
OnBootSec=${context.intervalSeconds}
OnUnitActiveSec=${context.intervalSeconds}
AccuracySec=30s
Persistent=false
Unit=${SYSTEMD_UNIT}.service

[Install]
WantedBy=timers.target
`;
}

/** Windows argv quoting for Task Scheduler's /TR value. */
export function windowsCommandLine(context: ScheduleContext): string {
	validateContext(context);
	const quote = (value: string): string => `"${value.replace(/"/g, '\\"')}"`;
	return [context.nodePath, context.entryPath, "workstation", "probe"].map(quote).join(" ");
}

/**
 * Explicit battery behaviour: a laptop must still report on battery, and must not
 * be woken by the schedule. Runs only after the task exists.
 */
export const WINDOWS_BATTERY_SCRIPT = [
	"$s=Get-ScheduledTask -TaskName 'bat-workstation' | Select-Object -ExpandProperty Settings",
	"$s.DisallowStartIfOnBatteries=$false",
	"$s.StopIfGoingOnBatteries=$false",
	"$s.WakeToRun=$false",
	"Set-ScheduledTask -TaskName 'bat-workstation' -Settings $s | Out-Null",
].join("; ");

export function buildPlan(context: ScheduleContext, backend: SchedulerBackend): SchedulePlan {
	validateContext(context);
	switch (backend) {
		case "launchd": {
			const plist = launchdPlistPath(context.home);
			const domain = `gui/${context.uid}`;
			return {
				backend,
				files: [{ path: plist, content: launchdPlist(context), mode: 0o644 }],
				register: [
					{ argv: ["launchctl", "bootout", domain, plist], tolerateFailure: true },
					{ argv: ["launchctl", "bootstrap", domain, plist] },
					{ argv: ["launchctl", "enable", `${domain}/${LAUNCHD_LABEL}`] },
				],
				unregister: [{ argv: ["launchctl", "bootout", domain, plist], tolerateFailure: true }],
				finalize: [],
			};
		}
		case "systemd": {
			const service = systemdServicePath(context.home);
			const timer = systemdTimerPath(context.home);
			return {
				backend,
				files: [
					{ path: service, content: systemdServiceUnit(context), mode: 0o644 },
					{ path: timer, content: systemdTimerUnit(context), mode: 0o644 },
				],
				register: [
					{ argv: ["systemctl", "--user", "daemon-reload"] },
					{ argv: ["systemctl", "--user", "enable", "--now", `${SYSTEMD_UNIT}.timer`] },
				],
				unregister: [
					{
						argv: ["systemctl", "--user", "disable", "--now", `${SYSTEMD_UNIT}.timer`],
						tolerateFailure: true,
					},
				],
				finalize: [{ argv: ["systemctl", "--user", "daemon-reload"], tolerateFailure: true }],
			};
		}
		case "windows": {
			return {
				backend,
				files: [],
				register: [
					{
						argv: [
							"schtasks",
							"/Create",
							"/TN",
							WINDOWS_TASK,
							"/TR",
							windowsCommandLine(context),
							"/SC",
							"MINUTE",
							"/MO",
							String(context.intervalSeconds / 60),
							"/F",
							"/IT",
						],
					},
					{
						argv: [
							"powershell.exe",
							"-NoProfile",
							"-NonInteractive",
							"-Command",
							WINDOWS_BATTERY_SCRIPT,
						],
					},
				],
				unregister: [
					{ argv: ["schtasks", "/Delete", "/TN", WINDOWS_TASK, "/F"], tolerateFailure: true },
				],
				finalize: [],
			};
		}
		case "cron":
			return { backend, files: [], register: [], unregister: [], finalize: [] };
	}
}

/** Validate an explicit backend and reject a backend that this OS cannot own. */
export function resolveBackend(
	requested: string | undefined,
	platform: NodeJS.Platform,
	hasSystemd: boolean,
): SchedulerBackend {
	if (requested !== undefined) {
		if (!SCHEDULER_BACKENDS.includes(requested as SchedulerBackend)) {
			throw new Error(
				`unknown --backend "${requested}" — use one of: ${SCHEDULER_BACKENDS.join(", ")}`,
			);
		}
		const backend = requested as SchedulerBackend;
		if (backend === "launchd" && platform !== "darwin") {
			throw new Error("--backend launchd is only available on macOS");
		}
		if (backend === "windows" && platform !== "win32") {
			throw new Error("--backend windows is only available on Windows");
		}
		if (backend === "systemd" && platform !== "linux") {
			throw new Error("--backend systemd is only available on Linux");
		}
		if (backend === "cron" && platform === "win32") {
			throw new Error("--backend cron is not available on Windows");
		}
		return backend;
	}
	if (platform === "darwin") {
		return "launchd";
	}
	if (platform === "win32") {
		return "windows";
	}
	if (platform === "linux") {
		if (!hasSystemd) {
			throw new Error("systemd --user was not found; pass --backend cron to schedule with crontab");
		}
		return "systemd";
	}
	throw new Error("no automatic scheduler on this OS; pass --backend cron");
}

/** Detect a usable systemd user manager without running anything. */
export function detectSystemd(): boolean {
	return existsSync("/run/systemd/system");
}
