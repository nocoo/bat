// D1-backed AlertsRepository. Wraps:
//   - the listActiveJoinedHosts SELECT lifted from `routes/alerts.ts`
//   - the per-ingest reconciliation in `_alerts-tier1.ts`/`_alerts-tier2.ts`
//     (those modules retain the SQL planning + write batches for the tier-1
//     and tier-2 paths; the pure rule evaluators are re-exported by
//     `domain/alerts/{evaluate,tier2}.ts`).
// Maintenance-window filtering for /api/alerts stays in the route — it is
// pure wall-clock comparison and doesn't belong in the persistence layer.

import type { MetricsPayload, Tier2Payload } from "@bat/shared";
import type { AlertActiveJoinedRow, AlertsRepository } from "../../repos/types.js";
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

	evaluateAndApply(hostId: string, payload: MetricsPayload, now: number): Promise<void> {
		return evaluateAlerts(this.db, hostId, payload, now);
	}

	evaluateAndApplyTier2(hostId: string, payload: Tier2Payload, now: number): Promise<void> {
		return evaluateTier2Alerts(this.db, hostId, payload, now);
	}

	async clearPendingForHost(hostId: string): Promise<void> {
		await this.db.prepare("DELETE FROM alert_pending WHERE host_id = ?").bind(hostId).run();
	}
}
