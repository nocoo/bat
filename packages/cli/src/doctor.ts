// `bat doctor` — local self-check.
//
// Every check is a pure decision over injected facts so the output can be tested
// without a network, a schedule or a credential. A check that cannot run offline
// reports `warn`, never a fabricated pass.

import type { WorkstationTargetsResponse } from "@bat/shared";
import { isWorkstationToken } from "@bat/shared";
import type { BatCliConfig } from "./lib/config.js";
import { validateConfig } from "./lib/config.js";
import { AuthError, NetworkError } from "./lib/http.js";
import { compareVersions } from "./lib/registry.js";
import type { InspectResult } from "./workstation/scheduler/index.js";
import type { ScheduleContext, SchedulerBackend } from "./workstation/scheduler/plan.js";
import {
	isAcceptableWorkerUrl,
	type WorkstationCredential,
	type WorkstationPaths,
} from "./workstation/store.js";

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
	id: string;
	label: string;
	status: CheckStatus;
	detail: string;
}

export interface DoctorFacts {
	version: string;
	nodeVersion: string;
	latestVersion: string | null;
	paths: WorkstationPaths;
	assetsConfig: BatCliConfig | null;
	assetsConfigPath: string;
	assetsTokenValid: boolean | null;
	installationId: string | null;
	credential: WorkstationCredential | null;
	workstationReachable: number | null;
	/** Non-auth failure text when the ingest call itself broke. */
	workstationError?: string | null;
	scheduleRecord: { backend: SchedulerBackend; installed: boolean } | null;
	probeLocked: boolean;
	logAgeSeconds: number | null;
	/** Ingest origin this build trusts; a different stored origin is suspicious. */
	expectedMachineOrigin: string | undefined;
}

const MIN_NODE_MAJOR = 22;
const STALE_LOG_SECONDS = 30 * 60;

function nodeMajor(version: string): number {
	const major = Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "0", 10);
	return Number.isFinite(major) ? major : 0;
}

export function runChecks(facts: DoctorFacts): CheckResult[] {
	const checks: CheckResult[] = [];

	const major = nodeMajor(facts.nodeVersion);
	checks.push({
		id: "node",
		label: "Node runtime",
		status: major >= MIN_NODE_MAJOR ? "pass" : "fail",
		detail: `${facts.nodeVersion} (requires ${MIN_NODE_MAJOR}+)`,
	});

	if (facts.latestVersion === null) {
		checks.push({
			id: "version",
			label: "CLI version",
			status: "warn",
			detail: `${facts.version} — latest version unknown (offline)`,
		});
	} else {
		const outdated = compareVersions(facts.version, facts.latestVersion) < 0;
		checks.push({
			id: "version",
			label: "CLI version",
			status: outdated ? "warn" : "pass",
			detail: outdated
				? `${facts.version} — ${facts.latestVersion} available (run 'bat update')`
				: `${facts.version} (latest)`,
		});
	}

	if (facts.assetsConfig === null) {
		checks.push({
			id: "assets-profile",
			label: "Assets profile",
			status: "warn",
			detail: `not configured at ${facts.assetsConfigPath} (optional; run 'bat login')`,
		});
	} else {
		const invalid = validateConfig(facts.assetsConfig);
		if (invalid !== null) {
			checks.push({
				id: "assets-profile",
				label: "Assets profile",
				status: "fail",
				detail: invalid,
			});
		} else if (facts.assetsTokenValid === null) {
			checks.push({
				id: "assets-profile",
				label: "Assets profile",
				status: "warn",
				detail: "configured; token not verified offline",
			});
		} else {
			checks.push({
				id: "assets-profile",
				label: "Assets profile",
				status: facts.assetsTokenValid ? "pass" : "fail",
				detail: facts.assetsTokenValid
					? `token accepted · ${facts.assetsConfig.worker_url}`
					: "token rejected — run 'bat login'",
			});
		}
	}

	checks.push({
		id: "installation",
		label: "Installation id",
		status: facts.installationId === null ? "warn" : "pass",
		detail: facts.installationId ?? "not initialised (created by the first login)",
	});

	const credential = facts.credential;
	if (credential === null) {
		checks.push({
			id: "workstation-credential",
			label: "Workstation key",
			status: "warn",
			detail: "not enrolled — run 'bat workstation login'",
		});
	} else {
		const problems: string[] = [];
		if (!isWorkstationToken(credential.token)) {
			problems.push("token is not a batw_ key");
		}
		if (!isAcceptableWorkerUrl(credential.worker_url)) {
			problems.push("stored ingest origin is not a clean http(s) origin");
		}
		const unexpectedOrigin =
			problems.length === 0 &&
			facts.expectedMachineOrigin !== undefined &&
			credential.worker_url !== facts.expectedMachineOrigin;
		checks.push({
			id: "workstation-credential",
			label: "Workstation key",
			status: problems.length > 0 ? "fail" : unexpectedOrigin ? "warn" : "pass",
			detail:
				problems.length > 0
					? problems.join(" · ")
					: unexpectedOrigin
						? `${credential.workstation_id} · ${credential.worker_url} (this build expects ${facts.expectedMachineOrigin})`
						: `${credential.workstation_id} · ${credential.worker_url}`,
		});
		if (facts.workstationReachable === null) {
			checks.push({
				id: "workstation-api",
				label: "Ingest reachability",
				status: "warn",
				detail: facts.workstationError
					? `request failed: ${facts.workstationError}`
					: "not checked offline",
			});
		} else {
			checks.push({
				id: "workstation-api",
				label: "Ingest reachability",
				status: "pass",
				detail: `${facts.workstationReachable} authorized target(s) accepted the key`,
			});
		}
	}

	if (facts.scheduleRecord === null) {
		checks.push({
			id: "schedule",
			label: "Schedule",
			status: "warn",
			detail: "not installed — run 'bat workstation setup'",
		});
	} else {
		checks.push({
			id: "schedule",
			label: "Schedule",
			status: facts.scheduleRecord.installed ? "pass" : "fail",
			detail: facts.scheduleRecord.installed
				? `${facts.scheduleRecord.backend} registered`
				: `${facts.scheduleRecord.backend} recorded but missing — re-run 'bat workstation setup'`,
		});
	}

	checks.push({
		id: "probe-lock",
		label: "Probe lock",
		status: facts.probeLocked ? "warn" : "pass",
		detail: facts.probeLocked
			? `lock present at ${facts.paths.lockPath} — a probe may be running`
			: "free",
	});

	if (facts.logAgeSeconds !== null) {
		const stale = facts.logAgeSeconds > STALE_LOG_SECONDS;
		checks.push({
			id: "recent-report",
			label: "Recent report",
			status: stale ? "warn" : "pass",
			detail: stale
				? `last log write ${Math.round(facts.logAgeSeconds / 60)} min ago — check the schedule`
				: `last log write ${Math.round(facts.logAgeSeconds / 60)} min ago`,
		});
	}

	return checks;
}

export function summarise(checks: readonly CheckResult[]): {
	failed: number;
	warned: number;
	exitCode: number;
} {
	const failed = checks.filter((check) => check.status === "fail").length;
	const warned = checks.filter((check) => check.status === "warn").length;
	return { failed, warned, exitCode: failed === 0 ? 0 : 1 };
}

// --- fact gathering -------------------------------------------------------

export interface GatherDeps {
	version: string;
	nodeVersion: string;
	paths: WorkstationPaths;
	assetsConfig: BatCliConfig | null;
	assetsConfigPath: string;
	installationId: string | null;
	credential: WorkstationCredential | null;
	scheduleRecord: { backend: SchedulerBackend; installed: boolean } | null;
	probeLocked: boolean;
	logAgeSeconds: number | null;
	expectedMachineOrigin: string | undefined;
	fetchImpl?: typeof fetch;
	offline?: boolean;
	currentAssetsTokenCheck?: () => Promise<boolean>;
	targets?: (workerUrl: string, token: string) => Promise<WorkstationTargetsResponse>;
	fetchLatest?: (fetchImpl: typeof fetch) => Promise<{ version: string }>;
}

export async function gatherFacts(deps: GatherDeps): Promise<DoctorFacts> {
	const fetchImpl = deps.fetchImpl ?? fetch;
	const offline = deps.offline === true;
	let latestVersion: string | null = null;
	if (!offline) {
		try {
			const lookup = await (deps.fetchLatest?.(fetchImpl) ?? defaultLatest(fetchImpl));
			latestVersion = lookup.version;
		} catch {
			latestVersion = null;
		}
	}

	let assetsTokenValid: boolean | null = null;
	if (!offline && deps.assetsConfig !== null && deps.currentAssetsTokenCheck !== undefined) {
		try {
			assetsTokenValid = await deps.currentAssetsTokenCheck();
		} catch (err) {
			// Only a rejected credential is a failure; a broken network is unverified.
			assetsTokenValid = err instanceof AuthError ? false : null;
		}
	}

	let workstationReachable: number | null = null;
	let workstationError: string | null = null;
	if (!offline && deps.credential !== null) {
		try {
			const targets = await (deps.targets
				? deps.targets(deps.credential.worker_url, deps.credential.token)
				: defaultTargets(deps.credential.worker_url, deps.credential.token, fetchImpl));
			workstationReachable = targets.data.length;
		} catch (err) {
			if (err instanceof AuthError || err instanceof NetworkError) {
				workstationReachable = -1;
			} else {
				workstationError = (err as Error).message;
			}
		}
	}

	return {
		version: deps.version,
		nodeVersion: deps.nodeVersion,
		latestVersion,
		paths: deps.paths,
		assetsConfig: deps.assetsConfig,
		assetsConfigPath: deps.assetsConfigPath,
		assetsTokenValid,
		installationId: deps.installationId,
		credential: deps.credential,
		workstationReachable: workstationReachable === -1 ? null : workstationReachable,
		workstationError,
		scheduleRecord: deps.scheduleRecord,
		probeLocked: deps.probeLocked,
		logAgeSeconds: deps.logAgeSeconds,
		expectedMachineOrigin: deps.expectedMachineOrigin,
	};
}

async function defaultLatest(fetchImpl: typeof fetch): Promise<{ version: string }> {
	const { fetchLatestVersion } = await import("./lib/registry.js");
	return await fetchLatestVersion(fetchImpl);
}

async function defaultTargets(
	workerUrl: string,
	token: string,
	fetchImpl: typeof fetch,
): Promise<WorkstationTargetsResponse> {
	const { fetchTargets } = await import("./workstation/api.js");
	return await fetchTargets(workerUrl, token, { fetchImpl });
}

export type { InspectResult, ScheduleContext };
