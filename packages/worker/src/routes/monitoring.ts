// GET /api/monitoring/* — monitoring endpoints for Uptime Kuma integration
// Design doc: docs/16-monitoring-api.md
import { hashHostId, isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { HostStatus } from "@bat/shared";
import type { Context } from "hono";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";

// --- Shared types ---

interface HostRow {
	host_id: string;
	hostname: string;
	last_seen: number;
	maintenance_start: string | null;
	maintenance_end: string | null;
}

interface AlertRow {
	host_id: string;
	severity: string;
	rule_id: string;
	message: string | null;
	value: number | null;
	triggered_at: number;
}

interface AllowedPortRow {
	host_id: string;
	port: number;
}

interface TagRow {
	host_id: string;
	name: string;
}

const CACHE_HEADERS = { "Cache-Control": "private, no-store" };

// --- Shared query helpers ---

async function queryActiveHosts(db: D1Database): Promise<HostRow[]> {
	const result = await db
		.prepare(
			"SELECT host_id, hostname, last_seen, maintenance_start, maintenance_end FROM hosts WHERE is_active = 1",
		)
		.all<HostRow>();
	return result.results;
}

async function queryAlerts(db: D1Database, hostIds: string[]): Promise<AlertRow[]> {
	if (hostIds.length === 0) {
		return [];
	}
	const placeholders = hostIds.map(() => "?").join(", ");
	const result = await db
		.prepare(
			`SELECT host_id, severity, rule_id, message, value, triggered_at FROM alert_states WHERE host_id IN (${placeholders})`,
		)
		.bind(...hostIds)
		.all<AlertRow>();
	return result.results;
}

async function queryAllowlist(db: D1Database, hostIds: string[]): Promise<AllowedPortRow[]> {
	if (hostIds.length === 0) {
		return [];
	}
	const placeholders = hostIds.map(() => "?").join(", ");
	const result = await db
		.prepare(`SELECT host_id, port FROM port_allowlist WHERE host_id IN (${placeholders})`)
		.bind(...hostIds)
		.all<AllowedPortRow>();
	return result.results;
}

async function queryTags(db: D1Database, hostIds: string[]): Promise<TagRow[]> {
	if (hostIds.length === 0) {
		return [];
	}
	const placeholders = hostIds.map(() => "?").join(", ");
	const result = await db
		.prepare(
			`SELECT ht.host_id, t.name FROM host_tags ht JOIN tags t ON ht.tag_id = t.id WHERE ht.host_id IN (${placeholders})`,
		)
		.bind(...hostIds)
		.all<TagRow>();
	return result.results;
}

// --- Map builders ---

function buildAlertsByHost(alerts: AlertRow[]): Map<string, AlertRow[]> {
	const map = new Map<string, AlertRow[]>();
	for (const a of alerts) {
		const list = map.get(a.host_id) ?? [];
		list.push(a);
		map.set(a.host_id, list);
	}
	return map;
}

function buildAllowedByHost(rows: AllowedPortRow[]): Map<string, Set<number>> {
	const map = new Map<string, Set<number>>();
	for (const row of rows) {
		let s = map.get(row.host_id);
		if (!s) {
			s = new Set();
			map.set(row.host_id, s);
		}
		s.add(row.port);
	}
	return map;
}

function buildTagsByHost(rows: TagRow[]): Map<string, string[]> {
	const map = new Map<string, string[]>();
	for (const row of rows) {
		const list = map.get(row.host_id) ?? [];
		list.push(row.name);
		map.set(row.host_id, list);
	}
	return map;
}

/** Map alert rows to response-safe objects */
function formatAlerts(alerts: AlertRow[]): {
	rule_id: string;
	severity: string;
	value: number | null;
	message: string | null;
	triggered_at: number;
}[] {
	return alerts.map((a) => ({
		rule_id: a.rule_id,
		severity: a.severity,
		value: a.value,
		message: a.message,
		triggered_at: a.triggered_at,
	}));
}

// Tier priority for worst-of derivation
const TIER_PRIORITY: Record<string, number> = {
	healthy: 0,
	warning: 1,
	critical: 2,
	offline: 3,
	maintenance: 4,
};

function worstTier(a: HostStatus, b: HostStatus): HostStatus {
	return (TIER_PRIORITY[a] ?? 0) >= (TIER_PRIORITY[b] ?? 0) ? a : b;
}

// --- Resolve host_id from hid or raw id ---

async function resolveHostId(db: D1Database, id: string): Promise<string | null> {
	const isHid = /^[0-9a-f]{8}$/.test(id);
	if (!isHid) {
		return id;
	}

	const result = await db
		.prepare("SELECT host_id FROM hosts WHERE is_active = 1")
		.all<{ host_id: string }>();
	for (const row of result.results) {
		if (hashHostId(row.host_id) === id) {
			return row.host_id;
		}
	}
	return null;
}

// --- Route handlers ---

/** GET /api/monitoring/hosts — list all hosts with health tier and alerts */
export async function monitoringHostsRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const now = Math.floor(Date.now() / 1000);

	const hosts = await queryActiveHosts(db);
	if (hosts.length === 0) {
		return c.json(
			{
				status: "ok",
				host_count: 0,
				by_tier: { healthy: 0, warning: 0, critical: 0, offline: 0, maintenance: 0 },
				hosts: [],
			},
			200,
			CACHE_HEADERS,
		);
	}

	const hostIds = hosts.map((h) => h.host_id);
	const [alerts, allowlistRows] = await Promise.all([
		queryAlerts(db, hostIds),
		queryAllowlist(db, hostIds),
	]);

	const alertsByHost = buildAlertsByHost(alerts);
	const allowedByHost = buildAllowedByHost(allowlistRows);

	// Query params
	const tierFilter = c.req.query("tier") as HostStatus | undefined;
	const tagFilters = c.req.queries("tag") ?? [];

	// Tags needed only for tag filtering
	let tagsByHost: Map<string, string[]> | null = null;
	if (tagFilters.length > 0) {
		const tagRows = await queryTags(db, hostIds);
		tagsByHost = buildTagsByHost(tagRows);
	}

	const byTier: Record<string, number> = {
		healthy: 0,
		warning: 0,
		critical: 0,
		offline: 0,
		maintenance: 0,
	};
	const hostItems: unknown[] = [];

	for (const host of hosts) {
		const hostAlerts = alertsByHost.get(host.host_id) ?? [];
		const allowedPorts = allowedByHost.get(host.host_id);
		const mw =
			host.maintenance_start && host.maintenance_end
				? { start: host.maintenance_start, end: host.maintenance_end }
				: null;
		const tier = deriveHostStatus(host.last_seen, now, hostAlerts, allowedPorts, mw);
		const inMaintenance = tier === "maintenance";

		// Tag filtering (AND logic)
		if (tagsByHost && tagFilters.length > 0) {
			const hostTags = tagsByHost.get(host.host_id) ?? [];
			const hasAll = tagFilters.every((t) => hostTags.includes(t));
			if (!hasAll) {
				continue;
			}
		}

		// Tier filtering
		if (tierFilter && tier !== tierFilter) {
			continue;
		}

		byTier[tier]++;
		hostItems.push({
			host_id: host.host_id,
			hostname: host.hostname,
			tier,
			last_seen: host.last_seen,
			alert_count: inMaintenance ? 0 : hostAlerts.length,
			alerts: inMaintenance ? [] : formatAlerts(hostAlerts),
		});
	}

	return c.json(
		{
			status: "ok",
			host_count: hostItems.length,
			by_tier: byTier,
			hosts: hostItems,
		},
		200,
		CACHE_HEADERS,
	);
}

/** GET /api/monitoring/hosts/:id — single host health for keyword monitoring */
export async function monitoringHostDetailRoute(c: Context<AppEnv, "/api/monitoring/hosts/:id">) {
	const db = c.env.DB;
	const idParam = c.req.param("id");
	const now = Math.floor(Date.now() / 1000);

	const hostId = await resolveHostId(db, idParam);
	if (!hostId) {
		return c.json({ error: "Host not found" }, 404);
	}

	const host = await db
		.prepare(
			"SELECT host_id, hostname, last_seen, maintenance_start, maintenance_end FROM hosts WHERE host_id = ? AND is_active = 1",
		)
		.bind(hostId)
		.first<HostRow>();

	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}

	// Parallel queries
	const [alertRows, allowlistRows, tagRows, metrics] = await Promise.all([
		queryAlerts(db, [hostId]),
		queryAllowlist(db, [hostId]),
		queryTags(db, [hostId]),
		db
			.prepare("SELECT uptime_seconds FROM metrics_raw WHERE host_id = ? ORDER BY ts DESC LIMIT 1")
			.bind(hostId)
			.first<{ uptime_seconds: number | null }>(),
	]);

	const hostAlerts = alertRows.filter((a) => a.host_id === hostId);
	const allowedPorts =
		allowlistRows.length > 0 ? new Set(allowlistRows.map((r) => r.port)) : undefined;
	const mw =
		host.maintenance_start && host.maintenance_end
			? { start: host.maintenance_start, end: host.maintenance_end }
			: null;
	const tier = deriveHostStatus(host.last_seen, now, hostAlerts, allowedPorts, mw);
	const inMaintenance = tier === "maintenance";
	const tags = tagRows.map((t) => t.name).sort();

	return c.json(
		{
			status: "ok",
			host_id: host.host_id,
			hostname: host.hostname,
			tier,
			last_seen: host.last_seen,
			uptime_seconds: metrics?.uptime_seconds ?? null,
			alert_count: inMaintenance ? 0 : hostAlerts.length,
			alerts: inMaintenance ? [] : formatAlerts(hostAlerts),
			tags,
		},
		200,
		CACHE_HEADERS,
	);
}

/** GET /api/monitoring/groups — aggregate health by tag group */
export async function monitoringGroupsRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const now = Math.floor(Date.now() / 1000);

	const hosts = await queryActiveHosts(db);
	if (hosts.length === 0) {
		return c.json({ status: "ok", groups: [] }, 200, CACHE_HEADERS);
	}

	const hostIds = hosts.map((h) => h.host_id);
	const [alerts, allowlistRows, tagRows] = await Promise.all([
		queryAlerts(db, hostIds),
		queryAllowlist(db, hostIds),
		queryTags(db, hostIds),
	]);

	const alertsByHost = buildAlertsByHost(alerts);
	const allowedByHost = buildAllowedByHost(allowlistRows);
	const tagsByHost = buildTagsByHost(tagRows);

	// Derive tier per host
	const hostTiers = new Map<string, HostStatus>();
	const hostAlertCounts = new Map<string, number>();
	for (const host of hosts) {
		const hostAlerts = alertsByHost.get(host.host_id) ?? [];
		const allowedPorts = allowedByHost.get(host.host_id);
		const mw =
			host.maintenance_start && host.maintenance_end
				? { start: host.maintenance_start, end: host.maintenance_end }
				: null;
		const tier = deriveHostStatus(host.last_seen, now, hostAlerts, allowedPorts, mw);
		hostTiers.set(host.host_id, tier);
		hostAlertCounts.set(host.host_id, tier === "maintenance" ? 0 : hostAlerts.length);
	}

	// Group by tag — a host appears in every group it belongs to
	interface GroupHostRef {
		host_id: string;
		hostname: string;
	}

	interface GroupAcc {
		hosts: GroupHostRef[];
		byTier: {
			healthy: number;
			warning: number;
			critical: number;
			offline: number;
			maintenance: number;
		};
		alertCount: number;
		worstTier: HostStatus;
	}

	const groups = new Map<string, GroupAcc>();

	function addToGroup(
		tag: string,
		hostId: string,
		hostname: string,
		tier: HostStatus,
		alertCount: number,
	) {
		let g = groups.get(tag);
		if (!g) {
			g = {
				hosts: [],
				byTier: { healthy: 0, warning: 0, critical: 0, offline: 0, maintenance: 0 },
				alertCount: 0,
				worstTier: "healthy",
			};
			groups.set(tag, g);
		}
		g.hosts.push({ host_id: hostId, hostname });
		g.byTier[tier]++;
		g.alertCount += alertCount;
		g.worstTier = worstTier(g.worstTier, tier);
	}

	for (const host of hosts) {
		const tier = hostTiers.get(host.host_id) ?? ("healthy" as HostStatus);
		const alertCount = hostAlertCounts.get(host.host_id) ?? 0;
		const tags = tagsByHost.get(host.host_id);

		if (!tags || tags.length === 0) {
			addToGroup("(untagged)", host.host_id, host.hostname, tier, alertCount);
		} else {
			for (const tag of tags) {
				addToGroup(tag, host.host_id, host.hostname, tier, alertCount);
			}
		}
	}

	const result = Array.from(groups.entries()).map(([tag, g]) => ({
		tag,
		host_count: g.hosts.length,
		tier: g.worstTier,
		by_tier: g.byTier,
		alert_count: g.alertCount,
		hosts: g.hosts,
	}));

	return c.json({ status: "ok", groups: result }, 200, CACHE_HEADERS);
}

/** GET /api/monitoring/alerts — active alerts enriched for monitoring */
export async function monitoringAlertsRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const now = Math.floor(Date.now() / 1000);

	// Alerts with hostname + maintenance window
	const alertResult = await db
		.prepare(
			`SELECT a.host_id, a.rule_id, a.severity, a.value, a.triggered_at, a.message,
       h.hostname, h.maintenance_start, h.maintenance_end
FROM alert_states a
JOIN hosts h ON a.host_id = h.host_id
WHERE h.is_active = 1
ORDER BY a.triggered_at DESC`,
		)
		.all<
			AlertRow & {
				hostname: string;
				maintenance_start: string | null;
				maintenance_end: string | null;
			}
		>();

	// Query-time filtering: exclude alerts for hosts currently in maintenance
	const nowHHMM = toUtcHHMM(now);
	const nonMaintenanceAlerts = alertResult.results.filter((a) => {
		if (
			a.maintenance_start &&
			a.maintenance_end &&
			isInMaintenanceWindow(nowHHMM, a.maintenance_start, a.maintenance_end)
		) {
			return false;
		}
		return true;
	});

	// Tags for enrichment
	const hostIds = [...new Set(nonMaintenanceAlerts.map((a) => a.host_id))];
	const tagRows = await queryTags(db, hostIds);
	const tagsByHost = buildTagsByHost(tagRows);

	// Query params
	const severityFilter = c.req.query("severity");
	const tagFilters = c.req.queries("tag") ?? [];

	const bySeverity = { critical: 0, warning: 0, info: 0 };
	const alertItems: unknown[] = [];

	for (const alert of nonMaintenanceAlerts) {
		const sev = alert.severity as "critical" | "warning" | "info";

		// Severity filter
		if (severityFilter && alert.severity !== severityFilter) {
			continue;
		}

		// Tag filter (AND logic)
		const hostTags = tagsByHost.get(alert.host_id) ?? [];
		if (tagFilters.length > 0) {
			const hasAll = tagFilters.every((t) => hostTags.includes(t));
			if (!hasAll) {
				continue;
			}
		}

		if (sev in bySeverity) {
			bySeverity[sev]++;
		}

		alertItems.push({
			host_id: alert.host_id,
			hostname: (alert as unknown as { hostname: string }).hostname,
			rule_id: alert.rule_id,
			severity: alert.severity,
			value: alert.value,
			message: alert.message,
			triggered_at: alert.triggered_at,
			duration_seconds: now - alert.triggered_at,
			tags: hostTags,
		});
	}

	return c.json(
		{
			status: "ok",
			alert_count: alertItems.length,
			by_severity: bySeverity,
			alerts: alertItems,
		},
		200,
		CACHE_HEADERS,
	);
}
