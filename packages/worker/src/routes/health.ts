// GET /api/health — public health check endpoint
import type { HealthResponse, HostStatus } from "@bat/shared";
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
}

export async function healthRoute(c: Context<AppEnv>) {
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
			`SELECT host_id, severity FROM alert_states WHERE host_id IN (${placeholders})`,
		)
		.bind(...hostIds)
		.all<AlertRow>();

	const alertsByHost = new Map<string, AlertRow[]>();
	for (const a of alertsResult.results) {
		const existing = alertsByHost.get(a.host_id) ?? [];
		existing.push(a);
		alertsByHost.set(a.host_id, existing);
	}

	// Derive status for each host
	let healthy = 0;
	let warning = 0;
	let critical = 0;

	for (const host of hosts) {
		const alerts = alertsByHost.get(host.host_id) ?? [];
		const status: HostStatus = deriveHostStatus(host.last_seen, now, alerts);

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
		total_hosts: hosts.length,
		healthy,
		warning,
		critical,
		checked_at: now,
	};

	const httpStatus = overallStatus === "critical" ? 503 : 200;
	return c.json(response, httpStatus);
}
