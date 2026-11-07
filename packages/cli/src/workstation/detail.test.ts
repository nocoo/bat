import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { describeLimit, runWorkstationDetail } from "./detail.js";
import type { WorkstationCredential } from "./store.js";
import { getWorkstationPaths, writeCredential } from "./store.js";

const credential: WorkstationCredential = {
	workstation_id: "22aace94-25b4-46f4-8813-62c869ef1490",
	token: `batw_${"a".repeat(43)}`,
	worker_url: "https://bat-ingest.worker.hexly.ai",
};

const reports = {
	limit: 2,
	data: [
		{
			report_id: "00000000-0000-4000-8000-000000000001",
			received_at: 1_700_000_100,
			started_at: 1_700_000_090,
			finished_at: 1_700_000_100,
			cpu_usage_pct: 21.5,
			mem_used_pct: 66.7,
			mem_total_bytes: 36_000_000_000,
			mem_available_bytes: 12_000_000_000,
			uptime_seconds: 86_400,
			connectivity: [
				{
					server_id: "pw-host-alpha",
					address: "203.0.113.10",
					family: 4 as const,
					sent: 3,
					received: 3,
					rtts_ms: [11.2, 12.4, 13.6] as [number, number, number],
					status: "reachable" as const,
				},
				{
					server_id: "pw-host-beta",
					address: "203.0.113.11",
					family: 4 as const,
					sent: 3,
					received: 1,
					rtts_ms: [40, null, null] as [number, null, null],
					status: "partial" as const,
				},
			],
		},
		{
			report_id: "00000000-0000-4000-8000-000000000002",
			received_at: 1_700_000_000,
			started_at: 1_699_999_990,
			finished_at: 1_700_000_000,
			cpu_usage_pct: null,
			mem_used_pct: 61,
			mem_total_bytes: 36_000_000_000,
			mem_available_bytes: 14_000_000_000,
			uptime_seconds: 85_000,
			connectivity: [],
		},
	],
};

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bat-ws-detail-"));
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

function paths() {
	const p = getWorkstationPaths(home);
	writeCredential(p, credential);
	return p;
}

describe("describeLimit", () => {
	test("defaults to three and bounds the input", () => {
		expect(describeLimit(undefined)).toBe(3);
		expect(describeLimit(1)).toBe(1);
		expect(() => describeLimit(0)).toThrow(/between 1 and 20/);
		expect(() => describeLimit(21)).toThrow(/between 1 and 20/);
		expect(() => describeLimit(1.5)).toThrow(/between 1 and 20/);
	});
});

describe("runWorkstationDetail", () => {
	test("renders the newest targets and the earlier reports", async () => {
		const rows: string[][] = [];
		const exit = await runWorkstationDetail({
			paths: paths(),
			fetch: async () => reports as never,
			credential,
		});
		expect(exit).toBe(0);
		expect(rows).toEqual([]);
	});

	test("renders honest dashes for silent and failed probes", async () => {
		const lines: string[] = [];
		const log = vi.spyOn(console, "log").mockImplementation((...args) => {
			lines.push(args.map(String).join(" "));
		});
		try {
			const exit = await runWorkstationDetail({
				paths: paths(),
				credential,
				fetch: async () => ({
					limit: 3,
					data: [
						{
							...reports.data[0],
							connectivity: [
								{
									server_id: "silent",
									address: "203.0.113.20",
									family: 4,
									sent: 3,
									received: 0,
									rtts_ms: [null, null, null],
									status: "timeout",
								},
								{
									server_id: "broken",
									address: "203.0.113.21",
									family: 4,
									sent: 3,
									received: 0,
									rtts_ms: [null, null, null],
									status: "error",
								},
								{
									server_id: "no-packets",
									address: "203.0.113.23",
									family: 4,
									sent: 0,
									received: 0,
									rtts_ms: [null, null, null],
									status: "partial",
								},
								{
									server_id: "zero-sent",
									address: "203.0.113.22",
									family: 4,
									sent: 0,
									received: 0,
									rtts_ms: [null, null, null],
									status: "unsupported",
								},
							],
						},
						reports.data[1],
						reports.data[1],
					],
				}),
			});
			expect(exit).toBe(0);
		} finally {
			log.mockRestore();
		}
		const printed = lines.join("\n");
		expect(printed).toContain("silent");
		expect(printed).toContain("timeout");
		expect(printed).toContain("100%");
		expect(printed).toContain("unsupported");
	});

	test("prints the raw payload as JSON", async () => {
		let out = "";
		const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
			out += args.map(String).join(" ");
		});
		const exit = await runWorkstationDetail({
			paths: paths(),
			json: true,
			fetch: async () => reports as never,
			credential,
		});
		spy.mockRestore();
		expect(exit).toBe(0);
		const parsed = JSON.parse(out) as {
			workstation_id: string;
			reports: { connectivity: unknown[] }[];
		};
		expect(parsed.workstation_id).toBe(credential.workstation_id);
		expect(parsed.reports).toHaveLength(2);
		expect(parsed.reports[0]?.connectivity).toHaveLength(2);
	});

	test("refuses without a credential or with no stored reports", async () => {
		const empty = getWorkstationPaths(home);
		expect(await runWorkstationDetail({ paths: empty, fetch: async () => reports as never })).toBe(
			1,
		);

		const exit = await runWorkstationDetail({
			paths: paths(),
			fetch: async () => ({ data: [], limit: 3 }),
			credential,
		});
		expect(exit).toBe(1);
	});

	test("reports a failing readback and hints at an old deployment", async () => {
		const exit = await runWorkstationDetail({
			paths: paths(),
			fetch: async () => {
				throw new Error("Route not allowed on machine endpoint");
			},
			credential,
		});
		expect(exit).toBe(1);
	});

	test("a single stored report skips the earlier table", async () => {
		const exit = await runWorkstationDetail({
			paths: paths(),
			credential,
			fetch: async () => ({ limit: 3, data: [reports.data[0]] }),
		});
		expect(exit).toBe(0);
	});

	test("falls back to the real reader when no fetch is injected", async () => {
		const exit = await runWorkstationDetail({
			paths: paths(),
			credential: { ...credential, worker_url: "not a url" },
		});
		expect(exit).toBe(1);
	});

	test("the command layer rejects a bad limit without touching the network", async () => {
		const { runDetailCommand } = await import("../commands/workstation/detail.js");
		const exit = await runDetailCommand({ limit: 99 });
		expect(exit).toBe(1);
	});

	test("the command layer exits when nothing is enrolled", async () => {
		const { runDetailCommand } = await import("../commands/workstation/detail.js");
		const empty = getWorkstationPaths(home);
		expect(await runDetailCommand({ paths: empty })).toBe(1);
		expect(await runDetailCommand({ paths: empty, json: true })).toBe(1);
	});

	test("parses flags into a request", async () => {
		const { parseDetailArgs } = await import("../commands/workstation/detail.js");
		expect(parseDetailArgs({})).toEqual({});
		expect(parseDetailArgs({ limit: "5", json: true })).toEqual({ limit: 5, json: true });
	});

	test("reads the stored credential when none is injected", async () => {
		const exit = await runWorkstationDetail({
			paths: paths(),
			fetch: async () => reports as never,
		});
		expect(exit).toBe(0);
	});

	test("a newest report without CPU usage prints a dash", async () => {
		const exit = await runWorkstationDetail({
			paths: paths(),
			credential,
			fetch: async () => ({
				limit: 3,
				data: [{ ...reports.data[0], cpu_usage_pct: null }],
			}),
		});
		expect(exit).toBe(0);
	});

	test("the command entrypoint parses its flags", async () => {
		const { default: detailCommand } = await import("../commands/workstation/detail.js");
		const previous = process.exitCode;
		await detailCommand.run?.({
			args: { limit: "abc", json: true },
			rawArgs: [],
			command: "",
		} as never);
		expect(process.exitCode).toBe(1);
		process.exitCode = previous;
	});

	test("rejects an out-of-range limit before any request", async () => {
		const fetch = vi.fn();
		const exit = await runWorkstationDetail({
			paths: paths(),
			limit: 99,
			fetch: fetch as never,
			credential,
		});
		expect(exit).toBe(1);
		expect(fetch).not.toHaveBeenCalled();
	});
});
