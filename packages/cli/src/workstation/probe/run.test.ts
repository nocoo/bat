// Tests for the workstation probe orchestration.

import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkstationReportInput, WorkstationTarget } from "@bat/shared";
import { WORKSTATION_BODY_MAX_BYTES } from "@bat/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Deadline } from "../deadline.js";
import { getWorkstationPaths, type WorkstationCredential } from "../store.js";
import {
	assembleReport,
	defaultCollector,
	ErrorList,
	mapWithConcurrency,
	type ProbeDeps,
	probeConnectivity,
	resolveProbeFunctions,
	runWorkstationProbe,
	type SystemCollector,
	truncateError,
	unprobedConnectivity,
} from "./run.js";

const BASE = 1_700_000_000_000;
const CREDENTIAL: WorkstationCredential = {
	workstation_id: "771e8400-e29b-41d4-a716-446655440000",
	worker_url: "https://bat-ingest.worker.hexly.ai",
	token: `batw_${"a".repeat(43)}`,
};

const TARGET: WorkstationTarget = {
	server_id: "srv_1",
	name: "edge-1",
	address: "203.0.113.10",
	family: 4,
};

let home: string;
const output = { info: vi.fn(), success: vi.fn(), error: vi.fn() };

function collector(overrides: Partial<SystemCollector> = {}): SystemCollector {
	return {
		identity: () => ({ hostname: "ws", os: "Darwin 25", arch: "arm64", uptime_seconds: 100 }),
		cpuBefore: () => ({ idle: 100, total: 200 }),
		cpuAfter: () => ({ idle: 150, total: 400 }),
		cpuModel: () => "Apple M3",
		cpuCount: () => 8,
		wait: async () => undefined,
		memory: async () => ({ total_bytes: 1000, available_bytes: 400, used_pct: 60 }),
		disks: async () => ({
			disk: [{ mount: "/", total_bytes: 1000, available_bytes: 500, used_pct: 50 }],
			errors: [],
		}),
		network: () => [
			{ name: "en0", addresses: [{ address: "192.168.1.2", family: 4, internal: false }] },
		],
		...overrides,
	};
}

function clock(step = 250): () => number {
	let value = BASE;
	return () => {
		value += step;
		return value;
	};
}

function fakeDeadline(remainingMs = 100_000): Deadline {
	return {
		signal: new AbortController().signal,
		remainingMs: () => remainingMs,
		expired: remainingMs <= 0,
		sleep: async () => undefined,
		childTimeoutMs: (cap: number) => cap,
	};
}

function dependencies(overrides: Partial<ProbeDeps> = {}): ProbeDeps {
	return {
		paths: getWorkstationPaths(home),
		credential: CREDENTIAL,
		collector: collector(),
		exec: vi.fn(),
		platform: "darwin",
		now: clock(),
		deadline: fakeDeadline(),
		output,
		fetchTargets: vi
			.fn()
			.mockResolvedValue({ data: [TARGET], interval_seconds: 600, ping_count: 3 }),
		upload: vi.fn().mockResolvedValue(undefined),
		ping: vi.fn().mockResolvedValue({
			connectivity: {
				server_id: TARGET.server_id,
				address: TARGET.address,
				family: TARGET.family,
				sent: 3,
				received: 3,
				rtts_ms: [1, 2, 3],
				status: "reachable",
			},
		}),
		...overrides,
	};
}

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bat-ws-probe-"));
	output.info.mockReset();
	output.success.mockReset();
	output.error.mockReset();
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

describe("runWorkstationProbe", () => {
	test("refuses to run without a credential", async () => {
		const upload = vi.fn();
		const outcome = await runWorkstationProbe(dependencies({ credential: null, upload }));
		expect(outcome.exitCode).toBe(1);
		expect(upload).not.toHaveBeenCalled();
		expect(output.error).toHaveBeenCalledWith(expect.stringContaining("workstation login"));
	});

	test("refuses to run when another probe holds the lock", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		mkdirSync(paths.lockPath);
		const upload = vi.fn();
		const outcome = await runWorkstationProbe(dependencies({ credential: CREDENTIAL, upload }));
		expect(outcome.exitCode).toBe(1);
		expect(upload).not.toHaveBeenCalled();
		expect(output.error).toHaveBeenCalledWith(expect.stringContaining("lock:"));
	});

	test("aborts the whole probe when the lock is compromised", async () => {
		const upload = vi.fn();
		const release = vi.fn().mockResolvedValue(undefined);
		const outcome = await runWorkstationProbe(
			dependencies({
				credential: CREDENTIAL,
				upload,
				acquireLock: async () => ({
					signal: new AbortController().signal,
					compromised: () => new Error("lock was stolen"),
					release,
				}),
			}),
		);
		expect(outcome.exitCode).toBe(1);
		expect(upload).not.toHaveBeenCalled();
		expect(output.error).toHaveBeenCalledWith(expect.stringContaining("compromised"));
		expect(release).toHaveBeenCalledOnce();
	});

	test("reports a lock release failure without losing the report", async () => {
		const release = vi.fn().mockRejectedValue(new Error("release failed"));
		const outcome = await runWorkstationProbe(
			dependencies({
				credential: CREDENTIAL,
				acquireLock: async () => ({
					signal: new AbortController().signal,
					compromised: () => null,
					release,
				}),
			}),
		);
		expect(outcome.exitCode).toBe(0);
		expect(output.error).toHaveBeenCalledWith(expect.stringContaining("release failed"));
	});

	test("collects, uploads one valid report and releases the lock", async () => {
		const deps = dependencies();
		const outcome = await runWorkstationProbe(deps);

		expect(outcome.exitCode).toBe(0);
		const report = outcome.report as WorkstationReportInput;
		expect(report.cpu).toStrictEqual({ model: "Apple M3", count: 8, usage_pct: 75 });
		expect(report.mem.used_pct).toBe(60);
		expect(report.disk).toHaveLength(1);
		expect(report.connectivity).toHaveLength(1);
		expect(report.targets_error).toBeNull();
		expect(report.collection_errors).toStrictEqual([]);
		expect(report.sample_window_ms).toBeGreaterThanOrEqual(200);
		expect(deps.upload).toHaveBeenCalledWith(CREDENTIAL.worker_url, CREDENTIAL.token, report, {
			attempts: 3,
			timeoutMs: expect.any(Number),
			signal: expect.anything(),
		});
		expect(existsSync(getWorkstationPaths(home).lockPath)).toBe(false);
	});

	test("still reports when target discovery fails", async () => {
		const deps = dependencies({
			fetchTargets: vi.fn().mockRejectedValue(new Error("502 bad gateway")),
		});
		const outcome = await runWorkstationProbe(deps);

		expect(outcome.exitCode).toBe(0);
		expect(outcome.report?.connectivity).toStrictEqual([]);
		expect(outcome.report?.targets_error).toContain("502 bad gateway");
		expect(outcome.report?.collection_errors[0]).toContain("targets:");
		expect(deps.upload).toHaveBeenCalledOnce();
	});

	test("passes the run signal and a bounded timeout to target discovery", async () => {
		const deps = dependencies();
		await runWorkstationProbe(deps);
		const options = (deps.fetchTargets as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as {
			signal?: AbortSignal;
			timeoutMs?: number;
		};
		expect(options.signal).toBeInstanceOf(AbortSignal);
		expect(options.signal?.aborted).toBe(false);
		expect(options.timeoutMs).toBeGreaterThan(0);
	});

	test("reports local ping failures as errors with bounded messages", async () => {
		const deps = dependencies({
			ping: vi.fn().mockResolvedValue({
				connectivity: {
					server_id: TARGET.server_id,
					address: TARGET.address,
					family: TARGET.family,
					sent: 3,
					received: 0,
					rtts_ms: [null, null, null],
					status: "error",
				},
				localError: `ping failed: ${"x".repeat(900)}`,
			}),
		});
		const outcome = await runWorkstationProbe(deps);
		expect(outcome.report?.connectivity[0]?.status).toBe("error");
		expect(outcome.report?.collection_errors[0]).toHaveLength(512);
	});

	test("marks unprobed targets as an error once the budget is spent", async () => {
		const deps = dependencies({ deadline: fakeDeadline(0) });
		const outcome = await runWorkstationProbe(deps);
		expect(outcome.exitCode).toBe(0);
		expect(outcome.report?.connectivity[0]?.status).toBe("error");
		expect(outcome.report?.connectivity[0]?.received).toBe(0);
		expect(outcome.report?.collection_errors[0]).toContain("was not probed");
		expect(deps.ping).not.toHaveBeenCalled();
	});

	test("uploads once when the remaining budget is short", async () => {
		const deps = dependencies({ deadline: fakeDeadline(5_000) });
		await runWorkstationProbe(deps);
		expect(deps.upload).toHaveBeenCalledWith(
			CREDENTIAL.worker_url,
			CREDENTIAL.token,
			expect.anything(),
			{ attempts: 1, timeoutMs: expect.any(Number), signal: expect.anything() },
		);
	});

	test("reports a null CPU usage when the sample window is too short", async () => {
		const outcome = await runWorkstationProbe(
			dependencies({
				now: () => BASE,
				collector: collector({
					cpuBefore: () => ({ idle: 10, total: 10 }),
					cpuAfter: () => ({ idle: 10, total: 10 }),
				}),
			}),
		);
		expect(outcome.report?.cpu.usage_pct).toBeNull();
		expect(output.info).toHaveBeenCalledWith(expect.stringContaining("cpu n/a%"));
	});

	test("includes bounded disk collection errors", async () => {
		const outcome = await runWorkstationProbe(
			dependencies({
				collector: collector({
					disks: async () => ({
						disk: [],
						errors: ["disk /: EACCES", "disk /: EACCES"],
					}),
				}),
			}),
		);
		expect(outcome.report?.collection_errors).toStrictEqual(["disk /: EACCES"]);
	});

	test("refuses to upload a report that fails local validation", async () => {
		const upload = vi.fn();
		const outcome = await runWorkstationProbe(
			dependencies({
				collector: collector({
					memory: async () => ({ total_bytes: 100, available_bytes: 200, used_pct: 0 }),
				}),
				upload,
			}),
		);
		expect(outcome.exitCode).toBe(1);
		expect(upload).not.toHaveBeenCalled();
		expect(output.error).toHaveBeenCalledWith(expect.stringContaining("Report rejected locally"));
	});

	test("refuses to upload a report above the body limit", async () => {
		const disks = Array.from({ length: 64 }, (_, index) => ({
			mount: `/volumes/${index}-${"d".repeat(480)}`,
			total_bytes: 1000,
			available_bytes: 500,
			used_pct: 50,
		}));
		const interfaces = Array.from({ length: 32 }, (_, iface) => ({
			name: `interface-${iface}-${"n".repeat(40)}`,
			addresses: Array.from({ length: 16 }, (_, addr) => ({
				address: `2001:db8:${iface.toString(16)}:${addr.toString(16)}::1`,
				family: 6 as const,
				internal: false,
			})),
		}));
		const upload = vi.fn();
		const outcome = await runWorkstationProbe(
			dependencies({
				collector: collector({
					disks: async () => ({ disk: disks, errors: [] }),
					network: () => interfaces,
				}),
				upload,
			}),
		);
		expect(outcome.exitCode).toBe(1);
		expect(upload).not.toHaveBeenCalled();
		expect(output.error).toHaveBeenCalledWith(
			expect.stringContaining(`${WORKSTATION_BODY_MAX_BYTES}`),
		);
	});

	test("returns failure when the upload is rejected", async () => {
		const outcome = await runWorkstationProbe(
			dependencies({ upload: vi.fn().mockRejectedValue(new Error("409 conflict")) }),
		);
		expect(outcome.exitCode).toBe(1);
		expect(output.error).toHaveBeenCalledWith(expect.stringContaining("409 conflict"));
	});

	test("reads the stored credential by default", async () => {
		const paths = getWorkstationPaths(home);
		const { ensureInstallationId, writeCredential } = await import("../store.js");
		await ensureInstallationId(paths);
		await writeCredential(paths, CREDENTIAL);

		const outcome = await runWorkstationProbe({
			...dependencies(),
			credential: undefined,
			paths,
		});
		expect(outcome.exitCode).toBe(0);
	});
});

describe("assembleReport", () => {
	const parts = {
		startedAtMs: BASE,
		finishedAtMs: BASE + 4000,
		sampleWindowMs: 250,
		identity: { hostname: "ws", os: "Darwin", arch: "arm64", uptime_seconds: 10 },
		cpu: { model: "m", count: 2, usage_pct: null },
		mem: { total_bytes: 10, available_bytes: 5, used_pct: 50 },
		disk: [],
		network: [],
		connectivity: [],
		errors: [],
		targetsError: null,
	};

	test("builds the shared report shape", () => {
		const report = assembleReport(parts);
		expect(report.started_at).toBe(Math.floor(BASE / 1000));
		expect(report.finished_at).toBe(Math.floor((BASE + 4000) / 1000));
		expect(report.report_id).toMatch(/^[0-9a-f-]{36}$/);
		expect(report.cpu.usage_pct).toBeNull();
	});

	test("clamps the sample window", () => {
		expect(assembleReport({ ...parts, sampleWindowMs: 0 }).sample_window_ms).toBe(1);
		expect(assembleReport({ ...parts, sampleWindowMs: 999_999 }).sample_window_ms).toBe(120_000);
	});
});

describe("helpers", () => {
	test("unprobedConnectivity is an error entry with no answers", () => {
		expect(unprobedConnectivity(TARGET)).toStrictEqual({
			server_id: "srv_1",
			address: "203.0.113.10",
			family: 4,
			sent: 3,
			received: 0,
			rtts_ms: [null, null, null],
			status: "error",
		});
	});

	test("resolveProbeFunctions falls back to the real implementations", () => {
		const defaults = resolveProbeFunctions({});
		expect(defaults.fetchTargets).toBeTypeOf("function");
		expect(defaults.upload).toBeTypeOf("function");
		expect(defaults.ping).toBeTypeOf("function");

		const ping = vi.fn();
		const upload = vi.fn();
		const fetchTargets = vi.fn();
		expect(resolveProbeFunctions({ ping, upload, fetchTargets })).toStrictEqual({
			ping,
			upload,
			fetchTargets,
		});
	});

	test("ErrorList dedupes, truncates and bounds entries", () => {
		const errors = new ErrorList();
		errors.push("a");
		errors.push("a");
		errors.push("   ");
		errors.push("y".repeat(900));
		for (let index = 0; index < 40; index += 1) {
			errors.push(`entry ${index}`);
		}
		expect(errors.length).toBe(32);
		expect(errors.values()[0]).toBe("a");
		expect(errors.values()[1]).toHaveLength(512);
		expect(truncateError("  padded  ")).toBe("padded");
	});

	test("mapWithConcurrency keeps order and respects the limit", async () => {
		let active = 0;
		let peak = 0;
		const result = await mapWithConcurrency([5, 4, 3, 2, 1], 2, async (value) => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 1));
			active -= 1;
			return value * 2;
		});
		expect(result).toStrictEqual([10, 8, 6, 4, 2]);
		expect(peak).toBeLessThanOrEqual(2);
		await expect(mapWithConcurrency([], 4, async () => 1)).resolves.toStrictEqual([]);
	});

	test("probeConnectivity stops probing when the budget is spent", async () => {
		const errors = new ErrorList();
		const ping = vi.fn();
		const result = await probeConnectivity([TARGET], {
			deadline: fakeDeadline(0),
			exec: vi.fn(),
			platform: "darwin",
			ping,
			errors,
		});
		expect(result[0]?.status).toBe("error");
		expect(ping).not.toHaveBeenCalled();
		expect(errors.values()[0]).toContain("was not probed");
	});

	test("defaultCollector wires the native collectors", async () => {
		const native = defaultCollector();
		expect(native.cpuCount()).toBeGreaterThanOrEqual(1);
		expect(typeof native.cpuBefore().total).toBe("number");
		expect(typeof native.cpuAfter().idle).toBe("number");
		expect(native.cpuModel().length).toBeGreaterThan(0);
		expect(native.identity().hostname.length).toBeGreaterThan(0);
		expect(Array.isArray(native.network())).toBe(true);
		await expect(native.memory()).resolves.toHaveProperty("total_bytes");
		await expect(native.disks()).resolves.toHaveProperty("disk");
		vi.useFakeTimers();
		const pending = native.wait();
		await vi.advanceTimersByTimeAsync(250);
		await pending;
		vi.useRealTimers();
	});
});
