// D1 persistence for tier-1 / tier-3 / signal-expansion alerts.
// Pure rule evaluator lives in `domain/alerts/evaluate.ts`; this module
// owns reading current alert state, planning the diff, and writing the
// reconciliation batch. Re-exports `evaluateRules` so the existing
// services-era unit tests can keep importing from one place.

import type { MetricsPayload } from "@bat/shared";
import { evaluateRules } from "../../domain/alerts/evaluate.js";
import type { AlertEvalResult, AlertSeverity } from "../../domain/alerts/types.js";

export { evaluateRules };
export type { AlertEvalResult };

interface AlertStateRow {
	rule_id: string;
	severity: AlertSeverity;
	value: number;
	message: string;
	triggered_at: number;
}

interface AlertPendingRow {
	rule_id: string;
	first_seen: number;
}

/**
 * Build the batch of write statements needed to reconcile current alert tables
 * with evaluation results. Returns empty array when nothing changed (the common
 * case for healthy hosts) so callers can skip the round-trip entirely.
 *
 * Behavior notes:
 * - alert_states.triggered_at is preserved across re-evaluations of the same
 *   rule (it now reflects FIRST trigger time, not last evaluation time).
 *   Severity/value/message are still refreshed on change.
 * - alert_pending.last_value is no longer updated on every tick — the column is
 *   never read anywhere. The schema column is left in place; new rows still
 *   carry the value at first detection.
 */
function planAlertWrites(
	hostId: string,
	results: AlertEvalResult[],
	currentStates: Map<string, AlertStateRow>,
	currentPending: Map<string, AlertPendingRow>,
	now: number,
	db: D1Database,
): D1PreparedStatement[] {
	const writes: D1PreparedStatement[] = [];

	const upsertState = (r: AlertEvalResult, triggeredAt: number) =>
		db
			.prepare(
				`INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id, rule_id) DO UPDATE SET
  severity = excluded.severity,
  value = excluded.value,
  message = excluded.message`,
			)
			.bind(hostId, r.ruleId, r.severity, r.value, triggeredAt, r.message);

	for (const result of results) {
		const state = currentStates.get(result.ruleId);
		const pending = currentPending.get(result.ruleId);

		if (result.durationSeconds === 0) {
			// Instant rule
			if (result.fired) {
				const stateChanged =
					!state ||
					state.severity !== result.severity ||
					state.value !== result.value ||
					state.message !== result.message;
				if (stateChanged) {
					// Preserve triggered_at on refresh; use `now` only on first trigger
					writes.push(upsertState(result, state ? state.triggered_at : now));
				}
			} else if (state) {
				writes.push(
					db
						.prepare("DELETE FROM alert_states WHERE host_id = ? AND rule_id = ?")
						.bind(hostId, result.ruleId),
				);
			}
			continue;
		}

		// Duration rule
		if (result.fired) {
			if (pending) {
				const elapsed = now - pending.first_seen;
				if (elapsed >= result.durationSeconds) {
					// Promote (or refresh) alert_states
					const stateChanged =
						!state ||
						state.severity !== result.severity ||
						state.value !== result.value ||
						state.message !== result.message;
					if (stateChanged) {
						// First promotion uses `now`; subsequent refreshes preserve original triggered_at
						writes.push(upsertState(result, state ? state.triggered_at : now));
					}
				}
				// pending row already exists — no need to bump last_value (never read)
			} else {
				writes.push(
					db
						.prepare(
							`INSERT INTO alert_pending (host_id, rule_id, first_seen, last_value)
VALUES (?, ?, ?, ?)`,
						)
						.bind(hostId, result.ruleId, now, result.value),
				);
			}
		} else {
			// Condition cleared — remove whatever exists
			if (pending) {
				writes.push(
					db
						.prepare("DELETE FROM alert_pending WHERE host_id = ? AND rule_id = ?")
						.bind(hostId, result.ruleId),
				);
			}
			if (state) {
				writes.push(
					db
						.prepare("DELETE FROM alert_states WHERE host_id = ? AND rule_id = ?")
						.bind(hostId, result.ruleId),
				);
			}
		}
	}

	return writes;
}

/**
 * Evaluate alerts and update alert_states / alert_pending tables.
 * Called from ingest route after metrics insertion.
 *
 * Reads current alert state once, computes a diff against the new evaluation
 * results, and writes only the rules whose state actually changed. Healthy
 * hosts produce zero writes (down from ~23 per ingest before).
 */
export async function evaluateAlerts(
	db: D1Database,
	hostId: string,
	payload: MetricsPayload,
	now: number,
): Promise<void> {
	const results = evaluateRules(payload);

	const [statesRes, pendingRes] = await Promise.all([
		db
			.prepare(
				"SELECT rule_id, severity, value, message, triggered_at FROM alert_states WHERE host_id = ?",
			)
			.bind(hostId)
			.all<AlertStateRow>(),
		db
			.prepare("SELECT rule_id, first_seen FROM alert_pending WHERE host_id = ?")
			.bind(hostId)
			.all<AlertPendingRow>(),
	]);

	const currentStates = new Map(statesRes.results.map((r) => [r.rule_id, r]));
	const currentPending = new Map(pendingRes.results.map((r) => [r.rule_id, r]));

	const writes = planAlertWrites(hostId, results, currentStates, currentPending, now, db);
	if (writes.length === 0) {
		return;
	}
	await db.batch(writes);
}
