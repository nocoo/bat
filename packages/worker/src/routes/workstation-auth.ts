// Workstation enrollment:
//   POST /api/workstation-auth/authorize — Access-authenticated, same-origin
//        consent POST. Mints a one-time PKCE code and returns `redirect_url`.
//        There is no GET mint path.
//   POST /api/workstation-auth/exchange  — machine endpoint; verifies the PKCE
//        verifier and atomically consumes the code, registers the workstation
//        and rotates its dedicated `batw_` key.
//
// Enrollment is restricted to a human `email:` Access principal. Service tokens
// and Connect Bearer keys cannot enroll or re-key a workstation.

import {
	validateWorkstationAuthorize,
	validateWorkstationLoginExchange,
	WORKSTATION_AUTH_CODE_TTL_SECONDS,
	WORKSTATION_RATE_LIMITS,
} from "@bat/shared";
import type { Context } from "hono";
import { machineOrigin, rateLimit } from "../domain/workstation-history.js";
import {
	generateAuthCode,
	generateWorkstationToken,
	hashSecret,
	pkceChallenge,
} from "../domain/workstation-token.js";
import { readWorkstationBody } from "../middleware/workstation.js";
import type { AppEnv } from "../types.js";

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

function sameOriginManagement(c: Context<AppEnv>): boolean {
	return (
		c.req.header("Origin") === new URL(c.req.url).origin && c.req.header("X-Bat-Management") === "1"
	);
}

export async function workstationAuthorizeRoute(c: Context<AppEnv>) {
	if (c.get("accessAuthenticated") !== true) {
		return c.json({ error: "Enrollment requires a browser Access session" }, 403);
	}
	const principal = c.var.accessPrincipal;
	if (!principal?.startsWith("email:")) {
		return c.json({ error: "Enrollment requires a human Access principal" }, 403);
	}
	if (!sameOriginManagement(c)) {
		return c.json({ error: "A same-origin browser confirmation is required" }, 403);
	}
	const now = nowSeconds();
	const limit = rateLimit(
		c.env.ENVIRONMENT,
		c.env.WORKSTATION_RATE_LIMIT,
		WORKSTATION_RATE_LIMITS.exchangePerTenMinutes,
	);
	if (
		!(await c.var.repos.workstations.rate(
			`authorize:${await hashSecret(principal)}`,
			limit,
			600,
			now,
		))
	) {
		return c.json({ error: "Too many enrollment attempts. Retry later." }, 429);
	}
	const body = await readWorkstationBody(c);
	if (!body.ok) {
		return c.json({ error: body.error }, body.status);
	}
	const parsed = validateWorkstationAuthorize(body.value);
	if (!parsed.ok) {
		return c.json({ error: parsed.error }, 400);
	}
	const code = generateAuthCode();
	await c.var.repos.workstations.createCode({
		code_hash: await hashSecret(code),
		owner: principal,
		installation_id: parsed.value.installation_id,
		challenge: parsed.value.code_challenge,
		name: parsed.value.name as string,
		created_at: now,
		expires_at: now + WORKSTATION_AUTH_CODE_TTL_SECONDS,
		consumed_at: null,
	});
	const redirect = new URL(parsed.value.callback);
	redirect.searchParams.set("code", code);
	redirect.searchParams.set("state", parsed.value.state);
	return c.json({ redirect_url: redirect.toString() }, 201);
}

export async function workstationExchangeRoute(c: Context<AppEnv>) {
	const body = await readWorkstationBody(c);
	if (!body.ok) {
		return c.json({ error: body.error }, body.status);
	}
	const parsed = validateWorkstationLoginExchange(body.value);
	if (!parsed.ok) {
		return c.json({ error: parsed.error }, 400);
	}
	const now = nowSeconds();
	const limit = rateLimit(
		c.env.ENVIRONMENT,
		c.env.WORKSTATION_RATE_LIMIT,
		WORKSTATION_RATE_LIMITS.exchangePerTenMinutes,
	);
	if (
		!(await c.var.repos.workstations.rate(
			`exchange:${parsed.value.installation_id}`,
			limit,
			600,
			now,
		))
	) {
		return c.json({ error: "Too many enrollment attempts. Retry later." }, 429);
	}
	const codeHash = await hashSecret(parsed.value.code);
	const code = await c.var.repos.workstations.getCode(codeHash);
	if (!code || code.consumed_at !== null || code.expires_at <= now) {
		return c.json({ error: "Authorization code is invalid or expired" }, 401);
	}
	if (code.installation_id !== parsed.value.installation_id) {
		return c.json({ error: "Authorization code belongs to another installation" }, 401);
	}
	if ((await pkceChallenge(parsed.value.code_verifier)) !== code.challenge) {
		return c.json({ error: "PKCE verification failed" }, 401);
	}
	const token = generateWorkstationToken();
	const result = await c.var.repos.workstations.exchange({
		codeHash,
		installationId: parsed.value.installation_id,
		owner: code.owner,
		name: code.name,
		tokenHash: await hashSecret(token),
		tokenPrefix: token.slice(0, 12),
		now,
	});
	if (result.ok === "code_invalid") {
		return c.json({ error: "Authorization code is invalid or expired" }, 401);
	}
	if (result.ok === "owner_mismatch") {
		return c.json({ error: "This installation is enrolled to another owner" }, 409);
	}
	if (result.ok === "disabled") {
		return c.json({ error: "This workstation is disabled" }, 403);
	}
	return c.json({
		workstation_id: result.row.id,
		token,
		worker_url: machineOrigin(c.env.ENVIRONMENT, new URL(c.req.url).origin),
	});
}
