// /api/me — returns current user info from Access JWT
// JWT already verified by accessAuth middleware.
// Name + avatar are filled from the public author profile when the email hashes.

import type { Context } from "hono";
import { fetchAuthorProfile } from "../lib/author-profile.js";
import type { AppEnv } from "../types.js";

export interface AccessJwtPayload {
	email?: string;
	name?: string;
}

export function decodeJwtPayload(jwt: string): AccessJwtPayload | null {
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

export async function meRoute(c: Context<AppEnv>) {
	const jwt = c.req.header("Cf-Access-Jwt-Assertion");

	// No JWT means either localhost dev or machine endpoint — return anonymous
	if (!jwt) {
		return c.json({
			email: null,
			name: null,
			avatar: null,
			authenticated: false,
		});
	}

	const payload = decodeJwtPayload(jwt);
	if (!payload) {
		return c.json({
			email: null,
			name: null,
			avatar: null,
			authenticated: false,
		});
	}

	const email = payload.email ?? null;
	const profile = email ? await fetchAuthorProfile(email) : { name: null, avatar: null };

	return c.json({
		email,
		name: profile.name ?? payload.name ?? email?.split("@")[0] ?? null,
		avatar: profile.avatar,
		authenticated: true,
	});
}
