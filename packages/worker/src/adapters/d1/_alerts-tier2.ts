// D1 persistence for tier-2 alerts. Pure rule evaluator lives in
// `domain/alerts/tier2.ts`; this module owns reading current state,
// planning the diff, and writing the reconciliation batch. Two
// legacy single-rule helpers (`handleInstantRule`, `handleDurationRule`)
// are retained for the test suite that pins per-rule state-machine
// semantics.

import type { Tier2Payload } from "@bat/shared";
import { evaluateTier2Rules } from "../../domain/alerts/tier2.js";
import type { AlertEvalResult } from "../../domain/alerts/types.js";

export { evaluateTier2Rules };
export type { AlertEvalResult };

interface AlertStateRow {
	rule_id: string;
	severity: AlertEvalResult["severity"];
	value: number;
	message: string;
	triggered_at: number;
}

interface AlertPendingRow {
	rule_id: string;
	first_seen: number;
}

function planTier2Writes(
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
			if (result.fired) {
				const stateChanged =
					!state ||
					state.severity !== result.severity ||
					state.value !== result.value ||
					state.message !== result.message;
				if (stateChanged) {
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

		if (result.fired) {
			if (pending) {
				const elapsed = now - pending.first_seen;
				if (elapsed >= result.durationSeconds) {
					const stateChanged =
						!state ||
						state.severity !== result.severity ||
						state.value !== result.value ||
						state.message !== result.message;
					if (stateChanged) {
						writes.push(upsertState(result, state ? state.triggered_at : now));
					}
				}
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
 * Evaluate Tier 2 alerts and update alert_states / alert_pending tables.
 * Called from tier2-ingest route after snapshot insertion.
 */
export async function evaluateTier2Alerts(
	db: D1Database,
	hostId: string,
	payload: Tier2Payload,
	now: number,
): Promise<void> {
	const [allowlistRows, statesRes, pendingRes] = await Promise.all([
		db
			.prepare("SELECT port FROM port_allowlist WHERE host_id = ?")
			.bind(hostId)
			.all<{ port: number }>(),
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

	const perHostAllowed = allowlistRows.results.map((r) => r.port);
	const results = evaluateTier2Rules(payload, perHostAllowed);
	const currentStates = new Map(statesRes.results.map((r) => [r.rule_id, r]));
	const currentPending = new Map(pendingRes.results.map((r) => [r.rule_id, r]));

	const writes = planTier2Writes(hostId, results, currentStates, currentPending, now, db);
	if (writes.length === 0) {
		return;
	}
	await db.batch(writes);
}

// --- Legacy single-rule helpers, retained for unit tests ---
// Production path uses planTier2Writes + db.batch via evaluateTier2Alerts.
// These keep the per-rule state-machine semantics (incl. last_value bookkeeping)
// for tests that pin behavior of a synthetic duration rule.

async function handleInstantRule(
	db: D1Database,
	hostId: string,
	result: AlertEvalResult,
	now: number,
): Promise<void> {
	if (result.fired) {
		await db
			.prepare(
				`INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id, rule_id) DO UPDATE SET
  severity = excluded.severity,
  value = excluded.value,
  triggered_at = excluded.triggered_at,
  message = excluded.message`,
			)
			.bind(hostId, result.ruleId, result.severity, result.value, now, result.message)
			.run();
	} else {
		await db
			.prepare("DELETE FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, result.ruleId)
			.run();
	}
}

async function handleDurationRule(
	db: D1Database,
	hostId: string,
	result: AlertEvalResult,
	now: number,
): Promise<void> {
	if (result.fired) {
		const pending = await db
			.prepare("SELECT first_seen FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, result.ruleId)
			.first<{ first_seen: number }>();

		if (pending) {
			const elapsed = now - pending.first_seen;
			if (elapsed >= result.durationSeconds) {
				await db
					.prepare(
						`INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id, rule_id) DO UPDATE SET
  severity = excluded.severity,
  value = excluded.value,
  triggered_at = excluded.triggered_at,
  message = excluded.message`,
					)
					.bind(hostId, result.ruleId, result.severity, result.value, now, result.message)
					.run();
			}
			await db
				.prepare("UPDATE alert_pending SET last_value = ? WHERE host_id = ? AND rule_id = ?")
				.bind(result.value, hostId, result.ruleId)
				.run();
		} else {
			await db
				.prepare(
					`INSERT INTO alert_pending (host_id, rule_id, first_seen, last_value)
VALUES (?, ?, ?, ?)`,
				)
				.bind(hostId, result.ruleId, now, result.value)
				.run();
		}
	} else {
		await db
			.prepare("DELETE FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, result.ruleId)
			.run();
		await db
			.prepare("DELETE FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, result.ruleId)
			.run();
	}
}

// Legacy single-rule helpers retained for unit tests.
export { handleInstantRule, handleDurationRule };
