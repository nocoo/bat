// GET /api/hosts — list all active hosts with overview DTO
import type { HostOverviewItem, SparklinePoint } from "@bat/shared";
import { hashHostId, isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { Context } from "hono";
import { tryReadCache, writeCache } from "../lib/dashboard-cache.js";
import { extractNetRates, extractRootDiskPct } from "../lib/json-helpers.js";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";
import { buildAlertsByHost, getMaintenanceWindow } from "./monitoring.js";

const HOSTS_CACHE_TTL_SECONDS = 30;

/**
 * Pure helper: group sparkline rows into per-host CPU/mem/net arrays,
 * dropping individual null samples. Exported for unit tests.
 */
export function buildSparklinesByHost(
	rows: SparklineRow[],
): Map<string, { cpu: SparklinePoint[]; mem: SparklinePoint[]; net: { ts: number; v: number }[] }> {
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
		if (row.cpu !== null) {
			entry.cpu.push({ ts: row.ts, v: row.cpu });
		}
		if (row.mem !== null) {
			entry.mem.push({ ts: row.ts, v: row.mem });
		}
		if (row.net !== null) {
			entry.net.push({ ts: row.ts, v: row.net });
		}
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

export interface SparklineRow {
	host_id: string;
	ts: number;
	cpu: number | null;
	mem: number | null;
	net: number | null;
}

export async function hostsListRoute(c: Context<AppEnv>) {
	// Short-TTL KV cache — stale tolerated up to TTL. Disabled outside
	// production so dev / e2e snapshots see fresh state. Cache API is not
	// usable behind Cloudflare Access, so this is KV-backed.
	const cacheEnabled = c.env.ENVIRONMENT === "production";
	const cacheOpts = { route: "hosts", ttlSeconds: HOSTS_CACHE_TTL_SECONDS };
	if (cacheEnabled) {
		const cached = await tryReadCache(c.env.BAT_KV, c.req.raw, cacheOpts);
		if (cached) {
			return cached;
		}
	}

	const repos = c.var.repos;
	const now = Math.floor(Date.now() / 1000);

	const hosts = await repos.hosts.listOverviewRows();

	if (hosts.length === 0) {
		const empty = c.json([]);
		if (cacheEnabled) {
			await writeCache(c.env.BAT_KV, c.req.raw, empty, cacheOpts);
		}
		return empty;
	}

	const hostIds = hosts.map((h) => h.host_id);

	const [metricsRows, alertCountMap, alertRows, allowedByHost, sparklineRows] = await Promise.all([
		repos.hosts.getLatestMetricsBatch(hostIds),
		repos.alerts.countByHost(hostIds),
		repos.alerts.listForHosts(hostIds),
		repos.ports.listForHosts(hostIds),
		repos.hosts.listSparklineRowsSince(hostIds, now - 86400),
	]);

	const metricsMap = new Map(metricsRows.map((row) => [row.host_id, row]));
	const alertsByHost = buildAlertsByHost(alertRows);
	const sparklinesByHost = buildSparklinesByHost(sparklineRows);

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

	const response = c.json(items);
	if (cacheEnabled) {
		await writeCache(c.env.BAT_KV, c.req.raw, response, cacheOpts);
	}
	return response;
}
