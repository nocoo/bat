// Unit tests for pure aggregation helpers: aggregateNetwork + aggregateDiskIo.
import { describe, expect, test } from "bun:test";
import { aggregateDiskIo, aggregateNetwork } from "./aggregation.js";

// These helpers only read a tiny slice of the full RawRow; cast partials.
type Partial = Record<string, unknown>;
const row = (net_json: string | null, disk_io_json: string | null = null): Partial => ({
	net_json,
	disk_io_json,
});

describe("aggregateNetwork", () => {
	test("sums rx/tx across interfaces and averages across samples", () => {
		const rows = [
			row(
				JSON.stringify([
					{ iface: "eth0", rx_bytes_rate: 100, tx_bytes_rate: 50, rx_errors: 1, tx_errors: 2 },
					{ iface: "eth1", rx_bytes_rate: 200, tx_bytes_rate: 100, rx_errors: 0, tx_errors: 0 },
				]),
			),
			row(
				JSON.stringify([
					{ iface: "eth0", rx_bytes_rate: 400, tx_bytes_rate: 200, rx_errors: 3, tx_errors: 4 },
				]),
			),
		];
		// biome-ignore lint/suspicious/noExplicitAny: minimal partial row cast for tests
		const out = aggregateNetwork(rows as any);
		// samples: [300, 400] rx → avg 350, max 400; tx [150,200] → avg 175, max 200
		expect(out.rxBytesAvg).toBe(350);
		expect(out.rxBytesMax).toBe(400);
		expect(out.txBytesAvg).toBe(175);
		expect(out.txBytesMax).toBe(200);
		expect(out.rxErrors).toBe(4);
		expect(out.txErrors).toBe(6);
	});

	test("returns zeros when there are no rows", () => {
		// biome-ignore lint/suspicious/noExplicitAny: empty cast
		const out = aggregateNetwork([] as any);
		expect(out).toEqual({
			rxBytesAvg: 0,
			rxBytesMax: 0,
			txBytesAvg: 0,
			txBytesMax: 0,
			rxErrors: 0,
			txErrors: 0,
		});
	});

	test("tolerates malformed net_json and null values", () => {
		const rows = [row("not json"), row(null), row("[]")];
		// biome-ignore lint/suspicious/noExplicitAny: partial cast
		const out = aggregateNetwork(rows as any);
		expect(out.rxBytesAvg).toBe(0);
		expect(out.rxBytesMax).toBe(0);
		expect(out.rxErrors).toBe(0);
	});
});

describe("aggregateDiskIo", () => {
	test("returns null when all samples have null disk_io_json", () => {
		const rows = [row(null, null), row(null, null)];
		// biome-ignore lint/suspicious/noExplicitAny: partial cast
		expect(aggregateDiskIo(rows as any)).toBeNull();
	});

	test("groups by device and computes avg + max", () => {
		const sample = (readIops: number, ioUtil: number) =>
			JSON.stringify([
				{
					device: "sda",
					read_iops: readIops,
					write_iops: 0,
					read_bytes_sec: 0,
					write_bytes_sec: 0,
					io_util_pct: ioUtil,
				},
			]);
		const rows = [row(null, sample(10, 20)), row(null, sample(30, 80))];
		// biome-ignore lint/suspicious/noExplicitAny: partial cast
		const json = aggregateDiskIo(rows as any);
		expect(json).not.toBeNull();
		const parsed = JSON.parse(json as string) as Record<string, unknown>[];
		expect(parsed).toHaveLength(1);
		const entry = parsed[0] as Record<string, number | string>;
		expect(entry.device).toBe("sda");
		expect(entry.read_iops_avg).toBe(20);
		expect(entry.io_util_pct_avg).toBe(50);
		expect(entry.io_util_pct_max).toBe(80);
	});

	test("skips malformed JSON but still aggregates valid rows", () => {
		const good = JSON.stringify([
			{
				device: "sdb",
				read_iops: 10,
				write_iops: 10,
				read_bytes_sec: 100,
				write_bytes_sec: 100,
				io_util_pct: 50,
			},
		]);
		const rows = [row(null, "{garbage"), row(null, good)];
		// biome-ignore lint/suspicious/noExplicitAny: partial cast
		const json = aggregateDiskIo(rows as any);
		const parsed = JSON.parse(json as string);
		expect(parsed[0].device).toBe("sdb");
		expect(parsed[0].read_iops_avg).toBe(10);
	});

	test("ignores empty entry arrays", () => {
		const rows = [row(null, "[]"), row(null, "[]")];
		// biome-ignore lint/suspicious/noExplicitAny: partial cast
		expect(aggregateDiskIo(rows as any)).toBeNull();
	});

	test("aggregates across multiple devices independently", () => {
		const sample = JSON.stringify([
			{
				device: "sda",
				read_iops: 10,
				write_iops: 0,
				read_bytes_sec: 0,
				write_bytes_sec: 0,
				io_util_pct: 10,
			},
			{
				device: "sdb",
				read_iops: 20,
				write_iops: 0,
				read_bytes_sec: 0,
				write_bytes_sec: 0,
				io_util_pct: 90,
			},
		]);
		// biome-ignore lint/suspicious/noExplicitAny: partial cast
		const json = aggregateDiskIo([row(null, sample)] as any);
		const parsed = JSON.parse(json as string) as Array<{ device: string; io_util_pct_max: number }>;
		expect(parsed).toHaveLength(2);
		const byDev = new Map(parsed.map((p) => [p.device, p.io_util_pct_max]));
		expect(byDev.get("sda")).toBe(10);
		expect(byDev.get("sdb")).toBe(90);
	});
});
