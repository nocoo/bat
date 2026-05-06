// CLI token management routes — list and delete tokens.
// All require CF Access JWT (browser context only).
//
// GET    /api/cli-tokens     — list all tokens (no plaintext)
// DELETE /api/cli-tokens/:id — revoke a token

import type { CliTokenItem } from "@bat/shared";
import type { Context } from "hono";
import { deleteCliToken, listCliTokens } from "../services/cli-tokens.js";
import type { AppEnv } from "../types.js";

export async function cliTokensListRoute(c: Context<AppEnv>) {
	const rows = await listCliTokens(c.env.DB);
	const items: CliTokenItem[] = rows.map((row) => ({
		id: row.id,
		label: row.label,
		scope: row.scope,
		created_at: row.created_at,
		last_used_at: row.last_used_at,
	}));
	return c.json(items);
}

export async function cliTokensDeleteRoute(c: Context<AppEnv>) {
	const idParam = c.req.param("id") ?? "";
	const id = Number.parseInt(idParam, 10);
	if (Number.isNaN(id)) {
		return c.json({ error: "Invalid token ID" }, 400);
	}

	const deleted = await deleteCliToken(c.env.DB, id);
	if (!deleted) {
		return c.json({ error: "Token not found" }, 404);
	}

	return c.body(null, 204);
}
