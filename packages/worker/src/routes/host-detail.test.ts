import { beforeEach, describe, expect, test } from "bun:test";
import type { HostDetailItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { hostDetailRoute } from "./host-detail";

const READ_KEY = "test-read-key";

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "wk", BAT_READ_KEY: READ_KEY };
		return next();
	});
	app.get("/api/hosts/:id", hostDetailRoute);
	return app;
}

function get(app: Hono<AppEnv>, id: string) {
	return app.request(new Request(`http://localhost/api/hosts/${id}`));
}

async function insertHost(
	db: D1Database,
	hostId: string,
	opts?: Partial<{
		hostname: string;
		lastSeen: number;
		cpuLogical: number;
		cpuPhysical: number;
		memTotalBytes: number;
		swapTotalBytes: number;
		virtualization: string;
		netInterfaces: string;
		disks: string;
		bootMode: string;
		timezone: string;
		dnsResolvers: string;
		dnsSearch: string;
		publicIp: string;
		probeVersion: string;
	}>,
) {
	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare(
			`INSERT INTO hosts (host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, is_active,
       cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes,
       virtualization, net_interfaces, disks, boot_mode,
       timezone, dns_resolvers, dns_search, public_ip, probe_version)
VALUES (?, ?, 'Ubuntu 24.04', '6.8.0', 'x86_64', 'AMD EPYC', ?, ?, 1,
       ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			hostId,
			opts?.hostname ?? hostId,
			now - 86400,
			opts?.lastSeen ?? now,
			opts?.cpuLogical ?? null,
			opts?.cpuPhysical ?? null,
			opts?.memTotalBytes ?? null,
			opts?.swapTotalBytes ?? null,
			opts?.virtualization ?? null,
			opts?.netInterfaces ?? null,
			opts?.disks ?? null,
			opts?.bootMode ?? null,
			opts?.timezone ?? null,
			opts?.dnsResolvers ?? null,
			opts?.dnsSearch ?? null,
			opts?.publicIp ?? null,
			opts?.probeVersion ?? null,
		)
		.run();
}

describe("GET /api/hosts/:id", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("returns full detail for host by host_id", async () => {
		await insertHost(db, "host-001", {
			cpuLogical: 8,
			cpuPhysical: 4,
			memTotalBytes: 8589934592,
			swapTotalBytes: 2147483648,
			virtualization: "kvm",
			bootMode: "uefi",
			timezone: "UTC",
			dnsResolvers: '["1.1.1.1","8.8.8.8"]',
			dnsSearch: '["example.com"]',
			netInterfaces: JSON.stringify([
				{
					iface: "eth0",
					mac: "aa:bb:cc:dd:ee:ff",
					ipv4: ["10.0.1.5"],
					ipv6: [],
					speed_mbps: 1000,
				},
			]),
			disks: JSON.stringify([{ device: "sda", size_bytes: 500107862016, rotational: false }]),
		});

		const res = await get(app, "host-001");
		expect(res.status).toBe(200);

		const body = (await res.json()) as HostDetailItem;
		expect(body.host_id).toBe("host-001");
		expect(body.hid).toBe(hashHostId("host-001"));
		expect(body.os).toBe("Ubuntu 24.04");
		expect(body.cpu_logical).toBe(8);
		expect(body.cpu_physical).toBe(4);
		expect(body.mem_total_bytes).toBe(8589934592);
		expect(body.swap_total_bytes).toBe(2147483648);
		expect(body.virtualization).toBe("kvm");
		expect(body.boot_mode).toBe("uefi");
		expect(body.timezone).toBe("UTC");
		expect(body.dns_resolvers).toEqual(["1.1.1.1", "8.8.8.8"]);
		expect(body.dns_search).toEqual(["example.com"]);
		expect(body.net_interfaces).toHaveLength(1);
		expect(body.net_interfaces?.[0].iface).toBe("eth0");
		expect(body.disks).toHaveLength(1);
		expect(body.disks?.[0].device).toBe("sda");
	});

	test("resolves hid (8-char hex) to host_id", async () => {
		await insertHost(db, "my-server.example.com");
		const hid = hashHostId("my-server.example.com");

		const res = await get(app, hid);
		expect(res.status).toBe(200);

		const body = (await res.json()) as HostDetailItem;
		expect(body.host_id).toBe("my-server.example.com");
	});

	test("unknown host → 404", async () => {
		const res = await get(app, "nonexistent");
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("not found");
	});

	test("null inventory fields returned as null", async () => {
		await insertHost(db, "host-bare");

		const res = await get(app, "host-bare");
		expect(res.status).toBe(200);

		const body = (await res.json()) as HostDetailItem;
		expect(body.cpu_logical).toBeNull();
		expect(body.cpu_physical).toBeNull();
		expect(body.mem_total_bytes).toBeNull();
		expect(body.swap_total_bytes).toBeNull();
		expect(body.virtualization).toBeNull();
		expect(body.boot_mode).toBeNull();
		expect(body.timezone).toBeNull();
		expect(body.dns_resolvers).toBeNull();
		expect(body.dns_search).toBeNull();
		expect(body.net_interfaces).toBeNull();
		expect(body.disks).toBeNull();
		expect(body.public_ip).toBeNull();
		expect(body.probe_version).toBeNull();
	});

	test("public_ip returned in detail response", async () => {
		await insertHost(db, "host-ip", { publicIp: "203.0.113.42" });

		const res = await get(app, "host-ip");
		expect(res.status).toBe(200);

		const body = (await res.json()) as HostDetailItem;
		expect(body.public_ip).toBe("203.0.113.42");
	});

	test("probe_version returned in detail response", async () => {
		await insertHost(db, "host-ver", { probeVersion: "0.5.1" });

		const res = await get(app, "host-ver");
		expect(res.status).toBe(200);

		const body = (await res.json()) as HostDetailItem;
		expect(body.probe_version).toBe("0.5.1");
	});

	test("includes latest metrics and status", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-met", { lastSeen: now });

		// Insert metrics
		await db
			.prepare(
				`INSERT INTO metrics_raw (host_id, ts, cpu_usage_pct, mem_used_pct, uptime_seconds,
         cpu_load1, cpu_load5, cpu_load15, cpu_iowait, cpu_steal, cpu_count,
         mem_total, mem_available, swap_total, swap_used, swap_used_pct, disk_json, net_json)
       VALUES (?, ?, 45.5, 72.0, 86400, 0, 0, 0, 0, 0, 4, 8e9, 4e9, 2e9, 0, 0, '[]', '[]')`,
			)
			.bind("host-met", now)
			.run();

		const res = await get(app, "host-met");
		const body = (await res.json()) as HostDetailItem;

		expect(body.cpu_usage_pct).toBe(45.5);
		expect(body.mem_used_pct).toBe(72.0);
		expect(body.uptime_seconds).toBe(86400);
		expect(body.status).toBe("healthy");
	});

	test("alert count and status derivation", async () => {
		const now = Math.floor(Date.now() / 1000);
		await insertHost(db, "host-alert", { lastSeen: now });

		await db
			.prepare(
				"INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message) VALUES (?, ?, ?, 95.0, ?, 'test')",
			)
			.bind("host-alert", "disk_full", "critical", now)
			.run();

		const res = await get(app, "host-alert");
		const body = (await res.json()) as HostDetailItem;

		expect(body.alert_count).toBe(1);
		expect(body.status).toBe("critical");
	});
});
