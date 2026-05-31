// GET /api/monitoring/* — monitoring endpoints for Uptime Kuma integration
// Design doc: docs/16-monitoring-api.md
import { isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { HostStatus } from "@bat/shared";
import type { Context } from "hono";
import {
	freshestLastSeen,
	loadLastSeen,
	loadObservedSeenBatch,
} from "../lib/host-lastseen-cache.js";
import { resolveHostIdByHash } from "../lib/resolve-host.js";
import type { AlertReadRow } from "../repos/types.js";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";

// --- Shared types ---

export type AlertRow = AlertReadRow;

/**
 * Pure helper: convert a host row's maintenance_start/end fields into the
 * `{ start, end } | null` shape accepted by `deriveHostStatus`. A window
 * is only returned when both endpoints are present.
 */
export function getMaintenanceWindow(host: {
	maintenance_start: string | null;
	maintenance_end: string | null;
}): { start: string; end: string } | null {
	return host.maintenance_start && host.maintenance_end
		? { start: host.maintenance_start, end: host.maintenance_end }
		: null;
}

const CACHE_HEADERS = { "Cache-Control": "private, no-store" };

// --- Map builders ---

export function buildAlertsByHost<T extends { host_id: string }>(alerts: T[]): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const a of alerts) {
		const list = map.get(a.host_id) ?? [];
		list.push(a);
		map.set(a.host_id, list);
	}
	return map;
}

/** Map alert rows to response-safe objects */
export function formatAlerts(alerts: AlertRow[]): {
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

export function worstTier(a: HostStatus, b: HostStatus): HostStatus {
	return (TIER_PRIORITY[a] ?? 0) >= (TIER_PRIORITY[b] ?? 0) ? a : b;
}

// --- Route handlers ---

/** GET /api/monitoring/hosts — list all hosts with health tier and alerts */
export async function monitoringHostsRoute(c: Context<AppEnv>) {
	const repos = c.var.repos;
	const now = Math.floor(Date.now() / 1000);

	const hosts = await repos.hosts.listStatusRows();
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
	const [alerts, allowedByHost, observedMap] = await Promise.all([
		repos.alerts.listForHosts(hostIds),
		repos.ports.listForHosts(hostIds),
		loadObservedSeenBatch(c.env.BAT_KV, hostIds),
	]);

	const alertsByHost = buildAlertsByHost(alerts);

	// Query params
	const tierFilter = c.req.query("tier") as HostStatus | undefined;
	const tagFilters = c.req.queries("tag") ?? [];

	// Tags needed only for tag filtering
	let tagsByHost: Map<string, string[]> | null = null;
	if (tagFilters.length > 0) {
		tagsByHost = await repos.tags.listNamesForHosts(hostIds);
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
		const mw = getMaintenanceWindow(host);
		const lastSeen = freshestLastSeen(host.last_seen, observedMap.get(host.host_id));
		const tier = deriveHostStatus(lastSeen, now, hostAlerts, allowedPorts, mw);
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

		byTier[tier] = (byTier[tier] ?? 0) + 1;
		hostItems.push({
			host_id: host.host_id,
			hostname: host.hostname,
			tier,
			last_seen: lastSeen,
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
	const repos = c.var.repos;
	const idParam = c.req.param("id");
	const now = Math.floor(Date.now() / 1000);

	const hostId = await resolveHostIdByHash(repos.hosts, idParam);
	if (!hostId) {
		return c.json({ error: "Host not found" }, 404);
	}

	const host = await repos.hosts.getStatusRow(hostId);

	if (!host) {
		return c.json({ error: "Host not found" }, 404);
	}

	const [hostAlerts, allowedByHost, tagsByHost, uptime, observedSnap] = await Promise.all([
		repos.alerts.listForHosts([hostId]),
		repos.ports.listForHosts([hostId]),
		repos.tags.listNamesForHosts([hostId]),
		repos.hosts.getLatestUptime(hostId),
		loadLastSeen(c.env.BAT_KV, hostId),
	]);

	const allowedPorts = allowedByHost.get(hostId);
	const mw = getMaintenanceWindow(host);
	const lastSeen = freshestLastSeen(host.last_seen, observedSnap?.last_observed_at);
	const tier = deriveHostStatus(lastSeen, now, hostAlerts, allowedPorts, mw);
	const inMaintenance = tier === "maintenance";
	const tags = (tagsByHost.get(hostId) ?? []).slice().sort();

	return c.json(
		{
			status: "ok",
			host_id: host.host_id,
			hostname: host.hostname,
			tier,
			last_seen: lastSeen,
			uptime_seconds: uptime,
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
	const repos = c.var.repos;
	const now = Math.floor(Date.now() / 1000);

	const hosts = await repos.hosts.listStatusRows();
	if (hosts.length === 0) {
		return c.json({ status: "ok", groups: [] }, 200, CACHE_HEADERS);
	}

	const hostIds = hosts.map((h) => h.host_id);
	const [alerts, allowedByHost, tagsByHost, observedMap] = await Promise.all([
		repos.alerts.listForHosts(hostIds),
		repos.ports.listForHosts(hostIds),
		repos.tags.listNamesForHosts(hostIds),
		loadObservedSeenBatch(c.env.BAT_KV, hostIds),
	]);

	const alertsByHost = buildAlertsByHost(alerts);

	// Derive tier per host
	const hostTiers = new Map<string, HostStatus>();
	const hostAlertCounts = new Map<string, number>();
	for (const host of hosts) {
		const hostAlerts = alertsByHost.get(host.host_id) ?? [];
		const allowedPorts = allowedByHost.get(host.host_id);
		const mw = getMaintenanceWindow(host);
		const lastSeen = freshestLastSeen(host.last_seen, observedMap.get(host.host_id));
		const tier = deriveHostStatus(lastSeen, now, hostAlerts, allowedPorts, mw);
		hostTiers.set(host.host_id, tier);
		hostAlertCounts.set(host.host_id, tier === "maintenance" ? 0 : hostAlerts.length);
	}

	const result = buildTagGroups(hosts, hostTiers, hostAlertCounts, tagsByHost);

	return c.json({ status: "ok", groups: result }, 200, CACHE_HEADERS);
}

export interface MonitoringGroup {
	tag: string;
	host_count: number;
	tier: HostStatus;
	by_tier: {
		healthy: number;
		warning: number;
		critical: number;
		offline: number;
		maintenance: number;
	};
	alert_count: number;
	hosts: { host_id: string; hostname: string }[];
}

/**
 * Pure helper: build tag-grouped monitoring summary.
 * Each host is added to every tag group it belongs to; untagged hosts land
 * in a synthetic `(untagged)` group. Per-group counters track tier
 * distribution and worst observed tier.
 */
export function buildTagGroups(
	hosts: { host_id: string; hostname: string }[],
	hostTiers: Map<string, HostStatus>,
	hostAlertCounts: Map<string, number>,
	tagsByHost: Map<string, string[]>,
): MonitoringGroup[] {
	interface GroupAcc {
		hosts: { host_id: string; hostname: string }[];
		byTier: MonitoringGroup["by_tier"];
		alertCount: number;
		worstTier: HostStatus;
	}

	const groups = new Map<string, GroupAcc>();

	for (const host of hosts) {
		const tier = hostTiers.get(host.host_id) ?? ("healthy" as HostStatus);
		const alertCount = hostAlertCounts.get(host.host_id) ?? 0;
		const hostTags = tagsByHost.get(host.host_id);
		const tags = hostTags && hostTags.length > 0 ? hostTags : ["(untagged)"];

		for (const tag of tags) {
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
			g.hosts.push({ host_id: host.host_id, hostname: host.hostname });
			g.byTier[tier]++;
			g.alertCount += alertCount;
			g.worstTier = worstTier(g.worstTier, tier);
		}
	}

	return Array.from(groups.entries()).map(([tag, g]) => ({
		tag,
		host_count: g.hosts.length,
		tier: g.worstTier,
		by_tier: g.byTier,
		alert_count: g.alertCount,
		hosts: g.hosts,
	}));
}

/** GET /api/monitoring/alerts — active alerts enriched for monitoring */
export interface MonitoringAlertRow extends AlertRow {
	hostname: string;
	maintenance_start: string | null;
	maintenance_end: string | null;
}

/**
 * Pure helper: drop alerts whose host is currently inside its maintenance
 * window. `nowHHMM` should be produced via `toUtcHHMM(now)`.
 */
export function filterNonMaintenanceAlerts<
	A extends {
		maintenance_start: string | null;
		maintenance_end: string | null;
	},
>(alerts: A[], nowHHMM: string): A[] {
	return alerts.filter((a) => {
		if (
			a.maintenance_start &&
			a.maintenance_end &&
			isInMaintenanceWindow(nowHHMM, a.maintenance_start, a.maintenance_end)
		) {
			return false;
		}
		return true;
	});
}

export interface MonitoringAlertItem {
	host_id: string;
	hostname: string;
	rule_id: string;
	severity: string;
	value: number | null;
	message: string | null;
	triggered_at: number;
	duration_seconds: number;
	tags: string[];
}

export interface MonitoringAlertsResult {
	alert_count: number;
	by_severity: { critical: number; warning: number; info: number };
	alerts: MonitoringAlertItem[];
}

/**
 * Pure helper: apply severity/tag filters, count by severity, and shape
 * alert rows into the wire `MonitoringAlertItem` DTO.
 */
export function buildMonitoringAlertsResult(
	alerts: MonitoringAlertRow[],
	tagsByHost: Map<string, string[]>,
	filters: { severity: string | undefined; tags: string[] },
	now: number,
): MonitoringAlertsResult {
	const by_severity = { critical: 0, warning: 0, info: 0 };
	const items: MonitoringAlertItem[] = [];

	for (const alert of alerts) {
		if (filters.severity && alert.severity !== filters.severity) {
			continue;
		}

		const hostTags = tagsByHost.get(alert.host_id) ?? [];
		if (filters.tags.length > 0 && !filters.tags.every((t) => hostTags.includes(t))) {
			continue;
		}

		const sev = alert.severity as "critical" | "warning" | "info";
		if (sev in by_severity) {
			by_severity[sev]++;
		}

		items.push({
			host_id: alert.host_id,
			hostname: alert.hostname,
			rule_id: alert.rule_id,
			severity: alert.severity,
			value: alert.value,
			message: alert.message,
			triggered_at: alert.triggered_at,
			duration_seconds: now - alert.triggered_at,
			tags: hostTags,
		});
	}

	return { alert_count: items.length, by_severity, alerts: items };
}

export async function monitoringAlertsRoute(c: Context<AppEnv>) {
	const repos = c.var.repos;
	const now = Math.floor(Date.now() / 1000);

	const alertRows = (await repos.alerts.listActiveJoinedHosts()) as MonitoringAlertRow[];

	const nowHHMM = toUtcHHMM(now);
	const nonMaintenanceAlerts = filterNonMaintenanceAlerts(alertRows, nowHHMM);

	const hostIds = [...new Set(nonMaintenanceAlerts.map((a) => a.host_id))];
	const tagsByHost = await repos.tags.listNamesForHosts(hostIds);

	const result = buildMonitoringAlertsResult(
		nonMaintenanceAlerts,
		tagsByHost,
		{
			severity: c.req.query("severity"),
			tags: c.req.queries("tag") ?? [],
		},
		now,
	);

	return c.json({ status: "ok", ...result }, 200, CACHE_HEADERS);
}
