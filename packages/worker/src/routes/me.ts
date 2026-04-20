// /api/me — returns current user info from Access JWT
// JWT already verified by accessAuth middleware

import type { Context } from "hono";
import type { AppEnv } from "../types.js";

interface AccessJwtPayload {
	email?: string;
	name?: string;
	// other claims omitted
}

function decodeJwtPayload(jwt: string): AccessJwtPayload | null {
	const parts = jwt.split(".");
	if (parts.length !== 3 || !parts[1]) {
		return null;
	}
	try {
		const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
		return JSON.parse(payload);
	} catch {
		return null;
	}
}

export function meRoute(c: Context<AppEnv>) {
	const jwt = c.req.header("Cf-Access-Jwt-Assertion");

	// No JWT means either localhost dev or machine endpoint — return anonymous
	if (!jwt) {
		return c.json({
			email: null,
			name: null,
			authenticated: false,
		});
	}

	const payload = decodeJwtPayload(jwt);
	if (!payload) {
		return c.json({
			email: null,
			name: null,
			authenticated: false,
		});
	}

	return c.json({
		email: payload.email ?? null,
		name: payload.name ?? payload.email?.split("@")[0] ?? null,
		authenticated: true,
	});
}
