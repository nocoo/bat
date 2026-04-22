// GET /api/hosts/:id — return full host detail with inventory fields
import type { HostDetailItem } from "@bat/shared";
import { hashHostId, isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { Context } from "hono";
import { extractNetRates, extractRootDiskPct, safeParse } from "../lib/json-helpers.js";
import { resolveHostIdByHash } from "../lib/resolve-host.js";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";
import { getMaintenanceWindow } from "./monitoring.js";

interface DetailRow {
	host_id: string;
	hostname: string;
	os: string | null;
	kernel: string | null;
	arch: string | null;
	cpu_model: string | null;
	boot_time: number | null;
	last_seen: number;
	probe_version: string | null;
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
	public_ip: string | null;
	// Maintenance window
	maintenance_start: string | null;
	maintenance_end: string | null;
	maintenance_reason: string | null;
}

interface LatestMetrics {
	cpu_usage_pct: number | null;
	mem_used_pct: number | null;
	uptime_seconds: number | null;
	cpu_load1: number | null;
	swap_used_pct: number | null;
	disk_json: string | null;
	net_json: string | null;
}

interface AlertRow {
	severity: string;
	rule_id: string;
	message: string | null;
}

export async function hostDetailRoute(c: Context<AppEnv, "/api/hosts/:id">) {
	const idParam = c.req.param("id");
	const db = c.env.DB;

	const hostId = await resolveHostIdByHash(db, idParam);
	if (!hostId) {
		return c.json({ error: "Host not found" }, 404);
	}

	const host = await db
		.prepare(
			`SELECT host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen,
       probe_version, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes,
       virtualization, net_interfaces, disks, boot_mode,
       timezone, dns_resolvers, dns_search, public_ip,
       maintenance_start, maintenance_end, maintenance_reason
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
			`SELECT cpu_usage_pct, mem_used_pct, uptime_seconds, cpu_load1, swap_used_pct, disk_json, net_json
FROM metrics_raw WHERE host_id = ? ORDER BY ts DESC LIMIT 1`,
		)
		.bind(hostId)
		.first<LatestMetrics>();

	// Alerts for status derivation + count
	const alertsResult = await db
		.prepare("SELECT severity, rule_id, message FROM alert_states WHERE host_id = ?")
		.bind(hostId)
		.all<AlertRow>();
	const alerts = alertsResult.results;

	// Per-host port allowlist for status derivation
	const allowlistResult = await db
		.prepare("SELECT port FROM port_allowlist WHERE host_id = ?")
		.bind(hostId)
		.all<{ port: number }>();
	const allowedPorts =
		allowlistResult.results.length > 0
			? new Set(allowlistResult.results.map((r) => r.port))
			: undefined;

	const maintenance = getMaintenanceWindow(host);
	const status = deriveHostStatus(host.last_seen, now, alerts, allowedPorts, maintenance);
	const inMaintenance =
		maintenance !== null &&
		isInMaintenanceWindow(toUtcHHMM(now), maintenance.start, maintenance.end);
	const diskRootPct = extractRootDiskPct(metrics?.disk_json ?? null);
	const netRates = extractNetRates(metrics?.net_json ?? null);

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
		alert_count: inMaintenance ? 0 : alerts.length,
		cpu_logical: host.cpu_logical,
		cpu_physical: host.cpu_physical,
		mem_total_bytes: host.mem_total_bytes,
		virtualization: host.virtualization,
		public_ip: host.public_ip,
		probe_version: host.probe_version,
		cpu_load1: metrics?.cpu_load1 ?? null,
		swap_used_pct: metrics?.swap_used_pct ?? null,
		disk_root_used_pct: diskRootPct,
		net_rx_rate: netRates.rx,
		net_tx_rate: netRates.tx,
		cpu_sparkline: null, // detail page uses its own metrics endpoint
		mem_sparkline: null,
		net_sparkline: null,
		swap_total_bytes: host.swap_total_bytes,
		boot_mode: host.boot_mode,
		timezone: host.timezone,
		dns_resolvers: safeParse(host.dns_resolvers),
		dns_search: safeParse(host.dns_search),
		net_interfaces: safeParse(host.net_interfaces),
		disks: safeParse(host.disks),
		maintenance_start: host.maintenance_start,
		maintenance_end: host.maintenance_end,
		maintenance_reason: host.maintenance_reason,
	};

	return c.json(item);
}
