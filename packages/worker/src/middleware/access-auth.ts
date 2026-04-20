// Access JWT authentication middleware for browser endpoint
// Verifies Cloudflare Access JWT using jose library
// - localhost: skip JWT verification (local dev / E2E tests)
// - bat-ingest.*: skip (handled by apiKeyAuth)
// - bat.*: require valid Access JWT

import type { Context, Next } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppEnv } from "../types.js";
import { isLocalhost, isMachineEndpoint } from "./entry-control.js";

// Cache JWKS to avoid fetching on every request
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCacheTeamDomain: string | null = null;

function getJWKS(teamDomain: string) {
	if (jwksCache && jwksCacheTeamDomain === teamDomain) {
		return jwksCache;
	}
	jwksCache = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
	jwksCacheTeamDomain = teamDomain;
	return jwksCache;
}

export async function accessAuth(c: Context<AppEnv>, next: Next) {
	const host = c.req.header("host") || "";

	// localhost: skip Access JWT, continue with apiKeyAuth (local dev / E2E tests)
	if (isLocalhost(host)) {
		return next();
	}

	// bat-ingest.* endpoint: already handled by entryControl, skip to apiKeyAuth
	if (isMachineEndpoint(host)) {
		return next();
	}

	// Public route: no JWT required
	if (c.req.path === "/api/live") {
		return next();
	}

	// bat.* endpoint: require Access JWT
	const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
	const aud = c.env.CF_ACCESS_AUD;

	// If Access is not configured, fall back to API key auth
	// This allows gradual migration and testing
	if (!(teamDomain && aud)) {
		return next();
	}

	const jwt = c.req.header("Cf-Access-Jwt-Assertion");
	if (!jwt) {
		return c.json({ error: "Missing Access JWT" }, 401);
	}

	try {
		const jwks = getJWKS(teamDomain);
		await jwtVerify(jwt, jwks, {
			issuer: `https://${teamDomain}`,
			audience: aud,
		});
	} catch {
		return c.json({ error: "Invalid Access JWT" }, 403);
	}

	return next();
}
