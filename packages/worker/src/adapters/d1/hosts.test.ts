// Contract tests for D1HostsRepository. SQL primitives lifted from
// `routes/{hosts,host-detail,monitoring,live,fleet-status}.ts` and
// `lib/resolve-host.ts`. Behaviors here pin column projections, ORDER
// BY semantics, the active-only filter, and the metrics_raw +
// metrics_hourly indexes used by the hosts list / sparkline path.

import { hashHostId } from "@bat/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1HostsRepository } from "./hosts";

const NOW = 1_730_000_000;

async function seedHost(
	db: D1Database,
	hostId: string,
	hostname: string,
	overrides: {
		isActive?: number;
		lastSeen?: number;
		os?: string | null;
		kernel?: string | null;
		arch?: string | null;
		cpu_model?: string | null;
		boot_time?: number | null;
		cpu_logical?: number | null;
		cpu_physical?: number | null;
		mem_total_bytes?: number | null;
		swap_total_bytes?: number | null;
		virtualization?: string | null;
		net_interfaces?: string | null;
		disks?: string | null;
		boot_mode?: string | null;
		timezone?: string | null;
		dns_resolvers?: string | null;
		dns_search?: string | null;
		public_ip?: string | null;
		probe_version?: string | null;
		description?: string | null;
		maintenance_start?: string | null;
		maintenance_end?: string | null;
		maintenance_reason?: string | null;
	} = {},
) {
	await db
		.prepare(
			`INSERT INTO hosts (
host_id, hostname, last_seen, is_active,
os, kernel, arch, cpu_model, boot_time,
cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes,
virtualization, net_interfaces, disks, boot_mode,
timezone, dns_resolvers, dns_search, public_ip,
probe_version, description,
maintenance_start, maintenance_end, maintenance_reason
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			hostId,
			hostname,
			overrides.lastSeen ?? NOW,
			overrides.isActive ?? 1,
			overrides.os ?? null,
			overrides.kernel ?? null,
			overrides.arch ?? null,
			overrides.cpu_model ?? null,
			overrides.boot_time ?? null,
			overrides.cpu_logical ?? null,
			overrides.cpu_physical ?? null,
			overrides.mem_total_bytes ?? null,
			overrides.swap_total_bytes ?? null,
			overrides.virtualization ?? null,
			overrides.net_interfaces ?? null,
			overrides.disks ?? null,
			overrides.boot_mode ?? null,
			overrides.timezone ?? null,
			overrides.dns_resolvers ?? null,
			overrides.dns_search ?? null,
			overrides.public_ip ?? null,
			overrides.probe_version ?? null,
			overrides.description ?? null,
			overrides.maintenance_start ?? null,
			overrides.maintenance_end ?? null,
			overrides.maintenance_reason ?? null,
		)
		.run();
}

async function seedMetric(
	db: D1Database,
	hostId: string,
	ts: number,
	cpu_usage_pct: number,
	mem_used_pct: number,
	uptime_seconds: number,
) {
	await db
		.prepare(
			`INSERT INTO metrics_raw (host_id, ts, cpu_usage_pct, mem_used_pct, uptime_seconds, cpu_load1, swap_used_pct, disk_json, net_json)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(hostId, ts, cpu_usage_pct, mem_used_pct, uptime_seconds, 0.5, 0, "[]", "[]")
		.run();
}

async function seedHourly(
	db: D1Database,
	hostId: string,
	hour_ts: number,
	cpu_usage_avg: number | null,
	mem_used_pct_avg: number | null,
	net_rx: number | null,
	net_tx: number | null,
) {
	await db
		.prepare(
			`INSERT INTO metrics_hourly (host_id, hour_ts, cpu_usage_avg, mem_used_pct_avg, net_rx_bytes_avg, net_tx_bytes_avg, sample_count)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(hostId, hour_ts, cpu_usage_avg, mem_used_pct_avg, net_rx, net_tx, 1)
		.run();
}

describe("D1HostsRepository", () => {
	let db: D1Database;
	let repo: D1HostsRepository;
	beforeEach(async () => {
		db = createMockD1();
		repo = new D1HostsRepository(db);
	});

	describe("probe", () => {
		test("resolves on healthy DB", async () => {
			await expect(repo.probe()).resolves.toBeUndefined();
		});
	});

	describe("listActiveHostIds", () => {
		test("returns only active hosts", async () => {
			await seedHost(db, "h1", "h1.example.com");
			await seedHost(db, "h2", "h2.example.com", { isActive: 0 });
			await seedHost(db, "h3", "h3.example.com");
			const rows = await repo.listActiveHostIds();
			const ids = rows.map((r) => r.host_id).sort();
			expect(ids).toEqual(["h1", "h3"]);
		});
		test("empty when no hosts", async () => {
			expect(await repo.listActiveHostIds()).toEqual([]);
		});
	});

	describe("listAllHostIdsWithActive", () => {
		test("returns active and retired hosts with flag", async () => {
			await seedHost(db, "h1", "h1.example.com");
			await seedHost(db, "h2", "h2.example.com", { isActive: 0 });
			const rows = await repo.listAllHostIdsWithActive();
			const map = new Map(rows.map((r) => [r.host_id, r.is_active]));
			expect(map.get("h1")).toBe(1);
			expect(map.get("h2")).toBe(0);
		});
	});

	describe("getActiveFlag", () => {
		test("returns the row for known host", async () => {
			await seedHost(db, "h1", "h1.example.com", { isActive: 0 });
			expect(await repo.getActiveFlag("h1")).toEqual({ host_id: "h1", is_active: 0 });
		});
		test("returns null for unknown host", async () => {
			expect(await repo.getActiveFlag("missing")).toBeNull();
		});
	});

	describe("listOverviewRows", () => {
		test("only active hosts; full overview projection", async () => {
			await seedHost(db, "h1", "h1.example.com", {
				os: "Ubuntu",
				kernel: "6.5.0",
				arch: "x86_64",
				cpu_model: "Intel",
				boot_time: NOW - 100,
				cpu_logical: 8,
				cpu_physical: 4,
				mem_total_bytes: 16_000_000_000,
				virtualization: "kvm",
				public_ip: "1.2.3.4",
				probe_version: "0.1.0",
				maintenance_start: "01:00",
				maintenance_end: "02:00",
				maintenance_reason: "patch",
			});
			await seedHost(db, "h2", "h2.example.com", { isActive: 0 });
			const rows = await repo.listOverviewRows();
			expect(rows).toHaveLength(1);
			const row = rows[0];
			expect(row?.host_id).toBe("h1");
			expect(row?.os).toBe("Ubuntu");
			expect(row?.cpu_logical).toBe(8);
			expect(row?.public_ip).toBe("1.2.3.4");
			expect(row?.maintenance_start).toBe("01:00");
		});
	});

	describe("listStatusRows", () => {
		test("only active hosts; status projection", async () => {
			await seedHost(db, "h1", "h1.example.com");
			await seedHost(db, "h2", "h2.example.com", { isActive: 0 });
			const rows = await repo.listStatusRows();
			expect(rows.map((r) => r.host_id)).toEqual(["h1"]);
			expect(rows[0]?.hostname).toBe("h1.example.com");
		});
	});

	describe("getDetailRow", () => {
		test("returns full inventory for active host", async () => {
			await seedHost(db, "h1", "h1.example.com", {
				timezone: "UTC",
				dns_resolvers: '["1.1.1.1"]',
				disks: "[]",
				description: "primary",
			});
			const row = await repo.getDetailRow("h1");
			expect(row?.timezone).toBe("UTC");
			expect(row?.dns_resolvers).toBe('["1.1.1.1"]');
			expect(row?.description).toBe("primary");
		});
		test("returns null for retired host", async () => {
			await seedHost(db, "h1", "h1.example.com", { isActive: 0 });
			expect(await repo.getDetailRow("h1")).toBeNull();
		});
		test("returns null for unknown host", async () => {
			expect(await repo.getDetailRow("missing")).toBeNull();
		});
	});

	describe("getStatusRow", () => {
		test("returns active host", async () => {
			await seedHost(db, "h1", "h1.example.com");
			const row = await repo.getStatusRow("h1");
			expect(row?.host_id).toBe("h1");
		});
		test("null for retired or unknown", async () => {
			await seedHost(db, "h1", "h1.example.com", { isActive: 0 });
			expect(await repo.getStatusRow("h1")).toBeNull();
			expect(await repo.getStatusRow("missing")).toBeNull();
		});
	});

	describe("getLatestMetricsBatch", () => {
		test("returns the newest row per host", async () => {
			await seedHost(db, "h1", "h1.example.com");
			await seedHost(db, "h2", "h2.example.com");
			await seedMetric(db, "h1", NOW - 60, 10, 50, 100);
			await seedMetric(db, "h1", NOW, 30, 60, 200);
			await seedMetric(db, "h2", NOW - 5, 5, 20, 999);
			const rows = await repo.getLatestMetricsBatch(["h1", "h2"]);
			const byHost = new Map(rows.map((r) => [r.host_id, r]));
			expect(byHost.get("h1")?.cpu_usage_pct).toBe(30);
			expect(byHost.get("h1")?.uptime_seconds).toBe(200);
			expect(byHost.get("h2")?.uptime_seconds).toBe(999);
		});
		test("hosts with no metrics are absent from result", async () => {
			await seedHost(db, "h1", "h1.example.com");
			await seedMetric(db, "h1", NOW, 1, 2, 3);
			const rows = await repo.getLatestMetricsBatch(["h1", "h-no-metrics"]);
			expect(rows.map((r) => r.host_id)).toEqual(["h1"]);
		});
		test("empty hostIds returns empty without DB call", async () => {
			expect(await repo.getLatestMetricsBatch([])).toEqual([]);
		});
	});

	describe("getLatestUptime", () => {
		test("returns the newest uptime", async () => {
			await seedHost(db, "h1", "h1.example.com");
			await seedMetric(db, "h1", NOW - 100, 10, 20, 1234);
			await seedMetric(db, "h1", NOW, 11, 21, 5678);
			expect(await repo.getLatestUptime("h1")).toBe(5678);
		});
		test("null when no metrics", async () => {
			expect(await repo.getLatestUptime("missing")).toBeNull();
		});
	});

	describe("listSparklineRowsSince", () => {
		test("filters by host + cutoff and orders by host_id, hour_ts asc", async () => {
			await seedHost(db, "h1", "h1.example.com");
			await seedHost(db, "h2", "h2.example.com");
			const cutoff = NOW - 86400;
			await seedHourly(db, "h1", cutoff - 3600, 10, 20, null, null);
			await seedHourly(db, "h1", cutoff + 3600, 50, 40, 1000, 2000);
			await seedHourly(db, "h1", cutoff + 7200, 60, 50, null, null);
			await seedHourly(db, "h2", cutoff + 1800, 70, 60, 500, 500);
			const rows = await repo.listSparklineRowsSince(["h1", "h2"], cutoff);
			expect(rows.map((r) => r.host_id)).toEqual(["h1", "h1", "h2"]);
			const h1Net = rows.filter((r) => r.host_id === "h1").map((r) => r.net);
			expect(h1Net).toEqual([3000, null]);
		});
		test("empty hostIds returns empty without DB call", async () => {
			expect(await repo.listSparklineRowsSince([], NOW)).toEqual([]);
		});
	});

	describe("hashHostId interop", () => {
		test("listActiveHostIds output is the surface resolveHostIdByHash hashes against", async () => {
			await seedHost(db, "web-01.example.com", "web-01");
			const rows = await repo.listActiveHostIds();
			const hid = hashHostId("web-01.example.com");
			expect(rows.find((r) => hashHostId(r.host_id) === hid)?.host_id).toBe("web-01.example.com");
		});
	});
});
