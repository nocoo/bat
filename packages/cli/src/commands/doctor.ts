// bat doctor — one read-only self-check over runtime, profiles and schedule.

import { existsSync, statSync } from "node:fs";
import { BAT_VERSION } from "@bat/shared";
import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import { type CheckResult, gatherFacts, runChecks, summarise } from "../doctor.js";
import { type BatCliConfig, createConfigManager } from "../lib/config.js";
import { AuthError, HttpClient, NetworkError } from "../lib/http.js";
import { error, info, success, warn } from "../lib/output.js";
import { resolveOrigins } from "../workstation/origins.js";
import { type CommandExecutor, runCommand } from "../workstation/scheduler/exec.js";
import { type InspectResult, inspectSchedule } from "../workstation/scheduler/index.js";
import { buildScheduleContext, type ScheduleContext } from "../workstation/scheduler/plan.js";
import {
	getWorkstationPaths,
	readCredential,
	readInstallationId,
	readScheduleRecord,
	type StoreDeps,
	type WorkstationPaths,
} from "../workstation/store.js";

export interface DoctorDeps {
	version?: string;
	nodeVersion?: string;
	paths?: WorkstationPaths;
	context?: ScheduleContext;
	exec?: CommandExecutor;
	fetchImpl?: typeof fetch;
	offline?: boolean;
	json?: boolean;
	store?: StoreDeps;
	now?: () => number;
	/** Injected for tests that need a temporary assets profile. */
	configManager?: ConfigManager<BatCliConfig>;
}

function render(check: CheckResult): void {
	const line = `${check.label}: ${check.detail}`;
	if (check.status === "pass") {
		success(line);
	} else if (check.status === "warn") {
		warn(line);
	} else {
		error(line);
	}
}

export async function runDoctorCommand(deps: DoctorDeps = {}): Promise<number> {
	const version = deps.version ?? BAT_VERSION;
	const paths = deps.paths ?? getWorkstationPaths();
	const context = deps.context ?? buildScheduleContext();
	const exec = deps.exec ?? runCommand;
	const now = deps.now ?? (() => Math.floor(Date.now() / 1000));

	const manager = deps.configManager ?? createConfigManager();
	let assetsConfig: BatCliConfig | null = null;
	if (manager.exists()) {
		try {
			assetsConfig = manager.read();
		} catch {
			assetsConfig = null;
		}
	}

	const credential = readCredential(paths, deps.store);
	let scheduleRecord: { backend: ScheduleRecordBackend; installed: boolean } | null = null;
	const recorded = readScheduleRecord(paths);
	if (recorded !== null) {
		let inspected: InspectResult;
		try {
			inspected = await inspectSchedule(context, recorded.backend as ScheduleRecordBackend, exec);
		} catch {
			inspected = {
				backend: recorded.backend as ScheduleRecordBackend,
				installed: false,
				files: [],
			};
		}
		scheduleRecord = {
			backend: recorded.backend as ScheduleRecordBackend,
			installed: inspected.installed,
		};
	}

	let logAgeSeconds: number | null = null;
	if (existsSync(paths.logPath)) {
		try {
			logAgeSeconds = Math.max(0, now() - Math.floor(statSync(paths.logPath).mtimeMs / 1000));
		} catch {
			logAgeSeconds = null;
		}
	}

	const facts = await gatherFacts({
		version,
		nodeVersion: deps.nodeVersion ?? process.version,
		paths,
		assetsConfig,
		assetsConfigPath: manager.configPath,
		installationId: readInstallationId(paths, deps.store),
		credential,
		scheduleRecord,
		probeLocked: existsSync(paths.lockPath),
		expectedMachineOrigin: resolveOrigins().machine,
		logAgeSeconds,
		...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
		...(deps.offline ? { offline: true } : {}),
		...(assetsConfig === null
			? {}
			: {
					currentAssetsTokenCheck: async () => {
						const client = new HttpClient(
							(assetsConfig as BatCliConfig).worker_url,
							(assetsConfig as BatCliConfig).api_key,
							undefined,
							undefined,
							deps.fetchImpl ?? fetch,
						);
						try {
							await client.get("/api/agents");
							return true;
						} catch (err) {
							if (err instanceof AuthError) {
								return false;
							}
							throw err instanceof NetworkError ? err : new NetworkError(String(err));
						}
					},
				}),
	});

	const checks = runChecks(facts);
	const summary = summarise(checks);

	if (deps.json === true) {
		console.log(JSON.stringify({ version, checks, ...summary }, null, 2));
		return summary.exitCode;
	}

	info(`bat ${version} · node ${facts.nodeVersion} · ${paths.dir}`);
	for (const check of checks) {
		render(check);
	}
	console.log("");
	if (summary.failed > 0) {
		error(`${summary.failed} check(s) failed, ${summary.warned} warning(s).`);
	} else if (summary.warned > 0) {
		warn(`${summary.warned} warning(s); nothing failed.`);
	} else {
		success("All checks passed.");
	}
	return summary.exitCode;
}

type ScheduleRecordBackend = "launchd" | "systemd" | "cron" | "windows";

export default defineCommand({
	meta: {
		name: "doctor",
		description: "Check the runtime, profiles, schedule and recent reports",
	},
	args: {
		offline: {
			type: "boolean",
			description: "Skip registry, token and reachability checks",
		},
		json: {
			type: "boolean",
			description: "Print machine-readable results",
		},
	},
	async run({ args }) {
		process.exitCode = await runDoctorCommand({
			...(args.offline ? { offline: true } : {}),
			...(args.json ? { json: true } : {}),
		});
	},
});
