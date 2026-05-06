// CLI token service — generation, hashing, and D1 operations
import type { CliTokenRow, CliTokenScope } from "@bat/shared";

/** Generate a 32-byte (64 hex char) CLI token using Web Crypto */
export function generateCliToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** SHA-256 hash a token for storage (never store plaintext) */
export async function hashToken(token: string): Promise<string> {
	const encoded = new TextEncoder().encode(token);
	const digest = await crypto.subtle.digest("SHA-256", encoded);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** Create a new CLI token in D1. Returns the row (without plaintext). */
export async function createCliToken(
	db: D1Database,
	tokenHash: string,
	label: string,
	scope: CliTokenScope,
): Promise<CliTokenRow> {
	const row = await db
		.prepare("INSERT INTO cli_tokens (token_hash, label, scope) VALUES (?, ?, ?) RETURNING *")
		.bind(tokenHash, label, scope)
		.first<CliTokenRow>();
	if (!row) {
		throw new Error("Failed to create CLI token");
	}
	return row;
}

/** List all CLI tokens (no plaintext, for management UI). */
export async function listCliTokens(db: D1Database): Promise<CliTokenRow[]> {
	const result = await db
		.prepare("SELECT * FROM cli_tokens ORDER BY created_at DESC")
		.all<CliTokenRow>();
	return result.results;
}

/** Delete a CLI token by ID. Returns true if deleted, false if not found. */
export async function deleteCliToken(db: D1Database, id: number): Promise<boolean> {
	const result = await db.prepare("DELETE FROM cli_tokens WHERE id = ?").bind(id).run();
	return result.meta.changes > 0;
}

/** Find a CLI token by hash. Updates last_used_at. Returns null if not found. */
export async function findCliTokenByHash(
	db: D1Database,
	tokenHash: string,
): Promise<CliTokenRow | null> {
	const row = await db
		.prepare("SELECT * FROM cli_tokens WHERE token_hash = ?")
		.bind(tokenHash)
		.first<CliTokenRow>();
	if (!row) {
		return null;
	}
	// Update last_used_at
	await db
		.prepare("UPDATE cli_tokens SET last_used_at = unixepoch() WHERE id = ?")
		.bind(row.id)
		.run();
	return row;
}
