// GET /api/fleet/status — fleet health overview (requires BAT_READ_KEY)
import { BAT_VERSION, type HealthResponse, type HostStatus } from "@bat/shared";
import type { Context } from "hono";
import { summarizeHostStatuses } from "../lib/fleet-summary.js";
import { freshestLastSeen, loadObservedSeenBatch } from "../lib/host-lastseen-cache.js";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";
import { buildAlertsByHost, getMaintenanceWindow } from "./monitoring.js";

export async function fleetStatusRoute(c: Context<AppEnv>) {
	const repos = c.var.repos;
	const now = Math.floor(Date.now() / 1000);

	const hosts = await repos.hosts.listStatusRows();

	if (hosts.length === 0) {
		const response: HealthResponse = {
			status: "empty",
			version: BAT_VERSION,
			total_hosts: 0,
			healthy: 0,
			warning: 0,
			critical: 0,
			maintenance: 0,
			checked_at: now,
		};
		return c.json(response, 200);
	}

	const hostIds = hosts.map((h) => h.host_id);
	const [alertRows, allowedByHost, observedMap] = await Promise.all([
		repos.alerts.listForHosts(hostIds),
		repos.ports.listForHosts(hostIds),
		loadObservedSeenBatch(c.env.BAT_KV, hostIds),
	]);

	const alertsByHost = buildAlertsByHost(alertRows);

	// Derive status for each host, then summarise into fleet-level counts
	const statuses: HostStatus[] = hosts.map((host) => {
		const alerts = alertsByHost.get(host.host_id) ?? [];
		const allowedPorts = allowedByHost.get(host.host_id);
		const mw = getMaintenanceWindow(host);
		const lastSeen = freshestLastSeen(host.last_seen, observedMap.get(host.host_id));
		return deriveHostStatus(lastSeen, now, alerts, allowedPorts, mw);
	});
	const { healthy, warning, critical, maintenance, overall } = summarizeHostStatuses(statuses);

	const response: HealthResponse = {
		status: overall,
		version: BAT_VERSION,
		total_hosts: hosts.length,
		healthy,
		warning,
		critical,
		maintenance,
		checked_at: now,
	};

	return c.json(response, 200);
}
