// Contract tests for D1MetricsRepository. SQL lifted from the previous
// `routes/metrics.ts` SELECTs and `services/metrics.ts` insert. Behaviors
// pinned: raw column projection (incl. ext_json json_object), hourly
// projection with named-as aliases, atomic host-upsert + metrics_raw
// insert with idempotent `(host_id, ts)`.

import type { MetricsPayload } from "@bat/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1MetricsRepository } from "./metrics";

const NOW = 1_730_000_000;

function makePayload(overrides?: Partial<MetricsPayload>): MetricsPayload {
	return {
		host_id: "host-a",
		timestamp: NOW,
		interval: 30,
		uptime_seconds: 3600,
		cpu: {
			load1: 0.1,
			load5: 0.1,
			load15: 0.1,
			usage_pct: 12,
			iowait_pct: 0,
			steal_pct: 0,
			count: 4,
		},
		mem: { total_bytes: 8_000_000_000, available_bytes: 6_000_000_000, used_pct: 25 },
		swap: { total_bytes: 0, used_bytes: 0, used_pct: 0 },
		disk: [{ mount: "/", fs_type: "ext4", total_bytes: 100, available_bytes: 50, used_pct: 50 }],
		net: [],
		...overrides,
	};
}

describe("D1MetricsRepository", () => {
	let db: D1Database;
	let repo: D1MetricsRepository;
	beforeEach(async () => {
		db = createMockD1();
		repo = new D1MetricsRepository(db);
	});

	describe("insertRawWithHostUpsert (first-seen)", () => {
		test("creates host row and inserts metrics_raw atomically", async () => {
			const result = await repo.insertRawWithHostUpsert(
				"host-a",
				"host-a",
				makePayload(),
				NOW,
				"first-seen",
			);
			expect(result.inserted).toBe(true);
			const host = await db
				.prepare("SELECT host_id, hostname, last_seen FROM hosts WHERE host_id = ?")
				.bind("host-a")
				.first<{ host_id: string; hostname: string; last_seen: number }>();
			expect(host).toEqual({ host_id: "host-a", hostname: "host-a", last_seen: NOW });
			const metric = await db
				.prepare("SELECT host_id, ts, cpu_usage_pct FROM metrics_raw WHERE host_id = ?")
				.bind("host-a")
				.first<{ host_id: string; ts: number; cpu_usage_pct: number }>();
			expect(metric).toEqual({ host_id: "host-a", ts: NOW, cpu_usage_pct: 12 });
		});

		test("duplicate (host_id, ts) returns inserted=false (idempotent retry)", async () => {
			const r1 = await repo.insertRawWithHostUpsert(
				"host-a",
				"host-a",
				makePayload(),
				NOW,
				"first-seen",
			);
			expect(r1.inserted).toBe(true);
			const r2 = await repo.insertRawWithHostUpsert(
				"host-a",
				"host-a",
				makePayload(),
				NOW + 1,
				"existing",
			);
			expect(r2.inserted).toBe(false);
			// last_seen still advanced
			const host = await db
				.prepare("SELECT last_seen FROM hosts WHERE host_id = ?")
				.bind("host-a")
				.first<{ last_seen: number }>();
			expect(host?.last_seen).toBe(NOW + 1);
		});
	});

	describe("insertRawWithHostUpsert (existing)", () => {
		test("touches last_seen without rewriting hostname", async () => {
			await db
				.prepare("INSERT INTO hosts (host_id, hostname, last_seen) VALUES (?, ?, ?)")
				.bind("host-a", "real-name", NOW - 1000)
				.run();
			const result = await repo.insertRawWithHostUpsert(
				"host-a",
				"ignored-on-existing",
				makePayload(),
				NOW,
				"existing",
			);
			expect(result.inserted).toBe(true);
			const host = await db
				.prepare("SELECT hostname, last_seen FROM hosts WHERE host_id = ?")
				.bind("host-a")
				.first<{ hostname: string; last_seen: number }>();
			expect(host).toEqual({ hostname: "real-name", last_seen: NOW });
		});
	});

	describe("queryRaw", () => {
		test("returns rows in `ts ASC` order with ext_json packed via json_object", async () => {
			await repo.insertRawWithHostUpsert(
				"host-a",
				"host-a",
				makePayload({ timestamp: NOW + 10 }),
				NOW + 10,
				"first-seen",
			);
			await repo.insertRawWithHostUpsert(
				"host-a",
				"host-a",
				makePayload({ timestamp: NOW + 5 }),
				NOW + 5,
				"existing",
			);
			const rows = await repo.queryRaw("host-a", NOW, NOW + 100);
			expect(rows.map((r) => r.ts)).toEqual([NOW + 5, NOW + 10]);
			expect(typeof rows[0]?.ext_json).toBe("string");
			expect(rows[0]?.ext_json).toContain("interrupts_sec");
		});

		test("filters by from/to inclusive bounds", async () => {
			await repo.insertRawWithHostUpsert(
				"host-a",
				"host-a",
				makePayload({ timestamp: NOW }),
				NOW,
				"first-seen",
			);
			await repo.insertRawWithHostUpsert(
				"host-a",
				"host-a",
				makePayload({ timestamp: NOW + 200 }),
				NOW + 200,
				"existing",
			);
			const rows = await repo.queryRaw("host-a", NOW + 50, NOW + 100);
			expect(rows).toHaveLength(0);
		});
	});

	describe("queryHourly", () => {
		test("returns rows in `hour_ts ASC` with field aliasing", async () => {
			await db
				.prepare("INSERT INTO hosts (host_id, hostname, last_seen) VALUES (?, ?, ?)")
				.bind("host-a", "host-a", NOW)
				.run();
			await db
				.prepare(
					`INSERT INTO metrics_hourly (host_id, hour_ts, cpu_usage_avg, mem_used_pct_avg, sample_count)
VALUES (?, ?, ?, ?, ?)`,
				)
				.bind("host-a", NOW, 12.5, 30, 5)
				.run();
			const rows = await repo.queryHourly("host-a", NOW - 10, NOW + 10);
			expect(rows[0]?.ts).toBe(NOW);
			expect(rows[0]?.cpu_usage_pct).toBe(12.5);
			expect(rows[0]?.sample_count).toBe(5);
		});
	});
});
