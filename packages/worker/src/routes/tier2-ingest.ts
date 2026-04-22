// POST /api/tier2 — receive and store Tier 2 data from probes
import type { Tier2Payload } from "@bat/shared";
import type { Context } from "hono";
import { ensureHostExists, updateHostLastSeen } from "../services/metrics.js";
import { evaluateTier2Alerts } from "../services/tier2-alerts.js";
import { insertTier2Snapshot } from "../services/tier2-metrics.js";
import type { AppEnv } from "../types.js";

const CLOCK_SKEW_MAX_SECONDS = 300;

/** Validate the Tier 2 payload — only host_id and timestamp are required,
 *  all section fields are optional. */
export function validateTier2Payload(body: unknown): body is Tier2Payload {
	if (!body || typeof body !== "object") {
		return false;
	}
	const b = body as Record<string, unknown>;

	if (typeof b.host_id !== "string" || b.host_id.length === 0) {
		return false;
	}
	if (typeof b.timestamp !== "number") {
		return false;
	}

	// probe_version is optional
	if (b.probe_version !== undefined && typeof b.probe_version !== "string") {
		return false;
	}

	// All section fields are optional — no further validation needed
	return true;
}

export async function tier2IngestRoute(c: Context<AppEnv>) {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!validateTier2Payload(body)) {
		return c.json({ error: "Invalid tier2 payload" }, 400);
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

	// Check if host is retired
	const existing = await db
		.prepare("SELECT is_active FROM hosts WHERE host_id = ?")
		.bind(body.host_id)
		.first<{ is_active: number }>();

	if (existing && existing.is_active === 0) {
		return c.json({ error: "host is retired" }, 403);
	}

	// Ensure host record exists (FK target)
	await ensureHostExists(db, body.host_id, body.host_id, workerNow);

	// Insert tier2 snapshot — returns false if duplicate (same host_id + ts)
	const inserted = await insertTier2Snapshot(db, body.host_id, body);

	// Only update last_seen and evaluate alerts for genuinely new data
	if (inserted) {
		await updateHostLastSeen(db, body.host_id, workerNow);
		await evaluateTier2Alerts(db, body.host_id, body, workerNow);

		// Merge slow-drift inventory fields into hosts table (2-state wire semantics)
		const raw = body as unknown as Record<string, unknown>;
		const clauses: string[] = [];
		const values: unknown[] = [];

		if ("timezone" in raw) {
			clauses.push("timezone = ?");
			values.push(raw.timezone);
		}
		if ("dns_resolvers" in raw) {
			clauses.push("dns_resolvers = ?");
			values.push(JSON.stringify(raw.dns_resolvers));
		}
		if ("dns_search" in raw) {
			clauses.push("dns_search = ?");
			values.push(JSON.stringify(raw.dns_search));
		}

		if (clauses.length > 0) {
			await db
				.prepare(`UPDATE hosts SET ${clauses.join(", ")} WHERE host_id = ?`)
				.bind(...values, body.host_id)
				.run();
		}
	}

	return c.body(null, 204);
}
