import { beforeEach, describe, expect, test } from "bun:test";
import { hashHostId } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import {
	monitoringAlertsRoute,
	monitoringGroupsRoute,
	monitoringHostDetailRoute,
	monitoringHostsRoute,
} from "./monitoring";

// --- Test helpers ---

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "wk", BAT_READ_KEY: "rk" };
		return next();
	});
	app.get("/api/monitoring/hosts/:id", monitoringHostDetailRoute);
	app.get("/api/monitoring/hosts", monitoringHostsRoute);
	app.get("/api/monitoring/groups", monitoringGroupsRoute);
	app.get("/api/monitoring/alerts", monitoringAlertsRoute);
	return app;
}

async function insertHost(db: D1Database, hostId: string, lastSeen: number, isActive = 1) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, ?)")
		.bind(hostId, hostId, lastSeen, isActive)
		.run();
}

async function insertAlert(
	db: D1Database,
	hostId: string,
	ruleId: string,
	severity: string,
	triggeredAt: number,
	value = 95.0,
	message = "test alert",
) {
	await db
		.prepare(
			"INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message) VALUES (?, ?, ?, ?, ?, ?)",
		)
		.bind(hostId, ruleId, severity, value, triggeredAt, message)
		.run();
}

async function insertTag(db: D1Database, name: string): Promise<number> {
	await db.prepare("INSERT INTO tags (name) VALUES (?)").bind(name).run();
	const row = await db
		.prepare("SELECT id FROM tags WHERE name = ?")
		.bind(name)
		.first<{ id: number }>();
	return row?.id ?? 0;
}

async function tagHost(db: D1Database, hostId: string, tagId: number) {
	await db
		.prepare("INSERT INTO host_tags (host_id, tag_id) VALUES (?, ?)")
		.bind(hostId, tagId)
		.run();
}

async function insertAllowedPort(db: D1Database, hostId: string, port: number) {
	await db
		.prepare("INSERT INTO port_allowlist (host_id, port) VALUES (?, ?)")
		.bind(hostId, port)
		.run();
}

async function insertMetrics(db: D1Database, hostId: string, ts: number, uptimeSeconds: number) {
	await db
		.prepare(
			"INSERT INTO metrics_raw (host_id, ts, cpu_usage_pct, mem_used_pct, uptime_seconds) VALUES (?, ?, 50.0, 60.0, ?)",
		)
		.bind(hostId, ts, uptimeSeconds)
		.run();
}

// --- Tests ---

describe("GET /api/monitoring/hosts", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("empty fleet → status ok, 0 hosts", async () => {
		const res = await app.request(new Request("http://localhost/api/monitoring/hosts"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(body.host_count).toBe(0);
		expect(body.by_tier).toEqual({ healthy: 0, warning: 0, critical: 0, offline: 0 });
		expect(body.hosts).toEqual([]);
	});

	test("Cache-Control header is private, no-store", async () => {
		const res = await app.request(new Request("http://localhost/api/monitoring/hosts"));
		expect(res.headers.get("Cache-Control")).toBe("private, no-store");
	});

	test("healthy hosts listed with tier and empty alerts", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertHost(db, "h2", now);

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts"));
		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(body.host_count).toBe(2);
		expect(body.by_tier.healthy).toBe(2);
		expect(body.hosts).toHaveLength(2);
		expect(body.hosts[0].tier).toBe("healthy");
		expect(body.hosts[0].alert_count).toBe(0);
		expect(body.hosts[0].alerts).toEqual([]);
	});

	test("host with alerts includes alert details", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertAlert(db, "h1", "mem_high", "critical", now - 60, 92.3, "Memory 92.3%");

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts"));
		const body = await res.json();
		expect(body.by_tier.critical).toBe(1);
		const host = body.hosts[0];
		expect(host.tier).toBe("critical");
		expect(host.alert_count).toBe(1);
		expect(host.alerts[0].rule_id).toBe("mem_high");
		expect(host.alerts[0].severity).toBe("critical");
		expect(host.alerts[0].value).toBe(92.3);
		expect(host.alerts[0].message).toBe("Memory 92.3%");
		expect(host.alerts[0].triggered_at).toBe(now - 60);
	});

	test("offline host detected from stale last_seen", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now - 200); // >120s stale

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts"));
		const body = await res.json();
		expect(body.by_tier.offline).toBe(1);
		expect(body.hosts[0].tier).toBe("offline");
	});

	test("retired hosts excluded", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now, 1);
		await insertHost(db, "h2", now, 0); // retired

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts"));
		const body = await res.json();
		expect(body.host_count).toBe(1);
	});

	test("tier filter returns only matching hosts", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now); // healthy
		await insertHost(db, "h2", now); // warning
		await insertAlert(db, "h2", "iowait_high", "warning", now);

		const res = await app.request(
			new Request("http://localhost/api/monitoring/hosts?tier=warning"),
		);
		const body = await res.json();
		expect(body.host_count).toBe(1);
		expect(body.hosts[0].hostname).toBe("h2");
		expect(body.hosts[0].tier).toBe("warning");
		expect(body.by_tier.warning).toBe(1);
		expect(body.by_tier.healthy).toBe(0);
	});

	test("tag filter with AND logic", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertHost(db, "h2", now);
		const vpsTag = await insertTag(db, "vps");
		const usTag = await insertTag(db, "us-east");
		await tagHost(db, "h1", vpsTag);
		await tagHost(db, "h1", usTag);
		await tagHost(db, "h2", vpsTag); // h2 has vps but not us-east

		// Filter by both tags — only h1 matches
		const res = await app.request(
			new Request("http://localhost/api/monitoring/hosts?tag=vps&tag=us-east"),
		);
		const body = await res.json();
		expect(body.host_count).toBe(1);
		expect(body.hosts[0].hostname).toBe("h1");
	});

	test("port_allowlist suppresses public_port warning in tier derivation", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertAlert(
			db,
			"h1",
			"public_port",
			"warning",
			now,
			0,
			"Unexpected public ports: 80, 443",
		);
		await insertAllowedPort(db, "h1", 80);
		await insertAllowedPort(db, "h1", 443);

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts"));
		const body = await res.json();
		// All ports are allowed, so warning is suppressed → healthy
		expect(body.hosts[0].tier).toBe("healthy");
		expect(body.by_tier.healthy).toBe(1);
		// But alert is still listed
		expect(body.hosts[0].alert_count).toBe(1);
	});

	test("mixed tiers with by_tier counts", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now); // healthy
		await insertHost(db, "h2", now); // warning
		await insertAlert(db, "h2", "steal_high", "warning", now);
		await insertHost(db, "h3", now); // critical
		await insertAlert(db, "h3", "disk_full", "critical", now);
		await insertHost(db, "h4", now - 200); // offline

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts"));
		const body = await res.json();
		expect(body.host_count).toBe(4);
		expect(body.by_tier).toEqual({ healthy: 1, warning: 1, critical: 1, offline: 1 });
	});
});

describe("GET /api/monitoring/hosts/:id", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("returns 404 for unknown host", async () => {
		const res = await app.request(new Request("http://localhost/api/monitoring/hosts/nonexistent"));
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toBe("Host not found");
	});

	test("returns 404 for unknown hid", async () => {
		const res = await app.request(new Request("http://localhost/api/monitoring/hosts/deadbeef"));
		expect(res.status).toBe(404);
	});

	test("returns host health detail by host_id", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts/host-001"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(body.host_id).toBe("host-001");
		expect(body.hostname).toBe("host-001");
		expect(body.tier).toBe("healthy");
		expect(body.alert_count).toBe(0);
		expect(body.alerts).toEqual([]);
		expect(body.tags).toEqual([]);
		expect(body.uptime_seconds).toBeNull();
	});

	test("resolves hid to host_id", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		const hid = hashHostId("host-001");

		const res = await app.request(new Request(`http://localhost/api/monitoring/hosts/${hid}`));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.host_id).toBe("host-001");
	});

	test("includes uptime_seconds from latest metrics", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		await insertMetrics(db, "host-001", now - 30, 86400);
		await insertMetrics(db, "host-001", now, 86430); // latest

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts/host-001"));
		const body = await res.json();
		expect(body.uptime_seconds).toBe(86430);
	});

	test("includes tags sorted alphabetically", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		const zTag = await insertTag(db, "z-tag");
		const aTag = await insertTag(db, "a-tag");
		await tagHost(db, "host-001", zTag);
		await tagHost(db, "host-001", aTag);

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts/host-001"));
		const body = await res.json();
		expect(body.tags).toEqual(["a-tag", "z-tag"]);
	});

	test("includes alerts with full detail", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		await insertAlert(db, "host-001", "mem_high", "critical", now - 120, 88.5, "Memory high");

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts/host-001"));
		const body = await res.json();
		expect(body.tier).toBe("critical");
		expect(body.alert_count).toBe(1);
		expect(body.alerts[0]).toEqual({
			rule_id: "mem_high",
			severity: "critical",
			value: 88.5,
			message: "Memory high",
			triggered_at: now - 120,
		});
	});

	test("port_allowlist suppresses public_port for tier", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		await insertAlert(
			db,
			"host-001",
			"public_port",
			"warning",
			now,
			0,
			"Unexpected public ports: 22",
		);
		await insertAllowedPort(db, "host-001", 22);

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts/host-001"));
		const body = await res.json();
		expect(body.tier).toBe("healthy");
		expect(body.alert_count).toBe(1); // alert still present
	});

	test("Cache-Control header is private, no-store", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts/host-001"));
		expect(res.headers.get("Cache-Control")).toBe("private, no-store");
	});

	test("returns 404 for retired host", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now, 0); // retired

		const res = await app.request(new Request("http://localhost/api/monitoring/hosts/host-001"));
		expect(res.status).toBe(404);
	});
});

describe("GET /api/monitoring/groups", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("empty fleet → empty groups", async () => {
		const res = await app.request(new Request("http://localhost/api/monitoring/groups"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(body.groups).toEqual([]);
	});

	test("Cache-Control header is private, no-store", async () => {
		const res = await app.request(new Request("http://localhost/api/monitoring/groups"));
		expect(res.headers.get("Cache-Control")).toBe("private, no-store");
	});

	test("untagged hosts go into (untagged) group", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertHost(db, "h2", now);

		const res = await app.request(new Request("http://localhost/api/monitoring/groups"));
		const body = await res.json();
		expect(body.groups).toHaveLength(1);
		expect(body.groups[0].tag).toBe("(untagged)");
		expect(body.groups[0].host_count).toBe(2);
		expect(body.groups[0].tier).toBe("healthy");
		expect(body.groups[0].by_tier).toEqual({ healthy: 2, warning: 0, critical: 0, offline: 0 });
		expect(body.groups[0].alert_count).toBe(0);
	});

	test("hosts grouped by tag, multi-tag host appears in each group", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertHost(db, "h2", now);
		const vpsTag = await insertTag(db, "vps");
		const dbTag = await insertTag(db, "database");
		await tagHost(db, "h1", vpsTag);
		await tagHost(db, "h1", dbTag); // h1 in both groups
		await tagHost(db, "h2", vpsTag);

		const res = await app.request(new Request("http://localhost/api/monitoring/groups"));
		const body = await res.json();
		expect(body.groups).toHaveLength(2);

		const vps = body.groups.find((g: { tag: string }) => g.tag === "vps");
		const database = body.groups.find((g: { tag: string }) => g.tag === "database");
		expect(vps.host_count).toBe(2);
		expect(vps.hosts).toContain("h1");
		expect(vps.hosts).toContain("h2");
		expect(database.host_count).toBe(1);
		expect(database.hosts).toContain("h1");
	});

	test("worst-tier derivation: offline > critical > warning > healthy", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now); // healthy
		await insertHost(db, "h2", now); // critical
		await insertAlert(db, "h2", "disk_full", "critical", now);
		const tag = await insertTag(db, "prod");
		await tagHost(db, "h1", tag);
		await tagHost(db, "h2", tag);

		const res = await app.request(new Request("http://localhost/api/monitoring/groups"));
		const body = await res.json();
		const prod = body.groups.find((g: { tag: string }) => g.tag === "prod");
		expect(prod.tier).toBe("critical");
		expect(prod.by_tier.healthy).toBe(1);
		expect(prod.by_tier.critical).toBe(1);
		expect(prod.alert_count).toBe(1);
	});

	test("mixed tagged and untagged hosts", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now); // tagged
		await insertHost(db, "h2", now); // untagged
		const tag = await insertTag(db, "web");
		await tagHost(db, "h1", tag);

		const res = await app.request(new Request("http://localhost/api/monitoring/groups"));
		const body = await res.json();
		expect(body.groups).toHaveLength(2);

		const web = body.groups.find((g: { tag: string }) => g.tag === "web");
		const untagged = body.groups.find((g: { tag: string }) => g.tag === "(untagged)");
		expect(web.host_count).toBe(1);
		expect(untagged.host_count).toBe(1);
	});

	test("port_allowlist suppression affects group tier", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertAlert(db, "h1", "public_port", "warning", now, 0, "Unexpected public ports: 443");
		await insertAllowedPort(db, "h1", 443);
		const tag = await insertTag(db, "web");
		await tagHost(db, "h1", tag);

		const res = await app.request(new Request("http://localhost/api/monitoring/groups"));
		const body = await res.json();
		const web = body.groups.find((g: { tag: string }) => g.tag === "web");
		// Suppressed → healthy
		expect(web.tier).toBe("healthy");
	});

	test("offline host makes group tier offline", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now); // healthy
		await insertHost(db, "h2", now - 200); // offline
		const tag = await insertTag(db, "all");
		await tagHost(db, "h1", tag);
		await tagHost(db, "h2", tag);

		const res = await app.request(new Request("http://localhost/api/monitoring/groups"));
		const body = await res.json();
		const all = body.groups.find((g: { tag: string }) => g.tag === "all");
		expect(all.tier).toBe("offline");
		expect(all.by_tier.offline).toBe(1);
		expect(all.by_tier.healthy).toBe(1);
	});
});

describe("GET /api/monitoring/alerts", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("no alerts → status ok, count 0", async () => {
		const res = await app.request(new Request("http://localhost/api/monitoring/alerts"));
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.status).toBe("ok");
		expect(body.alert_count).toBe(0);
		expect(body.by_severity).toEqual({ critical: 0, warning: 0, info: 0 });
		expect(body.alerts).toEqual([]);
	});

	test("Cache-Control header is private, no-store", async () => {
		const res = await app.request(new Request("http://localhost/api/monitoring/alerts"));
		expect(res.headers.get("Cache-Control")).toBe("private, no-store");
	});

	test("alerts enriched with hostname, duration_seconds, tags", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-001", now);
		await insertAlert(db, "host-001", "mem_high", "critical", now - 300, 92.3, "Memory 92.3%");
		const tag = await insertTag(db, "vps");
		await tagHost(db, "host-001", tag);

		const res = await app.request(new Request("http://localhost/api/monitoring/alerts"));
		const body = await res.json();
		expect(body.alert_count).toBe(1);
		expect(body.by_severity.critical).toBe(1);

		const alert = body.alerts[0];
		expect(alert.host_id).toBe("host-001");
		expect(alert.hostname).toBe("host-001");
		expect(alert.rule_id).toBe("mem_high");
		expect(alert.severity).toBe("critical");
		expect(alert.value).toBe(92.3);
		expect(alert.message).toBe("Memory 92.3%");
		expect(alert.triggered_at).toBe(now - 300);
		expect(alert.duration_seconds).toBeGreaterThanOrEqual(299);
		expect(alert.tags).toEqual(["vps"]);
	});

	test("severity filter", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertAlert(db, "h1", "mem_high", "critical", now);
		await insertAlert(db, "h1", "iowait_high", "warning", now);

		const res = await app.request(
			new Request("http://localhost/api/monitoring/alerts?severity=warning"),
		);
		const body = await res.json();
		expect(body.alert_count).toBe(1);
		expect(body.alerts[0].severity).toBe("warning");
		expect(body.by_severity.warning).toBe(1);
		expect(body.by_severity.critical).toBe(0);
	});

	test("tag filter with AND logic", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertHost(db, "h2", now);
		await insertAlert(db, "h1", "mem_high", "critical", now);
		await insertAlert(db, "h2", "disk_full", "critical", now);
		const vpsTag = await insertTag(db, "vps");
		const usTag = await insertTag(db, "us-east");
		await tagHost(db, "h1", vpsTag);
		await tagHost(db, "h1", usTag);
		await tagHost(db, "h2", vpsTag); // h2 only has vps

		const res = await app.request(
			new Request("http://localhost/api/monitoring/alerts?tag=vps&tag=us-east"),
		);
		const body = await res.json();
		expect(body.alert_count).toBe(1);
		expect(body.alerts[0].host_id).toBe("h1");
	});

	test("alerts from retired hosts excluded", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now, 1);
		await insertHost(db, "h2", now, 0); // retired
		await insertAlert(db, "h1", "mem_high", "critical", now);
		await insertAlert(db, "h2", "disk_full", "critical", now);

		const res = await app.request(new Request("http://localhost/api/monitoring/alerts"));
		const body = await res.json();
		expect(body.alert_count).toBe(1);
		expect(body.alerts[0].host_id).toBe("h1");
	});

	test("by_severity counts all three levels", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertAlert(db, "h1", "mem_high", "critical", now);
		await insertAlert(db, "h1", "iowait_high", "warning", now);
		await insertAlert(db, "h1", "uptime_anomaly", "info", now);

		const res = await app.request(new Request("http://localhost/api/monitoring/alerts"));
		const body = await res.json();
		expect(body.alert_count).toBe(3);
		expect(body.by_severity).toEqual({ critical: 1, warning: 1, info: 1 });
	});

	test("untagged host alerts have empty tags array", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "h1", now);
		await insertAlert(db, "h1", "mem_high", "critical", now);

		const res = await app.request(new Request("http://localhost/api/monitoring/alerts"));
		const body = await res.json();
		expect(body.alerts[0].tags).toEqual([]);
	});
});
