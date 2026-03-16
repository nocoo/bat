// Alert evaluation service — evaluates 6 Tier-1 rules on each ingest
// Source of truth: docs/03-data-structures.md § Alert Rules
// Source of truth: docs/05-worker.md § Alert Evaluation

import { ALERT_THRESHOLDS, TIER2_THRESHOLDS } from "@bat/shared";
import type { MetricsPayload } from "@bat/shared";

type AlertSeverity = "info" | "warning" | "critical";

interface AlertEvalResult {
	ruleId: string;
	fired: boolean;
	severity: AlertSeverity;
	value: number;
	message: string;
	durationSeconds: number; // 0 = instant
}

/**
 * Evaluate all ingest-time alert rules against a metrics payload.
 * Returns evaluation results for each rule (fired or not).
 * host_offline is NOT evaluated here — it's query-time only.
 */
function evaluateRules(payload: MetricsPayload): AlertEvalResult[] {
	const results: AlertEvalResult[] = [];

	// mem_high: mem > 85% AND swap > 50% → critical, instant
	results.push({
		ruleId: "mem_high",
		fired:
			payload.mem.used_pct > ALERT_THRESHOLDS.MEM_HIGH_PCT &&
			payload.swap.used_pct > ALERT_THRESHOLDS.MEM_HIGH_SWAP_PCT,
		severity: "critical",
		value: payload.mem.used_pct,
		message: `Memory ${payload.mem.used_pct.toFixed(1)}% + Swap ${payload.swap.used_pct.toFixed(1)}%`,
		durationSeconds: 0,
	});

	// no_swap: swap == 0 AND mem > 70% → critical, instant
	results.push({
		ruleId: "no_swap",
		fired:
			payload.swap.total_bytes === 0 && payload.mem.used_pct > ALERT_THRESHOLDS.NO_SWAP_MEM_PCT,
		severity: "critical",
		value: payload.mem.used_pct,
		message: `No swap configured, memory at ${payload.mem.used_pct.toFixed(1)}%`,
		durationSeconds: 0,
	});

	// disk_full: any mount > 85% → critical, instant
	for (const disk of payload.disk) {
		if (disk.used_pct > ALERT_THRESHOLDS.DISK_FULL_PCT) {
			results.push({
				ruleId: "disk_full",
				fired: true,
				severity: "critical",
				value: disk.used_pct,
				message: `Disk ${disk.mount} at ${disk.used_pct.toFixed(1)}%`,
				durationSeconds: 0,
			});
			break; // Only one disk_full alert per host
		}
	}
	// If no disk exceeded threshold, push a "not fired" result
	if (!results.some((r) => r.ruleId === "disk_full")) {
		results.push({
			ruleId: "disk_full",
			fired: false,
			severity: "critical",
			value: Math.max(0, ...payload.disk.map((d) => d.used_pct)),
			message: "",
			durationSeconds: 0,
		});
	}

	// iowait_high: iowait > 20% → warning, 5 min duration
	results.push({
		ruleId: "iowait_high",
		fired: payload.cpu.iowait_pct > ALERT_THRESHOLDS.IOWAIT_HIGH_PCT,
		severity: "warning",
		value: payload.cpu.iowait_pct,
		message: `IO wait at ${payload.cpu.iowait_pct.toFixed(1)}%`,
		durationSeconds: ALERT_THRESHOLDS.IOWAIT_DURATION_SECONDS,
	});

	// steal_high: steal > 10% → warning, 5 min duration
	results.push({
		ruleId: "steal_high",
		fired: payload.cpu.steal_pct > ALERT_THRESHOLDS.STEAL_HIGH_PCT,
		severity: "warning",
		value: payload.cpu.steal_pct,
		message: `CPU steal at ${payload.cpu.steal_pct.toFixed(1)}%`,
		durationSeconds: ALERT_THRESHOLDS.STEAL_DURATION_SECONDS,
	});

	// uptime_anomaly: uptime < 300s → info, instant (detects unexpected reboots)
	results.push({
		ruleId: "uptime_anomaly",
		fired: payload.uptime_seconds < TIER2_THRESHOLDS.UPTIME_ANOMALY_SECONDS,
		severity: "info",
		value: payload.uptime_seconds,
		message:
			payload.uptime_seconds < TIER2_THRESHOLDS.UPTIME_ANOMALY_SECONDS
				? `Host recently rebooted (uptime ${payload.uptime_seconds}s)`
				: "",
		durationSeconds: 0,
	});

	return results;
}

/**
 * Evaluate alerts and update alert_states / alert_pending tables.
 * Called from ingest route after metrics insertion.
 */
export async function evaluateAlerts(
	db: D1Database,
	hostId: string,
	payload: MetricsPayload,
	now: number,
): Promise<void> {
	const results = evaluateRules(payload);

	for (const result of results) {
		if (result.durationSeconds === 0) {
			// Instant rule
			await handleInstantRule(db, hostId, result, now);
		} else {
			// Duration rule
			await handleDurationRule(db, hostId, result, now);
		}
	}
}

async function handleInstantRule(
	db: D1Database,
	hostId: string,
	result: AlertEvalResult,
	now: number,
): Promise<void> {
	if (result.fired) {
		// UPSERT alert_states
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
		// Clear alert_states
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
		// Check alert_pending for existing entry
		const pending = await db
			.prepare("SELECT first_seen FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, result.ruleId)
			.first<{ first_seen: number }>();

		if (pending) {
			// Already tracking — check if duration exceeded
			const elapsed = now - pending.first_seen;
			if (elapsed >= result.durationSeconds) {
				// Promote to alert_states
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
			// Update last_value in pending
			await db
				.prepare("UPDATE alert_pending SET last_value = ? WHERE host_id = ? AND rule_id = ?")
				.bind(result.value, hostId, result.ruleId)
				.run();
		} else {
			// First time exceeding threshold — start tracking
			await db
				.prepare(
					`INSERT INTO alert_pending (host_id, rule_id, first_seen, last_value)
VALUES (?, ?, ?, ?)`,
				)
				.bind(hostId, result.ruleId, now, result.value)
				.run();
		}
	} else {
		// Condition cleared — remove from both tables
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

// Export for testing
export { evaluateRules };
export type { AlertEvalResult };
