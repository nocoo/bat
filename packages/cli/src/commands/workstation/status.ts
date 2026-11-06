// bat workstation status — read-only summary of the local workstation profile.

import { existsSync } from "node:fs";
import { defineCommand } from "@nocoo/base-cli";
import { info, warn } from "../../lib/output.js";
import type { CommandExecutor } from "../../workstation/scheduler/exec.js";
import { runCommand } from "../../workstation/scheduler/exec.js";
import { buildScheduleContext, type ScheduleContext } from "../../workstation/scheduler/plan.js";
import {
	getWorkstationPaths,
	maskToken,
	readCredential,
	readInstallationId,
	type WorkstationPaths,
} from "../../workstation/store.js";
import { readScheduleStatus } from "./setup.js";

export interface StatusDeps {
	paths?: WorkstationPaths;
	context?: ScheduleContext;
	exec?: CommandExecutor;
}

export async function runStatusCommand(deps: StatusDeps = {}): Promise<number> {
	const paths = deps.paths ?? getWorkstationPaths();
	const exec = deps.exec ?? runCommand;
	const context = deps.context ?? buildScheduleContext();

	try {
		const installationId = readInstallationId(paths);
		info(`Installation: ${installationId ?? "not initialised"}`);

		const credential = readCredential(paths);
		if (credential) {
			info(`Workstation: ${credential.workstation_id}`);
			info(`Ingest: ${credential.worker_url}`);
			info(`Token: ${maskToken(credential.token)}`);
		} else {
			info("Workstation: not logged in — run 'bat workstation login'");
		}

		if (existsSync(paths.lockPath)) {
			warn(
				`Probe lock present: ${paths.lockPath} — a probe may be running. A stale lock is recovered automatically after three minutes.`,
			);
		}

		const schedule = await readScheduleStatus(paths, context, exec);
		if (!schedule) {
			info("Schedule: not installed — run 'bat workstation setup'");
		} else {
			info(
				`Schedule: ${schedule.backend} ${schedule.installed ? "installed" : "missing registration"}`,
			);
			for (const file of schedule.files) {
				info(`  file: ${file}`);
			}
			if (!schedule.installed) {
				warn("The recorded schedule is not registered — re-run 'bat workstation setup'.");
			}
		}
		return 0;
	} catch (err) {
		warn((err as Error).message);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "status",
		description: "Show the workstation profile and schedule",
	},
	async run() {
		process.exitCode = await runStatusCommand();
	},
});
