// D1-backed AlertsRepository. Wraps:
//   - the listActiveJoinedHosts SELECT lifted from `routes/alerts.ts`
//   - the per-ingest reconciliation in `_alerts-tier1.ts`/`_alerts-tier2.ts`
//     (those modules retain the SQL planning + write batches for the tier-1
//     and tier-2 paths; the pure rule evaluators are re-exported by
//     `domain/alerts/{evaluate,tier2}.ts`).
// Maintenance-window filtering for /api/alerts stays in the route — it is
// pure wall-clock comparison and doesn't belong in the persistence layer.

import type { MetricsPayload, Tier2Payload } from "@bat/shared";
import { invalidateHealthy } from "../../lib/alerts-healthy-cache.js";
import type { AlertActiveJoinedRow, AlertReadRow, AlertsRepository } from "../../repos/types.js";
import { evaluateAlerts } from "./_alerts-tier1.js";
import { evaluateTier2Alerts } from "./_alerts-tier2.js";

export class D1AlertsRepository implements AlertsRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async listActiveJoinedHosts(): Promise<AlertActiveJoinedRow[]> {
		const result = await this.db
			.prepare(
				`SELECT a.host_id, a.rule_id, a.severity, a.value, a.triggered_at, a.message,
       h.hostname, h.maintenance_start, h.maintenance_end
FROM alert_states a
JOIN hosts h ON a.host_id = h.host_id
WHERE h.is_active = 1
ORDER BY a.triggered_at DESC`,
			)
			.all<AlertActiveJoinedRow>();
		return result.results;
	}

	evaluateAndApply(
		hostId: string,
		payload: MetricsPayload,
		now: number,
		opts?: { kv?: KVNamespace | undefined },
	): Promise<void> {
		return evaluateAlerts(this.db, hostId, payload, now, opts?.kv);
	}

	evaluateAndApplyTier2(hostId: string, payload: Tier2Payload, now: number): Promise<void> {
		return evaluateTier2Alerts(this.db, hostId, payload, now);
	}

	async clearPendingForHost(
		hostId: string,
		opts?: { kv?: KVNamespace | undefined },
	): Promise<void> {
		// Drop the healthy-sentinel BEFORE the DELETE so a concurrent ingest
		// cannot read a stale "empty" sentinel and skip the post-DELETE state.
		await invalidateHealthy(opts?.kv, hostId);
		await this.db.prepare("DELETE FROM alert_pending WHERE host_id = ?").bind(hostId).run();
	}

	async listForHosts(hostIds: string[]): Promise<AlertReadRow[]> {
		if (hostIds.length === 0) {
			return [];
		}
		const placeholders = hostIds.map(() => "?").join(", ");
		const result = await this.db
			.prepare(
				`SELECT host_id, severity, rule_id, message, value, triggered_at FROM alert_states WHERE host_id IN (${placeholders})`,
			)
			.bind(...hostIds)
			.all<AlertReadRow>();
		return result.results;
	}

	async countByHost(hostIds: string[]): Promise<Map<string, number>> {
		if (hostIds.length === 0) {
			return new Map();
		}
		const placeholders = hostIds.map(() => "?").join(", ");
		const result = await this.db
			.prepare(
				`SELECT host_id, COUNT(*) as alert_count FROM alert_states WHERE host_id IN (${placeholders}) GROUP BY host_id`,
			)
			.bind(...hostIds)
			.all<{ host_id: string; alert_count: number }>();
		const map = new Map<string, number>();
		for (const row of result.results) {
			map.set(row.host_id, row.alert_count);
		}
		return map;
	}
}
