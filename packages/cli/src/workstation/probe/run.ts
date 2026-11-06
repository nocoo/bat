// One workstation probe cycle: lock, targets, collection, upload.
// Everything shares one absolute deadline; nothing may outlive it.

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { cpus } from "node:os";
import {
	BAT_VERSION,
	validateWorkstationReport,
	WORKSTATION_BODY_MAX_BYTES,
	WORKSTATION_INTERVAL_SECONDS,
	WORKSTATION_LIMITS,
	WORKSTATION_MAX_RUN_MS,
	WORKSTATION_MAX_TARGETS,
	WORKSTATION_PING_COUNT,
	type WorkstationConnectivity,
	type WorkstationDisk,
	type WorkstationInterface,
	type WorkstationMemory,
	type WorkstationReportInput,
	type WorkstationTarget,
} from "@bat/shared";
import { info, error as printError, success } from "../../lib/output.js";
import { fetchTargets, uploadReport } from "../api.js";
import { createDeadline, type Deadline } from "../deadline.js";
import type { CommandExecutor } from "../scheduler/exec.js";
import { runCommand } from "../scheduler/exec.js";
import type { WorkstationCredential, WorkstationPaths } from "../store.js";
import { readCredential } from "../store.js";
import { acquireProbeLock, type LockHandle } from "./lock.js";
import { pingTarget } from "./ping.js";
import {
	type CpuSnapshot,
	collectDisks,
	collectIdentity,
	collectMemory,
	collectNetwork,
	cpuModel,
	cpuSampleDelay,
	cpuUsagePct,
	type DiskCollection,
	type Identity,
	snapshotCpu,
} from "./system.js";

/** Each target gets a bounded slice of the run budget. */
export const PING_TARGET_BUDGET_MS = 5000;
/** Targets are probed concurrently, never more than this many at a time. */
export const PROBE_CONCURRENCY = 8;
/** Time kept aside for the report upload and its retries. */
export const UPLOAD_RESERVE_MS = 20_000;

export interface SystemCollector {
	identity: () => Identity;
	cpuBefore: () => CpuSnapshot;
	cpuAfter: () => CpuSnapshot;
	cpuModel: () => string;
	cpuCount: () => number;
	wait: (signal?: AbortSignal) => Promise<void>;
	memory: (signal?: AbortSignal) => Promise<WorkstationMemory>;
	disks: (signal?: AbortSignal) => Promise<DiskCollection>;
	network: () => WorkstationInterface[];
}

export function defaultCollector(): SystemCollector {
	return {
		identity: () => collectIdentity(),
		cpuBefore: () => snapshotCpu(),
		cpuAfter: () => snapshotCpu(),
		cpuModel: () => cpuModel(),
		cpuCount: () => cpus().length,
		wait: (signal?: AbortSignal) => cpuSampleDelay(signal),
		memory: (signal?: AbortSignal) => collectMemory(signal ? { signal } : {}),
		disks: (signal?: AbortSignal) => collectDisks(signal ? { signal } : {}),
		network: () => collectNetwork(),
	};
}

export interface ProbeOutput {
	info: (message: string) => void;
	success: (message: string) => void;
	error: (message: string) => void;
}

const defaultOutput: ProbeOutput = { info, success, error: printError };

export interface ProbeDeps {
	paths: WorkstationPaths;
	credential?: WorkstationCredential | null;
	exec?: CommandExecutor;
	platform?: NodeJS.Platform;
	/** Wall clock in epoch milliseconds, used for report timestamps. */
	now?: () => number;
	/** Shared budget; created from the shared maximum when absent. */
	deadline?: Deadline;
	collector?: SystemCollector;
	fetchTargets?: typeof fetchTargets;
	upload?: typeof uploadReport;
	ping?: typeof pingTarget;
	output?: ProbeOutput;
	/** Injectable lock acquisition (tests). */
	acquireLock?: (path: string) => Promise<LockHandle | null>;
}

export interface ProbeOutcome {
	exitCode: number;
	report?: WorkstationReportInput;
	targetsError?: string | null;
}

export interface ProbeFunctions {
	fetchTargets: typeof fetchTargets;
	upload: typeof uploadReport;
	ping: typeof pingTarget;
}

/** Resolve injectable probe functions; defaults are referenced, never executed here. */
export function resolveProbeFunctions(
	deps: Pick<ProbeDeps, "fetchTargets" | "upload" | "ping">,
): ProbeFunctions {
	return {
		fetchTargets: deps.fetchTargets ?? fetchTargets,
		upload: deps.upload ?? uploadReport,
		ping: deps.ping ?? pingTarget,
	};
}

/** Bounded, de-duplicated collection error accumulator. */
export class ErrorList {
	private readonly items: string[] = [];

	push(message: string): void {
		const text = truncateError(message);
		if (!text || this.items.includes(text)) {
			return;
		}
		if (this.items.length >= WORKSTATION_LIMITS.collectionErrors) {
			return;
		}
		this.items.push(text);
	}

	addAll(messages: readonly string[]): void {
		for (const message of messages) {
			this.push(message);
		}
	}

	values(): string[] {
		return [...this.items];
	}

	get length(): number {
		return this.items.length;
	}
}

export function truncateError(message: string): string {
	const trimmed = message.trim();
	return trimmed.length <= WORKSTATION_LIMITS.errorText
		? trimmed
		: trimmed.slice(0, WORKSTATION_LIMITS.errorText);
}

/**
 * A target that was never probed. The shared schema always counts three sent
 * packets, so the entry is marked as a local error and explained in the
 * collection errors instead of pretending the host was unreachable.
 */
export function unprobedConnectivity(target: WorkstationTarget): WorkstationConnectivity {
	return {
		server_id: target.server_id,
		address: target.address,
		family: target.family,
		sent: WORKSTATION_PING_COUNT,
		received: 0,
		rtts_ms: [null, null, null],
		status: "error",
	};
}

/** Run `worker` over items with a fixed concurrency ceiling. */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const run = async (): Promise<void> => {
		for (;;) {
			const index = next;
			next += 1;
			if (index >= items.length) {
				return;
			}
			const item = items[index] as T;
			results[index] = await worker(item, index);
		}
	};
	const lanes = Math.max(1, Math.min(limit, items.length));
	await Promise.all(Array.from({ length: lanes }, () => run()));
	return results;
}

export interface ConnectivityDeps {
	deadline: Deadline;
	/** Probes stop when either the deadline or the lock compromise aborts. */
	signal: AbortSignal;
	exec: CommandExecutor;
	platform: NodeJS.Platform;
	ping: typeof pingTarget;
	errors: ErrorList;
}

/** Probe every target with bounded concurrency inside the run deadline. */
export async function probeConnectivity(
	targets: readonly WorkstationTarget[],
	deps: ConnectivityDeps,
): Promise<WorkstationConnectivity[]> {
	return mapWithConcurrency(targets, PROBE_CONCURRENCY, async (target) => {
		const budget = deps.deadline.remainingMs() - UPLOAD_RESERVE_MS;
		if (budget <= 0) {
			deps.errors.push(`target ${target.server_id} was not probed: the run budget was exhausted`);
			return unprobedConnectivity(target);
		}
		const perPacket = Math.max(100, Math.min(1000, Math.floor(budget / 6)));
		const outcome = await deps.ping(target, {
			exec: deps.exec,
			platform: deps.platform,
			timeoutMs: perPacket,
			childTimeoutMs: deps.deadline.childTimeoutMs(PING_TARGET_BUDGET_MS),
			signal: deps.signal,
		});
		if (outcome.localError) {
			deps.errors.push(outcome.localError);
		}
		return outcome.connectivity;
	});
}

export interface ReportParts {
	startedAtMs: number;
	finishedAtMs: number;
	sampleWindowMs: number;
	identity: Identity;
	cpu: { model: string; count: number; usage_pct: number | null };
	mem: WorkstationMemory;
	disk: WorkstationDisk[];
	network: WorkstationInterface[];
	connectivity: WorkstationConnectivity[];
	errors: string[];
	targetsError: string | null;
}

export function assembleReport(parts: ReportParts): WorkstationReportInput {
	return {
		report_id: randomUUID(),
		started_at: Math.floor(parts.startedAtMs / 1000),
		finished_at: Math.floor(parts.finishedAtMs / 1000),
		sample_window_ms: Math.min(
			WORKSTATION_MAX_RUN_MS,
			Math.max(1, Math.round(parts.sampleWindowMs)),
		),
		cli_version: BAT_VERSION.slice(0, WORKSTATION_LIMITS.cliVersion),
		hostname: parts.identity.hostname,
		os: parts.identity.os,
		arch: parts.identity.arch,
		uptime_seconds: parts.identity.uptime_seconds,
		cpu: parts.cpu,
		mem: parts.mem,
		disk: parts.disk,
		network: { interfaces: parts.network },
		connectivity: parts.connectivity,
		collection_errors: parts.errors,
		targets_error: parts.targetsError,
	};
}

function summarize(connectivity: readonly WorkstationConnectivity[]): string {
	const counts = new Map<WorkstationConnectivity["status"], number>();
	for (const entry of connectivity) {
		counts.set(entry.status, (counts.get(entry.status) ?? 0) + 1);
	}
	const order: WorkstationConnectivity["status"][] = [
		"reachable",
		"partial",
		"timeout",
		"unreachable",
		"error",
		"unsupported",
	];
	return order
		.filter((status) => (counts.get(status) ?? 0) > 0)
		.map((status) => `${status}=${counts.get(status)}`)
		.join(" ");
}

/** Execute one probe cycle and upload one report. */
export async function runWorkstationProbe(deps: ProbeDeps): Promise<ProbeOutcome> {
	const output = deps.output ?? defaultOutput;
	const now = deps.now ?? Date.now;
	const deadline = deps.deadline ?? createDeadline(WORKSTATION_MAX_RUN_MS);
	const collector = deps.collector ?? defaultCollector();
	const exec = deps.exec ?? runCommand;
	const functions = resolveProbeFunctions(deps);
	const platform = deps.platform ?? process.platform;
	const credential =
		deps.credential === undefined ? readCredential(deps.paths, { platform }) : deps.credential;
	if (!credential) {
		output.error("Not logged in — run 'bat workstation login' first.");
		return { exitCode: 1 };
	}

	mkdirSync(deps.paths.dir, { recursive: true, mode: 0o700 });
	const acquire = deps.acquireLock ?? acquireProbeLock;
	const lock = await acquire(deps.paths.lockPath);
	if (!lock) {
		output.error(
			`Another workstation probe is already running (lock: ${deps.paths.lockPath}). If it crashed, remove that directory and retry.`,
		);
		return { exitCode: 1 };
	}
	const signal = AbortSignal.any([deadline.signal, lock.signal]);

	const errors = new ErrorList();
	try {
		const startedAtMs = now();
		const cpuBefore = collector.cpuBefore();

		let targets: WorkstationTarget[] = [];
		let targetsError: string | null = null;
		try {
			const response = await functions.fetchTargets(credential.worker_url, credential.token, {
				signal,
				timeoutMs: deadline.childTimeoutMs(30_000),
			});
			targets = response.data.slice(0, WORKSTATION_MAX_TARGETS);
		} catch (err) {
			targetsError = truncateError(`targets: ${(err as Error).message}`);
			errors.push(targetsError);
		}

		await collector.wait(signal);
		const cpuAfter = collector.cpuAfter();
		const sampleWindowMs = now() - startedAtMs;
		const usage = sampleWindowMs >= 200 ? cpuUsagePct(cpuBefore, cpuAfter) : null;
		if (sampleWindowMs < 200) {
			errors.push(`cpu sample window was ${Math.round(sampleWindowMs)}ms, below 200ms`);
		}

		const [memory, disks] = await Promise.all([collector.memory(signal), collector.disks(signal)]);
		errors.addAll(disks.errors);
		const network = collector.network();
		const identity = collector.identity();

		const connectivity = await probeConnectivity(targets, {
			deadline,
			signal,
			exec,
			platform,
			ping: functions.ping,
			errors,
		});

		const compromised = lock.compromised();
		if (compromised) {
			output.error(`Probe aborted: the run lock was compromised (${compromised.message}).`);
			return { exitCode: 1, targetsError };
		}

		const report = assembleReport({
			startedAtMs,
			finishedAtMs: now(),
			sampleWindowMs: Math.max(1, sampleWindowMs),
			identity,
			cpu: {
				model: collector.cpuModel(),
				count: Math.max(1, collector.cpuCount()),
				usage_pct: usage,
			},
			mem: memory,
			disk: disks.disk,
			network,
			connectivity,
			errors: errors.values(),
			targetsError,
		});

		const validated = validateWorkstationReport(report, Math.floor(now() / 1000));
		if (!validated.ok) {
			output.error(`Report rejected locally: ${validated.error}`);
			return { exitCode: 1, report };
		}
		const payload = JSON.stringify(report);
		if (Buffer.byteLength(payload) > WORKSTATION_BODY_MAX_BYTES) {
			output.error(
				`Report is ${Buffer.byteLength(payload)} bytes; limit is ${WORKSTATION_BODY_MAX_BYTES}.`,
			);
			return { exitCode: 1, report };
		}

		try {
			const remaining = deadline.remainingMs();
			await functions.upload(credential.worker_url, credential.token, report, {
				attempts: remaining >= UPLOAD_RESERVE_MS ? 3 : 1,
				timeoutMs: deadline.childTimeoutMs(30_000),
				signal,
			});
		} catch (err) {
			output.error(`Report upload failed: ${(err as Error).message}`);
			return { exitCode: 1, report, targetsError };
		}

		output.success(
			`Report accepted: ${connectivity.length} target(s) ${summarize(connectivity) || "none"}`,
		);
		output.info(
			`  interval: ${WORKSTATION_INTERVAL_SECONDS}s · cpu ${report.cpu.usage_pct ?? "n/a"}% · errors: ${report.collection_errors.length}`,
		);
		if (targetsError) {
			output.info(`  targets unavailable: ${targetsError}`);
		}
		return { exitCode: 0, report, targetsError };
	} finally {
		try {
			await lock.release();
		} catch (err) {
			output.error(`Probe lock release failed: ${(err as Error).message}`);
		}
	}
}
