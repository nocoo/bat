// Pure helpers for CLI token generation and hashing. No I/O — both the
// D1 cli-tokens adapter and any future engine reuse them.

/** Generate a 32-byte (64 hex char) CLI token using Web Crypto. */
export function generateCliToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

/** SHA-256 hash a token for storage (never store plaintext). */
export async function hashToken(token: string): Promise<string> {
	const encoded = new TextEncoder().encode(token);
	const digest = await crypto.subtle.digest("SHA-256", encoded);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
