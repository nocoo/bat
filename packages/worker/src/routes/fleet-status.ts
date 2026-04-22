// GET /api/fleet/status — fleet health overview (requires BAT_READ_KEY)
import { BAT_VERSION, type HealthResponse, type HostStatus } from "@bat/shared";
import type { Context } from "hono";
import { summarizeHostStatuses } from "../lib/fleet-summary.js";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";
import { buildAlertsByHost, buildAllowedByHost, getMaintenanceWindow } from "./monitoring.js";

interface HostRow {
	host_id: string;
	last_seen: number;
	maintenance_start: string | null;
	maintenance_end: string | null;
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

export async function fleetStatusRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const now = Math.floor(Date.now() / 1000);

	// Get all active hosts
	const hostsResult = await db
		.prepare(
			"SELECT host_id, last_seen, maintenance_start, maintenance_end FROM hosts WHERE is_active = 1",
		)
		.all<HostRow>();
	const hosts = hostsResult.results;

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
	const placeholders = hostIds.map(() => "?").join(", ");

	// Get all alerts for active hosts
	const alertsResult = await db
		.prepare(
			`SELECT host_id, severity, rule_id, message FROM alert_states WHERE host_id IN (${placeholders})`,
		)
		.bind(...hostIds)
		.all<AlertRow>();

	const alertsByHost = buildAlertsByHost(alertsResult.results);

	// Per-host port allowlist for status derivation
	const allowlistResult = await db
		.prepare(`SELECT host_id, port FROM port_allowlist WHERE host_id IN (${placeholders})`)
		.bind(...hostIds)
		.all<AllowedPortRow>();

	const allowedByHost = buildAllowedByHost(allowlistResult.results);

	// Derive status for each host, then summarise into fleet-level counts
	const statuses: HostStatus[] = hosts.map((host) => {
		const alerts = alertsByHost.get(host.host_id) ?? [];
		const allowedPorts = allowedByHost.get(host.host_id);
		const mw = getMaintenanceWindow(host);
		return deriveHostStatus(host.last_seen, now, alerts, allowedPorts, mw);
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
