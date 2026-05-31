// POST /api/ingest — receive and store metrics from probes
import type { MetricsPayload } from "@bat/shared";
import { isInMaintenanceWindow, toUtcHHMM } from "@bat/shared";
import type { Context } from "hono";
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

	const repos = c.var.repos;

	// Single SELECT covers retired check, maintenance window, and host existence.
	const existing = await repos.hosts.getActiveAndMaintenance(body.host_id, {
		kv: c.env.BAT_KV,
	});

	if (existing && existing.is_active === 0) {
		return c.json({ error: "host is retired" }, 403);
	}

	// Atomic batch: host upsert + metrics_raw INSERT OR IGNORE.
	// - First-seen host: INSERT … ON CONFLICT … bumps last_seen.
	// - Existing host:   plain UPDATE last_seen.
	// We rely on the metrics insert's `meta.changes` to learn whether the
	// row was newly inserted (and we should evaluate alerts) vs. a duplicate
	// retried payload.
	const { inserted } = await repos.metrics.insertRawWithHostUpsert(
		body.host_id,
		body.host_id,
		body,
		workerNow,
		existing == null ? "first-seen" : "existing",
	);

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
			await repos.alerts.clearPendingForHost(body.host_id, { kv: c.env.BAT_KV });
		} else {
			await repos.alerts.evaluateAndApply(body.host_id, body, workerNow, {
				kv: c.env.BAT_KV,
			});
		}
	}

	return c.body(null, 204);
}
