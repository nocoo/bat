// POST /api/tier2 — receive and store Tier 2 data from probes
import type { Tier2Payload } from "@bat/shared";
import type { Context } from "hono";
import { buildEnsureHostStmt, buildUpdateLastSeenStmt } from "../services/metrics.js";
import { evaluateTier2Alerts } from "../services/tier2-alerts.js";
import { buildInsertTier2Stmt } from "../services/tier2-metrics.js";
import type { AppEnv } from "../types.js";

const CLOCK_SKEW_MAX_SECONDS = 300;

/** Validate the Tier 2 payload — only host_id and timestamp are required,
 *  all section fields are optional. */
function validateTier2Payload(body: unknown): body is Tier2Payload {
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

	// Batch 1: ensureHostExists + insertTier2Snapshot in single roundtrip
	const batchResults = await db.batch([
		buildEnsureHostStmt(db, body.host_id, body.host_id, workerNow),
		buildInsertTier2Stmt(db, body.host_id, body),
	]);
	const snapshotResult = batchResults[1];

	// Check if snapshot was actually inserted (not a duplicate)
	const inserted = (snapshotResult?.meta?.changes ?? 0) > 0;

	// Only update last_seen and evaluate alerts for genuinely new data
	if (inserted) {
		// Merge slow-drift inventory fields into hosts table (2-state wire semantics)
		const raw = body as unknown as Record<string, unknown>;
		const inventoryWrites: D1PreparedStatement[] = [];

		// Always update last_seen
		inventoryWrites.push(buildUpdateLastSeenStmt(db, body.host_id, workerNow));

		// Build dynamic UPDATE for inventory fields if present
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
			inventoryWrites.push(
				db
					.prepare(`UPDATE hosts SET ${clauses.join(", ")} WHERE host_id = ?`)
					.bind(...values, body.host_id),
			);
		}

		// Batch 2: updateLastSeen + inventory updates
		await db.batch(inventoryWrites);

		// Batch 3: evaluate alerts (uses its own batching internally)
		await evaluateTier2Alerts(db, body.host_id, body, workerNow);
	}

	return c.body(null, 204);
}
