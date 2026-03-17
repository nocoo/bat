// GET /api/hosts — list all active hosts with overview DTO
import type { HostOverviewItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import type { Context } from "hono";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";

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
}

interface LatestMetrics {
	host_id: string;
	cpu_usage_pct: number | null;
	mem_used_pct: number | null;
	uptime_seconds: number | null;
}

interface AlertCount {
	host_id: string;
	alert_count: number;
}

interface AlertRow {
	host_id: string;
	severity: string;
}

export async function hostsListRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const now = Math.floor(Date.now() / 1000);

	// 1. Get all active hosts
	const hostsResult = await db
		.prepare(
			"SELECT host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, cpu_logical, cpu_physical, mem_total_bytes, virtualization FROM hosts WHERE is_active = 1",
		)
		.all<HostRow>();
	const hosts = hostsResult.results;

	if (hosts.length === 0) {
		return c.json([]);
	}

	const hostIds = hosts.map((h) => h.host_id);
	const placeholders = hostIds.map(() => "?").join(", ");

	// 2. Latest metrics per host via window function
	const metricsResult = await db
		.prepare(
			`SELECT host_id, cpu_usage_pct, mem_used_pct, uptime_seconds
FROM (
  SELECT host_id, cpu_usage_pct, mem_used_pct, uptime_seconds,
    ROW_NUMBER() OVER (PARTITION BY host_id ORDER BY ts DESC) as rn
  FROM metrics_raw
  WHERE host_id IN (${placeholders})
) WHERE rn = 1`,
		)
		.bind(...hostIds)
		.all<LatestMetrics>();

	const metricsMap = new Map<string, LatestMetrics>();
	for (const m of metricsResult.results) {
		metricsMap.set(m.host_id, m);
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
		.prepare(`SELECT host_id, severity FROM alert_states WHERE host_id IN (${placeholders})`)
		.bind(...hostIds)
		.all<AlertRow>();

	const alertsByHost = new Map<string, AlertRow[]>();
	for (const a of alertsResult.results) {
		const existing = alertsByHost.get(a.host_id) ?? [];
		existing.push(a);
		alertsByHost.set(a.host_id, existing);
	}

	// 5. Build response
	const items: HostOverviewItem[] = hosts.map((host) => {
		const metrics = metricsMap.get(host.host_id);
		const alerts = alertsByHost.get(host.host_id) ?? [];
		const status = deriveHostStatus(host.last_seen, now, alerts);

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
			alert_count: alertCountMap.get(host.host_id) ?? 0,
			cpu_logical: host.cpu_logical,
			cpu_physical: host.cpu_physical,
			mem_total_bytes: host.mem_total_bytes,
			virtualization: host.virtualization,
		};
	});

	return c.json(items);
}
