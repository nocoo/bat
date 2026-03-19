// GET /api/live — public liveness + system health check endpoint
import { BAT_VERSION, type HealthResponse, type HostStatus } from "@bat/shared";
import type { Context } from "hono";
import { deriveHostStatus } from "../services/status.js";
import type { AppEnv } from "../types.js";

interface HostRow {
	host_id: string;
	last_seen: number;
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

export async function liveRoute(c: Context<AppEnv>) {
	const db = c.env.DB;
	const now = Math.floor(Date.now() / 1000);

	// Get all active hosts
	const hostsResult = await db
		.prepare("SELECT host_id, last_seen FROM hosts WHERE is_active = 1")
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
			checked_at: now,
		};
		return c.json(response, 503);
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

	const alertsByHost = new Map<string, AlertRow[]>();
	for (const a of alertsResult.results) {
		const existing = alertsByHost.get(a.host_id) ?? [];
		existing.push(a);
		alertsByHost.set(a.host_id, existing);
	}

	// Per-host port allowlist for status derivation
	const allowlistResult = await db
		.prepare(`SELECT host_id, port FROM port_allowlist WHERE host_id IN (${placeholders})`)
		.bind(...hostIds)
		.all<AllowedPortRow>();

	const allowedByHost = new Map<string, Set<number>>();
	for (const row of allowlistResult.results) {
		let s = allowedByHost.get(row.host_id);
		if (!s) {
			s = new Set();
			allowedByHost.set(row.host_id, s);
		}
		s.add(row.port);
	}

	// Derive status for each host
	let healthy = 0;
	let warning = 0;
	let critical = 0;

	for (const host of hosts) {
		const alerts = alertsByHost.get(host.host_id) ?? [];
		const allowedPorts = allowedByHost.get(host.host_id);
		const status: HostStatus = deriveHostStatus(host.last_seen, now, alerts, allowedPorts);

		switch (status) {
			case "healthy":
				healthy++;
				break;
			case "warning":
				warning++;
				break;
			case "critical":
			case "offline":
				critical++;
				break;
		}
	}

	// Determine overall status
	let overallStatus: HealthResponse["status"];
	if (critical > 0) {
		overallStatus = "critical";
	} else if (warning > 0) {
		overallStatus = "degraded";
	} else {
		overallStatus = "healthy";
	}

	const response: HealthResponse = {
		status: overallStatus,
		version: BAT_VERSION,
		total_hosts: hosts.length,
		healthy,
		warning,
		critical,
		checked_at: now,
	};

	const httpStatus = overallStatus === "critical" ? 503 : 200;
	return c.json(response, httpStatus);
}
