// bat workstation setup — install or remove the native per-user schedule.

import { WORKSTATION_INTERVAL_SECONDS } from "@bat/shared";
import { defineCommand } from "@nocoo/base-cli";
import { error, info, success, warn } from "../../lib/output.js";
import type { CommandExecutor } from "../../workstation/scheduler/exec.js";
import { runCommand } from "../../workstation/scheduler/exec.js";
import {
	inspectSchedule,
	installSchedule,
	removeSchedule,
	resolveInstallBackend,
} from "../../workstation/scheduler/index.js";
import {
	buildScheduleContext,
	detectSystemd,
	type ScheduleContext,
} from "../../workstation/scheduler/plan.js";
import {
	deleteScheduleRecord,
	getWorkstationPaths,
	readCredential,
	readScheduleRecord,
	type WorkstationPaths,
	writeScheduleRecord,
} from "../../workstation/store.js";

export interface SetupDeps {
	backend?: string;
	remove?: boolean;
	exec?: CommandExecutor;
	context?: ScheduleContext;
	paths?: WorkstationPaths;
	now?: () => number;
	hasSystemd?: boolean;
}

export async function runSetupCommand(deps: SetupDeps = {}): Promise<number> {
	const paths = deps.paths ?? getWorkstationPaths();
	const exec = deps.exec ?? runCommand;
	const context = deps.context ?? buildScheduleContext();
	try {
		const record = readScheduleRecord(paths);
		if (deps.remove) {
			if (!record) {
				warn("No workstation schedule is recorded for this machine.");
				return 0;
			}
			const result = await removeSchedule(context, backendOf(record.backend), exec);
			deleteScheduleRecord(paths);
			for (const warning of result.warnings) {
				warn(warning);
			}
			success(`Workstation schedule removed (${result.backend}).`);
			for (const path of result.removed) {
				info(`  removed: ${path}`);
			}
			return 0;
		}

		if (!readCredential(paths)) {
			error("Not logged in — run 'bat workstation login' before installing the schedule.");
			return 1;
		}

		const hasSystemd = deps.hasSystemd ?? detectSystemd();
		const requested = deps.backend ?? record?.backend;
		const target = resolveInstallBackend(context, {
			...(requested !== undefined ? { backend: requested } : {}),
			hasSystemd,
		});
		if (record && record.backend !== target) {
			error(
				`A ${record.backend} schedule is already installed; run 'bat workstation setup --remove' before installing the ${target} backend.`,
			);
			return 1;
		}

		const result = await installSchedule(context, {
			backend: target,
			exec,
			hasSystemd,
		});
		writeScheduleRecord(paths, {
			backend: result.backend,
			installed_at: Math.floor((deps.now ?? Date.now)() / 1000),
		});
		success(`Workstation schedule installed (${result.backend}).`);
		info(`  every ${WORKSTATION_INTERVAL_SECONDS}s · ${context.nodePath} ${context.entryPath}`);
		for (const file of result.files) {
			info(`  file: ${file}`);
		}
		if (result.backend === "cron") {
			info("  crontab: managed block replaced");
		}
		if (result.backend === "windows") {
			info("  task: bat-workstation (interactive user, battery allowed, no wake)");
		}
		return 0;
	} catch (err) {
		error((err as Error).message);
		return 1;
	}
}

function backendOf(value: string): Parameters<typeof removeSchedule>[1] {
	return value as Parameters<typeof removeSchedule>[1];
}

export interface SetupStatus {
	installed: boolean;
	backend: string;
	files: string[];
}

/** Shared by `status` so both commands read the same source configuration. */
export async function readScheduleStatus(
	paths: WorkstationPaths,
	context: ScheduleContext,
	exec: CommandExecutor,
): Promise<SetupStatus | null> {
	const record = readScheduleRecord(paths);
	if (!record) {
		return null;
	}
	const backend = backendOf(record.backend);
	const inspected = await inspectSchedule(context, backend, exec);
	return { installed: inspected.installed, backend: inspected.backend, files: inspected.files };
}

export default defineCommand({
	meta: {
		name: "setup",
		description: "Install or remove the 10 minute workstation probe schedule",
	},
	args: {
		backend: {
			type: "string",
			description: "Scheduler: launchd, systemd, cron or windows (explicit for non-native OS)",
		},
		remove: {
			type: "boolean",
			description: "Remove the schedule this CLI installed",
			default: false,
		},
	},
	async run({ args }) {
		process.exitCode = await runSetupCommand({
			...(args.backend ? { backend: args.backend } : {}),
			remove: args.remove === true,
		});
	},
});
