// CLI auth route — mint a new CLI token via CF Access-authenticated browser session.
// POST /api/auth/cli — requires CF Access JWT (browser context only).
// Static API keys (BAT_READ_KEY/BAT_WRITE_KEY) and existing CLI Bearer tokens
// CANNOT mint new tokens — only authenticated browser sessions can.
//
// Request body: { label?: string }
// Response: { token: string, id: number, label: string, scope: string }
//   (token is plaintext, shown only once)

import { CLI_TOKEN_LABEL_MAX_LENGTH } from "@bat/shared";
import type { Context } from "hono";
import { createCliToken, generateCliToken, hashToken } from "../services/cli-tokens.js";
import type { AppEnv } from "../types.js";

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
		let body: Record<string, unknown>;
		try {
			body = JSON.parse(raw);
		} catch {
			return c.json({ error: "Invalid JSON body" }, 400);
		}
		if (typeof body.label === "string" && body.label.trim().length > 0) {
			const trimmed = body.label.trim();
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
