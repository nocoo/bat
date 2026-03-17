// GET /api/hosts/:id — return full host detail with inventory fields
import type { HostDetailItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import type { Context } from "hono";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";

interface DetailRow {
	host_id: string;
	hostname: string;
	os: string | null;
	kernel: string | null;
	arch: string | null;
	cpu_model: string | null;
	boot_time: number | null;
	last_seen: number;
	cpu_logical: number | null;
	cpu_physical: number | null;
	mem_total_bytes: number | null;
	swap_total_bytes: number | null;
	virtualization: string | null;
	net_interfaces: string | null;
	disks: string | null;
	boot_mode: string | null;
	timezone: string | null;
	dns_resolvers: string | null;
	dns_search: string | null;
}

interface LatestMetrics {
	cpu_usage_pct: number | null;
	mem_used_pct: number | null;
	uptime_seconds: number | null;
}

interface AlertRow {
	severity: string;
}

/**
 * Resolve the route param to a real host_id.
 * If `id` is an 8-char hex hid, scan active hosts to find the match.
 */
async function resolveHostId(db: D1Database, id: string): Promise<string | null> {
	const isHid = /^[0-9a-f]{8}$/.test(id);
	if (!isHid) return id;

	const result = await db
		.prepare("SELECT host_id FROM hosts WHERE is_active = 1")
		.all<{ host_id: string }>();
	for (const row of result.results) {
		if (hashHostId(row.host_id) === id) return row.host_id;
	}
	return null;
}

function safeParse<T>(json: string | null): T | null {
	if (!json) return null;
	try {
		return JSON.parse(json) as T;
	} catch {
		return null;
	}
}

export async function hostDetailRoute(c: Context<AppEnv, "/api/hosts/:id">) {
	const idParam = c.req.param("id");
	const db = c.env.DB;

	const hostId = await resolveHostId(db, idParam);
	if (!hostId) {
		return c.json({ error: "Host not found" }, 404);
	}

	const host = await db
		.prepare(
			`SELECT host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen,
       cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes,
       virtualization, net_interfaces, disks, boot_mode,
       timezone, dns_resolvers, dns_search
FROM hosts WHERE host_id = ? AND is_active = 1`,
		)
		.bind(hostId)
		.first<DetailRow>();

	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}

	const now = Math.floor(Date.now() / 1000);

	// Latest metrics
	const metrics = await db
		.prepare(
			`SELECT cpu_usage_pct, mem_used_pct, uptime_seconds
FROM metrics_raw WHERE host_id = ? ORDER BY ts DESC LIMIT 1`,
		)
		.bind(hostId)
		.first<LatestMetrics>();

	// Alerts for status derivation + count
	const alertsResult = await db
		.prepare("SELECT severity FROM alert_states WHERE host_id = ?")
		.bind(hostId)
		.all<AlertRow>();
	const alerts = alertsResult.results;
	const status = deriveHostStatus(host.last_seen, now, alerts);

	const item: HostDetailItem = {
		hid: hashHostId(host.host_id),
		host_id: host.host_id,
		hostname: host.hostname,
		os: host.os,
		kernel: host.kernel,
		arch: host.arch,
		cpu_model: host.cpu_model,
		boot_time: host.boot_time,
		status,
		cpu_usage_pct: metrics?.cpu_usage_pct ?? null,
		mem_used_pct: metrics?.mem_used_pct ?? null,
		uptime_seconds: metrics?.uptime_seconds ?? null,
		last_seen: host.last_seen,
		alert_count: alerts.length,
		cpu_logical: host.cpu_logical,
		cpu_physical: host.cpu_physical,
		mem_total_bytes: host.mem_total_bytes,
		virtualization: host.virtualization,
		swap_total_bytes: host.swap_total_bytes,
		boot_mode: host.boot_mode,
		timezone: host.timezone,
		dns_resolvers: safeParse(host.dns_resolvers),
		dns_search: safeParse(host.dns_search),
		net_interfaces: safeParse(host.net_interfaces),
		disks: safeParse(host.disks),
	};

	return c.json(item);
}
