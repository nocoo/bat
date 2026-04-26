// POST /api/ingest — receive and store metrics from probes
import type { MetricsPayload } from "@bat/shared";
import { isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { Context } from "hono";
import { evaluateAlerts } from "../services/alerts.js";
import { buildInsertMetricsRawStatement } from "../services/metrics.js";
import type { AppEnv } from "../types.js";

const CLOCK_SKEW_MAX_SECONDS = 300;

/** Lightweight validation — checks required fields exist and are correct types */
export function validateMetricsPayload(body: unknown): body is MetricsPayload {
	if (!body || typeof body !== "object") {
		return false;
	}
	const b = body as Record<string, unknown>;

	// Top-level scalars
	if (typeof b.host_id !== "string" || b.host_id.length === 0) {
		return false;
	}
	if (typeof b.timestamp !== "number") {
		return false;
	}
	if (typeof b.interval !== "number") {
		return false;
	}
	if (typeof b.uptime_seconds !== "number") {
		return false;
	}

	// CPU
	if (!b.cpu || typeof b.cpu !== "object") {
		return false;
	}
	const cpu = b.cpu as Record<string, unknown>;
	if (typeof cpu.load1 !== "number") {
		return false;
	}
	if (typeof cpu.load5 !== "number") {
		return false;
	}
	if (typeof cpu.load15 !== "number") {
		return false;
	}
	if (typeof cpu.usage_pct !== "number") {
		return false;
	}
	if (typeof cpu.iowait_pct !== "number") {
		return false;
	}
	if (typeof cpu.steal_pct !== "number") {
		return false;
	}
	if (typeof cpu.count !== "number") {
		return false;
	}

	// Memory
	if (!b.mem || typeof b.mem !== "object") {
		return false;
	}
	const mem = b.mem as Record<string, unknown>;
	if (typeof mem.total_bytes !== "number") {
		return false;
	}
	if (typeof mem.available_bytes !== "number") {
		return false;
	}
	if (typeof mem.used_pct !== "number") {
		return false;
	}

	// Swap
	if (!b.swap || typeof b.swap !== "object") {
		return false;
	}
	const swap = b.swap as Record<string, unknown>;
	if (typeof swap.total_bytes !== "number") {
		return false;
	}
	if (typeof swap.used_bytes !== "number") {
		return false;
	}
	if (typeof swap.used_pct !== "number") {
		return false;
	}

	// Disk and net arrays
	if (!Array.isArray(b.disk)) {
		return false;
	}
	if (!Array.isArray(b.net)) {
		return false;
	}

	// probe_version is optional for backward compatibility
	if (b.probe_version !== undefined && typeof b.probe_version !== "string") {
		return false;
	}

	return true;
}

export async function ingestRoute(c: Context<AppEnv>) {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!validateMetricsPayload(body)) {
		return c.json({ error: "Invalid metrics payload" }, 400);
	}

	// Clock skew guard
	const workerNow = Math.floor(Date.now() / 1000);
	const skew = Math.abs(body.timestamp - workerNow);
	if (skew > CLOCK_SKEW_MAX_SECONDS) {
		return c.json(
			{
				error: `Clock skew too large (${skew}s). Please sync with NTP.`,
			},
			400,
		);
	}

	const db = c.env.DB;

	// Single SELECT covers retired check, maintenance window, and host existence.
	const existing = await db
		.prepare("SELECT is_active, maintenance_start, maintenance_end FROM hosts WHERE host_id = ?")
		.bind(body.host_id)
		.first<{
			is_active: number;
			maintenance_start: string | null;
			maintenance_end: string | null;
		}>();

	if (existing && existing.is_active === 0) {
		return c.json({ error: "host is retired" }, 403);
	}

	// Build the metrics insert and host upsert/update as a single batch.
	// - First-seen host: INSERT OR IGNORE creates the row + UPDATE sets last_seen.
	// - Existing host: INSERT is a no-op, UPDATE refreshes last_seen.
	// We don't have D1 atomic-RETURNING for INSERT OR IGNORE here, so to learn
	// whether the metrics row was new (and we should evaluate alerts) we issue
	// the metrics insert in the batch and inspect changes on its result.
	const metricsStmt = buildInsertMetricsRawStatement(db, body.host_id, body);
	const hostUpsertStmt =
		existing == null
			? db
					.prepare(
						`INSERT INTO hosts (host_id, hostname, last_seen)
VALUES (?, ?, ?)
ON CONFLICT(host_id) DO UPDATE SET last_seen = excluded.last_seen`,
					)
					.bind(body.host_id, body.host_id, workerNow)
			: db
					.prepare("UPDATE hosts SET last_seen = ? WHERE host_id = ?")
					.bind(workerNow, body.host_id);

	// Order matters: host row must exist before metrics insert (FK).
	// For existing hosts the host row is already there so order is irrelevant,
	// but we keep host-first for the first-seen path.
	const batchResults = await db.batch([hostUpsertStmt, metricsStmt]);
	const inserted = (batchResults[1]?.meta?.changes ?? 0) > 0;

	// Only evaluate alerts for genuinely new data — retried payloads with
	// identical timestamps are no-ops from here.
	if (inserted) {
		// Check maintenance window — skip alert evaluation + purge alert_pending
		const nowHHMM = toUtcHHMM(workerNow);
		const inMaintenance =
			existing?.maintenance_start &&
			existing?.maintenance_end &&
			isInMaintenanceWindow(nowHHMM, existing.maintenance_start, existing.maintenance_end);

		if (inMaintenance) {
			// Purge duration rule timers to prevent stale first_seen accumulation
			await db.prepare("DELETE FROM alert_pending WHERE host_id = ?").bind(body.host_id).run();
		} else {
			await evaluateAlerts(db, body.host_id, body, workerNow);
		}
	}

	return c.body(null, 204);
}
