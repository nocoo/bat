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
	formatPairingCode,
	normalizePairingCode,
	validateWorkstationAuthorize,
	validateWorkstationLoginExchange,
	validateWorkstationPairStart,
	WORKSTATION_AUTH_CODE_TTL_SECONDS,
	WORKSTATION_PAIRING_TTL_SECONDS,
	WORKSTATION_RATE_LIMITS,
} from "@bat/shared";
import type { Context } from "hono";
import { machineOrigin, rateLimit } from "../domain/workstation-history.js";
import {
	generateAuthCode,
	generatePairingCode,
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
		pairing_hash: null,
		approved_at: null,
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

/**
 * Start a headless pairing. No Access session is involved: the machine only
 * receives a short code and keeps the full PKCE code locally. Nothing is
 * enrolled until an operator approves the short code in the dashboard.
 */
export async function workstationPairStartRoute(c: Context<AppEnv>) {
	const body = await readWorkstationBody(c);
	if (!body.ok) {
		return c.json({ error: body.error }, body.status);
	}
	const parsed = validateWorkstationPairStart(body.value);
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
		!(await c.var.repos.workstations.rate(`pair:${parsed.value.installation_id}`, limit, 600, now))
	) {
		return c.json({ error: "Too many enrollment attempts. Retry later." }, 429);
	}
	const code = generateAuthCode();
	const pairing = generatePairingCode();
	const expiresAt = now + WORKSTATION_PAIRING_TTL_SECONDS;
	await c.var.repos.workstations.createCode({
		code_hash: await hashSecret(code),
		// The owner is stamped by the approving Access principal, never by the machine.
		owner: "",
		installation_id: parsed.value.installation_id,
		challenge: parsed.value.code_challenge,
		name: parsed.value.name,
		created_at: now,
		expires_at: expiresAt,
		consumed_at: null,
		pairing_hash: await hashSecret(pairing),
		approved_at: null,
	});
	return c.json(
		{
			pairing_code: formatPairingCode(pairing),
			code,
			name: parsed.value.name,
			expires_at: expiresAt,
		},
		201,
	);
}

/** Poll one pairing's status. The short code is the only credential here. */
export async function workstationPairStatusRoute(
	c: Context<AppEnv, "/api/workstation-auth/pair/:code">,
) {
	const normalized = normalizePairingCode(c.req.param("code"));
	if (normalized === null) {
		return c.json({ error: "pairing code must be eight characters" }, 400);
	}
	const hash = await hashSecret(normalized);
	const now = nowSeconds();
	const limit = rateLimit(
		c.env.ENVIRONMENT,
		c.env.WORKSTATION_RATE_LIMIT,
		WORKSTATION_RATE_LIMITS.pairStatusPerTenMinutes,
	);
	if (!(await c.var.repos.workstations.rate(`pair-status:${hash}`, limit, 600, now))) {
		return c.json({ error: "Too many status checks. Retry later." }, 429);
	}
	const row = await c.var.repos.workstations.getCodeByPairing(hash);
	if (!row) {
		return c.json({ error: "Unknown pairing code" }, 404);
	}
	const status =
		row.approved_at !== null || row.consumed_at !== null
			? "approved"
			: row.expires_at <= now
				? "expired"
				: "pending";
	return c.json({ status, name: row.name, expires_at: row.expires_at });
}
