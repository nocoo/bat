// D1 persistence for tier-1 / tier-3 / signal-expansion alerts.
// Pure rule evaluator lives in `domain/alerts/evaluate.ts`; this module
// owns reading current alert state, planning the diff, and writing the
// reconciliation batch. Re-exports `evaluateRules` so the existing
// services-era unit tests can keep importing from one place.

import type { MetricsPayload } from "@bat/shared";
import { evaluateRules } from "../../domain/alerts/evaluate.js";
import type { AlertEvalResult, AlertSeverity } from "../../domain/alerts/types.js";
import { invalidateHealthy, isMarkedHealthy, markHealthy } from "../../lib/alerts-healthy-cache.js";

export type { AlertEvalResult };
export { evaluateRules };

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
 *
 * `kv` (optional) enables the healthy sentinel fast-path: when the rule
 * evaluator says the new payload is healthy AND a recent observation marked
 * the host as having no active/pending alert rows, skip both D1 reads. The
 * sentinel is invalidated on any state-mutating path so a recovery never
 * gets delayed beyond the immediate ingest that detects it.
 */
export async function evaluateAlerts(
	db: D1Database,
	hostId: string,
	payload: MetricsPayload,
	now: number,
	kv?: KVNamespace,
): Promise<void> {
	const results = evaluateRules(payload);
	// `results` carries one entry per rule with a `fired` flag — it is NOT a
	// list of firing rules. The payload is healthy iff every rule's `fired`
	// is false (no instant rule triggered AND no duration rule's condition is
	// currently true).
	const payloadIsHealthy = results.every((r) => !r.fired);

	// Fast-path: rule evaluator says healthy AND we have a fresh "empty" KV
	// sentinel → safe to skip the alert_states + alert_pending SELECT pair.
	// We do NOT skip when the payload is unhealthy: an alert might need to
	// fire on this very ingest, and the sentinel only attests to past state.
	if (payloadIsHealthy && (await isMarkedHealthy(kv, hostId))) {
		return;
	}

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
		// Truly empty state observed AND no writes needed. Mark the host as
		// healthy so future healthy ingests can skip the SELECT pair. We only
		// write the sentinel when both D1 reads came back empty AND the
		// payload itself was healthy — partial-empty (e.g. pending exists but
		// duration not met) does NOT qualify.
		if (payloadIsHealthy && currentStates.size === 0 && currentPending.size === 0) {
			await markHealthy(kv, hostId);
		}
		return;
	}

	// State is changing. Invalidate the sentinel BEFORE the batch so a
	// concurrent healthy ingest that races us cannot resurrect a stale
	// sentinel after our write commits.
	await invalidateHealthy(kv, hostId);
	await db.batch(writes);
}
