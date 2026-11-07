// Workstation probe routes. Both authenticate with the workstation's dedicated
// `batw_` key; neither accepts a static probe key, a CLI token or an Access
// session.
//
//   GET  /api/workstation-probe/targets — currently authorized public targets
//   POST /api/workstation-probe/reports — one validated snapshot

import {
	validateWorkstationReport,
	WORKSTATION_INTERVAL_SECONDS,
	WORKSTATION_MAX_TARGETS,
	WORKSTATION_PING_COUNT,
	WORKSTATION_RATE_LIMITS,
	WORKSTATION_REPORTS_DEFAULT_LIMIT,
	WORKSTATION_REPORTS_MAX_LIMIT,
} from "@bat/shared";
import type { Context } from "hono";
import { observedPublicIp, rateLimit } from "../domain/workstation-history.js";
import { hashSecret } from "../domain/workstation-token.js";
import { readWorkstationBody } from "../middleware/workstation.js";
import {
	discoverWorkstationTargets,
	reportTargetsAllowed,
} from "../services/workstation-targets.js";
import type { AppEnv } from "../types.js";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

export async function workstationTargetsRoute(c: Context<AppEnv>) {
	const workstation = c.var.workstation;
	if (!workstation) {
		return c.json({ error: "A valid workstation key is required" }, 401);
	}
	const now = nowSeconds();
	const limit = rateLimit(
		c.env.ENVIRONMENT,
		c.env.WORKSTATION_RATE_LIMIT,
		WORKSTATION_RATE_LIMITS.targetsPerMinute,
	);
	if (!(await c.var.repos.workstations.rate(`targets:${workstation.id}`, limit, 60, now))) {
		return c.json({ error: "Too many target requests. Retry later." }, 429);
	}
	const targets = await discoverWorkstationTargets(
		c.var.repos,
		c.env.CONNECT_MANAGERS,
		workstation.owner,
	);
	return c.json({
		data: targets.slice(0, WORKSTATION_MAX_TARGETS),
		interval_seconds: WORKSTATION_INTERVAL_SECONDS,
		ping_count: WORKSTATION_PING_COUNT,
	});
}

/**
 * Revoke the presented credential only. The workstation, its reports and its
 * installation binding stay; a later re-login rotates the key for the same
 * workstation ID. Nothing else is accepted on this path.
 */
export async function workstationRevokeRoute(c: Context<AppEnv>) {
	const workstation = c.var.workstation;
	if (!workstation) {
		return c.json({ error: "A valid workstation key is required" }, 401);
	}
	const now = nowSeconds();
	const limit = rateLimit(
		c.env.ENVIRONMENT,
		c.env.WORKSTATION_RATE_LIMIT,
		WORKSTATION_RATE_LIMITS.reportsPerMinute,
	);
	if (!(await c.var.repos.workstations.rate(`revoke:${workstation.id}`, limit, 60, now))) {
		return c.json({ error: "Too many revocation attempts. Retry later." }, 429);
	}
	const revoked = await c.var.repos.workstations.revokeKey(
		workstation.id,
		c.var.workstationTokenHash as string,
		now,
	);
	if (!revoked) {
		return c.json({ error: "The credential could not be revoked" }, 409);
	}
	return c.body(null, 204);
}

/**
 * The machine reads back its own newest reports so `bat workstation detail` can
 * show per-target probe results without the browser.
 */
export async function workstationReportsReadRoute(c: Context<AppEnv>) {
	const workstation = c.var.workstation;
	if (!workstation) {
		return c.json({ error: "Workstation authentication required" }, 401);
	}
	const raw = c.req.query("limit");
	const parsed = raw === undefined ? WORKSTATION_REPORTS_DEFAULT_LIMIT : Number(raw);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > WORKSTATION_REPORTS_MAX_LIMIT) {
		return c.json(
			{ error: `limit must be an integer between 1 and ${WORKSTATION_REPORTS_MAX_LIMIT}` },
			400,
		);
	}
	const data = await c.var.repos.workstations.recentReports(workstation.id, parsed);
	return c.json({ data, limit: parsed });
}

export async function workstationReportRoute(c: Context<AppEnv>) {
	const workstation = c.var.workstation;
	if (!workstation) {
		return c.json({ error: "A valid workstation key is required" }, 401);
	}
	const now = nowSeconds();
	const limit = rateLimit(
		c.env.ENVIRONMENT,
		c.env.WORKSTATION_RATE_LIMIT,
		WORKSTATION_RATE_LIMITS.reportsPerMinute,
	);
	if (!(await c.var.repos.workstations.rate(`reports:${workstation.id}`, limit, 60, now))) {
		return c.json({ error: "Too many reports. Retry later." }, 429);
	}
	const body = await readWorkstationBody(c);
	if (!body.ok) {
		return c.json({ error: body.error }, body.status);
	}
	const parsed = validateWorkstationReport(body.value, now);
	if (!parsed.ok) {
		return c.json({ error: parsed.error }, 400);
	}
	let targets: Awaited<ReturnType<typeof discoverWorkstationTargets>>;
	try {
		targets = await discoverWorkstationTargets(
			c.var.repos,
			c.env.CONNECT_MANAGERS,
			workstation.owner,
		);
	} catch {
		return c.json({ error: "Target authorization could not be verified" }, 503);
	}
	if (!reportTargetsAllowed(parsed.value.connectivity, targets)) {
		return c.json(
			{ error: "Reported targets do not match your currently authorized servers" },
			403,
		);
	}
	const result = await c.var.repos.workstations.insertReport({
		workstationId: workstation.id,
		report: parsed.value,
		bodyHash: await hashSecret(JSON.stringify(parsed.value)),
		receivedAt: now,
		publicIp: observedPublicIp(c.env.ENVIRONMENT, c.req.header("CF-Connecting-IP") ?? null),
	});
	if (result.ok === "conflict") {
		return c.json({ error: "Report ID was already used with different content" }, 409);
	}
	if (result.ok === "disabled") {
		return c.json({ error: "This workstation is disabled" }, 403);
	}
	return c.json({
		status: "accepted",
		received_at: result.received_at,
		duplicate: result.duplicate,
	});
}
