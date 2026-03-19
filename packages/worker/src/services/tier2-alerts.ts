// Tier 2 alert evaluation service — evaluates 9 Tier-2 rules on /api/tier2 ingest
// Source of truth: docs/01-metrics-catalogue.md § Alert Rules #7–15

import { DEFAULT_PUBLIC_PORT_ALLOWLIST, TIER2_THRESHOLDS, type Tier2Payload } from "@bat/shared";

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
 * Evaluate all Tier-2 alert rules against a Tier 2 payload.
 * @param perHostAllowed Extra port numbers to allowlist for this host (from port_allowlist table)
 * Returns evaluation results for each applicable rule.
 */
function evaluateTier2Rules(
	payload: Tier2Payload,
	perHostAllowed: number[] = [],
): AlertEvalResult[] {
	const results: AlertEvalResult[] = [];

	// #8 ssh_password_auth: ssh_password_auth == true → critical, instant
	if (payload.security) {
		const auth = payload.security.ssh_password_auth;
		results.push({
			ruleId: "ssh_password_auth",
			fired: auth === true,
			severity: "critical",
			value: auth === true ? 1 : 0,
			message: auth === true ? "SSH password authentication is enabled" : "",
			durationSeconds: 0,
		});
	}

	// #9 ssh_root_login: ssh_root_login == "yes" → critical, instant
	if (payload.security) {
		const root = payload.security.ssh_root_login;
		results.push({
			ruleId: "ssh_root_login",
			fired: root === "yes",
			severity: "critical",
			value: root === "yes" ? 1 : 0,
			message: root === "yes" ? "SSH root login is enabled" : "",
			durationSeconds: 0,
		});
	}

	// #10 no_firewall: firewall_active == false → critical, instant
	if (payload.security) {
		const fw = payload.security.firewall_active;
		results.push({
			ruleId: "no_firewall",
			fired: fw === false,
			severity: "critical",
			value: fw === false ? 1 : 0,
			message: fw === false ? "No firewall active" : "",
			durationSeconds: 0,
		});
	}

	// #11 public_port: port on 0.0.0.0/:: not in allowlist → warning, instant
	if (payload.ports) {
		const allowed = new Set([...DEFAULT_PUBLIC_PORT_ALLOWLIST, ...perHostAllowed]);
		const publicPorts = payload.ports.listening.filter((p) => {
			const isPublic = p.bind === "0.0.0.0" || p.bind === "::";
			return isPublic && !allowed.has(p.port);
		});
		const fired = publicPorts.length > 0;
		results.push({
			ruleId: "public_port",
			fired,
			severity: "warning",
			value: publicPorts.length,
			message: fired ? `Unexpected public ports: ${publicPorts.map((p) => p.port).join(", ")}` : "",
			durationSeconds: 0,
		});
	}

	// #12 security_updates: security_count > 0 sustained for 7 days → warning, duration
	if (payload.updates) {
		results.push({
			ruleId: "security_updates",
			fired: payload.updates.security_count > 0,
			severity: "warning",
			value: payload.updates.security_count,
			message:
				payload.updates.security_count > 0
					? `${payload.updates.security_count} security update(s) pending`
					: "",
			durationSeconds: TIER2_THRESHOLDS.SECURITY_UPDATES_DURATION,
		});
	}

	// #13 container_restart: restart_count > 5 → critical, instant
	if (payload.docker) {
		const troubled = payload.docker.containers.filter(
			(c) => c.restart_count > TIER2_THRESHOLDS.CONTAINER_RESTART_COUNT,
		);
		const fired = troubled.length > 0;
		results.push({
			ruleId: "container_restart",
			fired,
			severity: "critical",
			value: fired ? Math.max(...troubled.map((c) => c.restart_count)) : 0,
			message: fired
				? `Container(s) restarting: ${troubled.map((c) => `${c.name} (${c.restart_count}x)`).join(", ")}`
				: "",
			durationSeconds: 0,
		});
	}

	// #14 systemd_failed: failed_count > 0 → warning, instant
	if (payload.systemd) {
		results.push({
			ruleId: "systemd_failed",
			fired: payload.systemd.failed_count > 0,
			severity: "warning",
			value: payload.systemd.failed_count,
			message:
				payload.systemd.failed_count > 0
					? `${payload.systemd.failed_count} systemd unit(s) failed: ${payload.systemd.failed.map((f) => f.unit).join(", ")}`
					: "",
			durationSeconds: 0,
		});
	}

	// #15 reboot_required: reboot_required sustained for 7 days → info, duration
	if (payload.updates) {
		results.push({
			ruleId: "reboot_required",
			fired: payload.updates.reboot_required === true,
			severity: "info",
			value: payload.updates.reboot_required ? 1 : 0,
			message: payload.updates.reboot_required ? "System reboot required" : "",
			durationSeconds: TIER2_THRESHOLDS.REBOOT_REQUIRED_DURATION,
		});
	}

	return results;
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
	// Query per-host port allowlist
	const allowlistRows = await db
		.prepare("SELECT port FROM port_allowlist WHERE host_id = ?")
		.bind(hostId)
		.all<{ port: number }>();
	const perHostAllowed = allowlistRows.results.map((r) => r.port);

	const results = evaluateTier2Rules(payload, perHostAllowed);

	for (const result of results) {
		if (result.durationSeconds === 0) {
			await handleInstantRule(db, hostId, result, now);
		} else {
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

// Export for testing
export { evaluateTier2Rules };
export type { AlertEvalResult };
