// CLI auth routes:
// POST /api/auth/cli — mint a new CLI token via CF Access-authenticated browser session.
// GET  /api/auth/cli — browser login bridge for CLI OAuth flow.
//
// POST: direct API call from Dashboard UI (CF Access JWT required).
// GET:  browser redirect target — cli-base opens this in a browser,
//       it mints a token and 302 redirects back to the CLI's loopback callback.
//
// Both require CF Access JWT (browser context only).
// Static API keys and existing CLI Bearer tokens CANNOT mint tokens.

import { CLI_TOKEN_LABEL_MAX_LENGTH } from "@bat/shared";
import type { Context } from "hono";
import { createCliToken, generateCliToken, hashToken } from "../services/cli-tokens.js";
import type { AppEnv } from "../types.js";

/**
 * Allowed loopback hostnames for the callback URL.
 * Only these are accepted to prevent token exfiltration to external hosts.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Validate that a URL points to a loopback address.
 * Returns the parsed URL if valid, null otherwise.
 */
function parseLoopbackUrl(raw: string): URL | null {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return null;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return null;
	}
	if (!LOOPBACK_HOSTS.has(url.hostname)) {
		return null;
	}
	return url;
}

/**
 * GET /api/auth/cli — Browser login bridge for CLI OAuth flow.
 *
 * Query params:
 *   - callback (required): loopback URL to redirect back to
 *   - state (required): CSRF nonce, passed through unchanged
 *   - label (optional): label for the minted token (default: "cli")
 *
 * On success: 302 redirect to callback?api_key=<token>&state=<state>&worker_url=<origin>
 * On failure: 4xx JSON error
 */
export async function cliAuthBridgeRoute(c: Context<AppEnv>) {
	// CRITICAL: Only CF Access-authenticated browser sessions can mint tokens.
	const accessAuthenticated = c.get("accessAuthenticated") === true;
	if (!accessAuthenticated) {
		return c.json({ error: "CLI token minting requires browser authentication" }, 403);
	}

	const url = new URL(c.req.url);

	// Validate callback parameter — must be a loopback URL
	const callbackRaw = url.searchParams.get("callback");
	if (!callbackRaw) {
		return c.json({ error: "Missing callback parameter" }, 400);
	}
	const callbackUrl = parseLoopbackUrl(callbackRaw);
	if (!callbackUrl) {
		return c.json(
			{ error: "callback must be a loopback URL (127.0.0.1, localhost, or [::1])" },
			400,
		);
	}

	// Validate state parameter — required for CSRF protection
	const state = url.searchParams.get("state");
	if (!state) {
		return c.json({ error: "Missing state parameter" }, 400);
	}

	// Optional label
	let label = "cli";
	const labelParam = url.searchParams.get("label");
	if (labelParam && labelParam.trim().length > 0) {
		const trimmed = labelParam.trim();
		if (trimmed.length > CLI_TOKEN_LABEL_MAX_LENGTH) {
			return c.json(
				{ error: `label must be at most ${CLI_TOKEN_LABEL_MAX_LENGTH} characters` },
				400,
			);
		}
		label = trimmed;
	}

	// Mint token
	const plaintext = generateCliToken();
	const tokenHash = await hashToken(plaintext);
	await createCliToken(c.env.DB, tokenHash, label, "assets");

	// Build redirect URL: callback + api_key + state + worker_url
	const redirectUrl = new URL(callbackUrl.toString());
	redirectUrl.searchParams.set("api_key", plaintext);
	redirectUrl.searchParams.set("state", state);

	// Derive worker_url from the current request origin
	const workerUrl = url.origin;
	redirectUrl.searchParams.set("worker_url", workerUrl);

	return c.redirect(redirectUrl.toString(), 302);
}

export async function cliAuthRoute(c: Context<AppEnv>) {
	// CRITICAL: Only CF Access-authenticated browser sessions can mint tokens.
	// This is enforced here as a defense-in-depth check beyond middleware.
	const accessAuthenticated = c.get("accessAuthenticated") === true;
	if (!accessAuthenticated) {
		return c.json({ error: "CLI token minting requires browser authentication" }, 403);
	}

	// Parse optional body — read raw text to handle chunked/no-Content-Length cases
	let label = "cli";
	const raw = await c.req.text();

	if (raw.trim().length > 0) {
		let body: unknown;
		try {
			body = JSON.parse(raw);
		} catch {
			return c.json({ error: "Invalid JSON body" }, 400);
		}
		if (typeof body !== "object" || body === null || Array.isArray(body)) {
			return c.json({ error: "Request body must be a JSON object" }, 400);
		}
		const obj = body as Record<string, unknown>;
		if (typeof obj.label === "string" && obj.label.trim().length > 0) {
			const trimmed = obj.label.trim();
			if (trimmed.length > CLI_TOKEN_LABEL_MAX_LENGTH) {
				return c.json(
					{ error: `label must be at most ${CLI_TOKEN_LABEL_MAX_LENGTH} characters` },
					400,
				);
			}
			label = trimmed;
		}
	}

	// Generate token + hash
	const plaintext = generateCliToken();
	const tokenHash = await hashToken(plaintext);

	// Store in D1
	const row = await createCliToken(c.env.DB, tokenHash, label, "assets");

	return c.json(
		{
			token: plaintext,
			id: row.id,
			label: row.label,
			scope: row.scope,
			created_at: row.created_at,
		},
		201,
	);
}
