// Pure helper: generate a 32-character hex token for webhook configs.
// Lives outside `adapters/d1/` because it does not touch storage; both the
// D1 webhook adapter and any future engine can reuse it.

/** Generate a 32-character hex token using Web Crypto API. */
export function generateWebhookToken(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
