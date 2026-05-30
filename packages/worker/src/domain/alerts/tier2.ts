// Pure tier-2 alert rule evaluator. No I/O.
// Persistence (alert_states / alert_pending) is the D1 adapter's job.
//
// Source of truth: docs/01-metrics-catalogue.md § Alert Rules #7–15
// Removed: #12 security_updates, #15 reboot_required (updates collector deleted)

import { DEFAULT_PUBLIC_PORT_ALLOWLIST, TIER2_THRESHOLDS, type Tier2Payload } from "@bat/shared";
import type { AlertEvalResult } from "./types.js";

export type { AlertEvalResult, AlertSeverity } from "./types.js";

/**
 * Evaluate all Tier-2 alert rules against a Tier 2 payload.
 * @param perHostAllowed Extra port numbers to allowlist for this host (from port_allowlist table)
 * Returns evaluation results for each applicable rule.
 */
export function evaluateTier2Rules(
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

	return results;
}
