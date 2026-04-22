// GET /api/hosts — list all active hosts with overview DTO
import type { HostOverviewItem, SparklinePoint } from "@bat/shared";
import { hashHostId, isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { Context } from "hono";
import { extractNetRates, extractRootDiskPct } from "../lib/json-helpers.js";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";
import { buildAlertsByHost, buildAllowedByHost, getMaintenanceWindow } from "./monitoring.js";

/**
 * Pure helper: group sparkline rows into per-host CPU/mem/net arrays,
 * dropping individual null samples. Exported for unit tests.
 */
export function buildSparklinesByHost(
	rows: SparklineRow[],
): Map<
	string,
	{ cpu: SparklinePoint[]; mem: SparklinePoint[]; net: { ts: number; v: number }[] }
> {
	const map = new Map<
		string,
		{ cpu: SparklinePoint[]; mem: SparklinePoint[]; net: { ts: number; v: number }[] }
	>();
	for (const row of rows) {
		let entry = map.get(row.host_id);
		if (!entry) {
			entry = { cpu: [], mem: [], net: [] };
			map.set(row.host_id, entry);
		}
		if (row.cpu !== null) entry.cpu.push({ ts: row.ts, v: row.cpu });
		if (row.mem !== null) entry.mem.push({ ts: row.ts, v: row.mem });
		if (row.net !== null) entry.net.push({ ts: row.ts, v: row.net });
	}
	return map;
}

/**
 * Pure helper: normalise a raw byte-rate sparkline to a 0–100 scale so
 * network can share axes with CPU/memory in the UI. Returns `null` when
 * the input is empty. Exported for unit tests.
 */
export function normalizeNetSparkline(
	points: { ts: number; v: number }[],
): SparklinePoint[] | null {
	if (points.length === 0) {
		return null;
	}
	const maxNet = Math.max(...points.map((p) => p.v));
	if (maxNet > 0) {
		return points.map((p) => ({ ts: p.ts, v: (p.v / maxNet) * 100 }));
	}
	return points.map((p) => ({ ts: p.ts, v: 0 }));
}

interface HostRow {
	host_id: string;
	hostname: string;
	os: string | null;
	kernel: string | null;
	arch: string | null;
	cpu_model: string | null;
	boot_time: number | null;
	last_seen: number;
	// Host inventory scalar fields
	cpu_logical: number | null;
	cpu_physical: number | null;
	mem_total_bytes: number | null;
	virtualization: string | null;
	public_ip: string | null;
	probe_version: string | null;
	// Maintenance window
	maintenance_start: string | null;
	maintenance_end: string | null;
	maintenance_reason: string | null;
}

interface LatestMetrics {
	host_id: string;
	cpu_usage_pct: number | null;
	mem_used_pct: number | null;
	uptime_seconds: number | null;
	cpu_load1: number | null;
	swap_used_pct: number | null;
	disk_json: string | null;
	net_json: string | null;
}

interface AlertCount {
	host_id: string;
	alert_count: number;
}

interface AlertRow {
	host_id: string;
	severity: string;
	rule_id: string;
	message: string | null;
}

interface AllowedPortRow {
	host_id: string;
	port: number;
}

export interface SparklineRow {
	host_id: string;
	ts: number;
	cpu: number | null;
	mem: number | null;
	net: number | null;
}

export async function hostsListRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const now = Math.floor(Date.now() / 1000);

	// 1. Get all active hosts
	const hostsResult = await db
		.prepare(
			"SELECT host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, cpu_logical, cpu_physical, mem_total_bytes, virtualization, public_ip, probe_version, maintenance_start, maintenance_end, maintenance_reason FROM hosts WHERE is_active = 1",
		)
		.all<HostRow>();
	const hosts = hostsResult.results;

	if (hosts.length === 0) {
		return c.json([]);
	}

	const hostIds = hosts.map((h) => h.host_id);
	const placeholders = hostIds.map(() => "?").join(", ");

	// 2. Latest metrics per host — use per-host LIMIT 1 queries to leverage index
	// This reduces rows_read from O(total_rows) to O(host_count) by avoiding full table scan
	const metricsQueries = hostIds.map((hostId) =>
		db
			.prepare(
				`SELECT host_id, cpu_usage_pct, mem_used_pct, uptime_seconds, cpu_load1, swap_used_pct, disk_json, net_json
FROM metrics_raw WHERE host_id = ? ORDER BY ts DESC LIMIT 1`,
			)
			.bind(hostId),
	);
	const metricsResults = await db.batch(metricsQueries);

	const metricsMap = new Map<string, LatestMetrics>();
	for (const result of metricsResults) {
		const row = result.results?.[0] as LatestMetrics | undefined;
		if (row) {
			metricsMap.set(row.host_id, row);
		}
	}

	// 3. Alert counts per host
	const alertCountResult = await db
		.prepare(
			`SELECT host_id, COUNT(*) as alert_count FROM alert_states WHERE host_id IN (${placeholders}) GROUP BY host_id`,
		)
		.bind(...hostIds)
		.all<AlertCount>();

	const alertCountMap = new Map<string, number>();
	for (const a of alertCountResult.results) {
		alertCountMap.set(a.host_id, a.alert_count);
	}

	// 4. All alerts for status derivation
	const alertsResult = await db
		.prepare(
			`SELECT host_id, severity, rule_id, message FROM alert_states WHERE host_id IN (${placeholders})`,
		)
		.bind(...hostIds)
		.all<AlertRow>();

	const alertsByHost = buildAlertsByHost(alertsResult.results);

	// 4b. Per-host port allowlist for status derivation
	const allowlistResult = await db
		.prepare(`SELECT host_id, port FROM port_allowlist WHERE host_id IN (${placeholders})`)
		.bind(...hostIds)
		.all<AllowedPortRow>();

	const allowedByHost = buildAllowedByHost(allowlistResult.results);

	// 5. Sparkline data — last 24h hourly aggregates
	const sparklineCutoff = now - 86400;
	const sparklineResult = await db
		.prepare(
			`SELECT host_id, hour_ts as ts, cpu_usage_avg as cpu, mem_used_pct_avg as mem,
	CASE WHEN net_rx_bytes_avg IS NOT NULL AND net_tx_bytes_avg IS NOT NULL
		THEN net_rx_bytes_avg + net_tx_bytes_avg ELSE NULL END as net
FROM metrics_hourly
WHERE host_id IN (${placeholders}) AND hour_ts >= ?
ORDER BY host_id, hour_ts ASC`,
		)
		.bind(...hostIds, sparklineCutoff)
		.all<SparklineRow>();

	const sparklinesByHost = buildSparklinesByHost(sparklineResult.results);

	// 6. Build response
	const nowHHMM = toUtcHHMM(now);
	const items: HostOverviewItem[] = hosts.map((host) => {
		const metrics = metricsMap.get(host.host_id);
		const alerts = alertsByHost.get(host.host_id) ?? [];
		const allowedPorts = allowedByHost.get(host.host_id);
		const maintenance = getMaintenanceWindow(host);
		const status = deriveHostStatus(host.last_seen, now, alerts, allowedPorts, maintenance);
		const inMaintenance =
			maintenance !== null && isInMaintenanceWindow(nowHHMM, maintenance.start, maintenance.end);
		const diskRootPct = extractRootDiskPct(metrics?.disk_json ?? null);
		const netRates = extractNetRates(metrics?.net_json ?? null);
		const sparklines = sparklinesByHost.get(host.host_id);

		// Normalize net sparkline (bytes/sec) to 0–100 using max-normalization
		const netSparkline = normalizeNetSparkline(sparklines?.net ?? []);

		return {
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
			alert_count: inMaintenance ? 0 : (alertCountMap.get(host.host_id) ?? 0),
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
			cpu_sparkline: sparklines && sparklines.cpu.length > 0 ? sparklines.cpu : null,
			mem_sparkline: sparklines && sparklines.mem.length > 0 ? sparklines.mem : null,
			net_sparkline: netSparkline,
			maintenance_start: host.maintenance_start,
			maintenance_end: host.maintenance_end,
			maintenance_reason: host.maintenance_reason,
		};
	});

	return c.json(items);
}
