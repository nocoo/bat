// Workstation machine-path authentication and bounded JSON body reading.
//
// The two probe routes accept only a dedicated `batw_` key. Static probe keys,
// CLI asset tokens and Access sessions never authenticate them, and a
// workstation key never authenticates a server route.

import { isWorkstationToken, WORKSTATION_BODY_MAX_BYTES } from "@bat/shared";
import type { Context, Next } from "hono";
import { ConnectFault } from "../domain/connect.js";
import { bearerToken, hashSecret } from "../domain/workstation-token.js";
import { readBody } from "../lib/read-body.js";
import type { AppEnv } from "../types.js";

export const WORKSTATION_PROBE_PREFIX = "/api/workstation-probe/";
export const WORKSTATION_AUTH_PREFIX = "/api/workstation-auth/";

export function isWorkstationPath(path: string): boolean {
	return path.startsWith(WORKSTATION_PROBE_PREFIX) || path.startsWith(WORKSTATION_AUTH_PREFIX);
}

export async function workstationKeyAuth(c: Context<AppEnv>, next: Next) {
	const token = bearerToken(c.req.header("Authorization"));
	if (!token || !isWorkstationToken(token)) {
		return c.json({ error: "A valid workstation key is required" }, 401);
	}
	const tokenHash = await hashSecret(token);
	const row = await c.var.repos.workstations.findByTokenHash(tokenHash);
	if (!row) {
		return c.json({ error: "A valid workstation key is required" }, 401);
	}
	if (row.disabled === 1) {
		return c.json({ error: "This workstation is disabled" }, 403);
	}
	if (row.revoked_at !== null) {
		return c.json({ error: "A valid workstation key is required" }, 401);
	}
	c.set("workstation", row);
	c.set("workstationTokenHash", tokenHash);
	return next();
}

/**
 * Observation responses never cache. The headers are prepared before the
 * handler runs, so success and error responses alike carry them.
 */
export async function workstationNoStore(c: Context<AppEnv>, next: Next) {
	c.header("Cache-Control", "no-store, private, max-age=0, no-transform");
	c.header("Pragma", "no-cache");
	c.header("Referrer-Policy", "no-referrer");
	c.header("X-Content-Type-Options", "nosniff");
	c.header("X-Frame-Options", "DENY");
	c.header("Cross-Origin-Resource-Policy", "same-origin");
	c.header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
	await next();
}

export type BodyResult =
	| { ok: true; value: unknown }
	| { ok: false; status: 400 | 413 | 415 | 504; error: string };

/** Streamed, bounded JSON body. Reuses the Worker's 64 KiB / 5 s body reader. */
export async function readWorkstationBody(c: Context<AppEnv>): Promise<BodyResult> {
	if (c.req.raw.body && !/^application\/json(?:;|$)/i.test(c.req.header("Content-Type") ?? "")) {
		return { ok: false, status: 415, error: "Use Content-Type: application/json" };
	}
	let bytes: ArrayBuffer | null;
	try {
		bytes = await readBody(c.req.raw, WORKSTATION_BODY_MAX_BYTES);
	} catch (error) {
		if (error instanceof ConnectFault && error.status === 413) {
			return {
				ok: false,
				status: 413,
				error: `Request body exceeds ${WORKSTATION_BODY_MAX_BYTES / 1024} KiB`,
			};
		}
		return { ok: false, status: 504, error: "Request body was not received in time" };
	}
	let raw: string;
	try {
		raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes ?? new ArrayBuffer(0));
	} catch {
		return { ok: false, status: 400, error: "Request body must be valid UTF-8 JSON" };
	}
	if (raw.trim() === "") {
		return { ok: false, status: 400, error: "Request body must be a JSON object" };
	}
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { ok: false, status: 400, error: "Request body must be valid JSON" };
	}
	return { ok: true, value };
}
