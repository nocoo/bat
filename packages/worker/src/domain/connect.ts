import type { ConnectScope, ConnectToken } from "@bat/shared";

export class ConnectFault extends Error {
	constructor(
		public readonly status:
			| 400
			| 401
			| 403
			| 404
			| 409
			| 412
			| 413
			| 415
			| 422
			| 428
			| 429
			| 500
			| 501
			| 503
			| 504,
		public readonly code: string,
		message: string,
	) {
		super(message);
	}
}

export interface ConnectTokenRow {
	id: string;
	server_id: string;
	name: string;
	scope: ConnectScope;
	prefix: string;
	token_hash: string;
	ciphertext: string;
	owner: string;
	created_at: number;
	last_used_at: number | null;
	expires_at: number | null;
	revoked_at: number | null;
	version: number;
}

const encoder = new TextEncoder();
export function base64url(bytes: Uint8Array): string {
	let binary = "";
	for (let start = 0; start < bytes.length; start += 32768)
		binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function unbase64(value: string): Uint8Array<ArrayBuffer> {
	return Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (c) =>
		c.charCodeAt(0),
	);
}

export function randomSecret(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function fingerprint(value: string): Promise<string> {
	return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function keyring(raw: string | undefined): { active: string; keys: Record<string, string> } {
	try {
		const value = JSON.parse(raw ?? "");
		if (
			typeof value.active !== "string" ||
			!/^[a-z0-9_-]{1,32}$/.test(value.active) ||
			typeof value.keys !== "object" ||
			value.keys === null ||
			Array.isArray(value.keys) ||
			!Object.hasOwn(value.keys, value.active) ||
			typeof value.keys[value.active] !== "string"
		)
			throw new Error();
		return value;
	} catch {
		throw new ConnectFault(503, "encryption_unavailable", "Connect encryption is not configured.");
	}
}

async function deriveKey(raw: string, context: string): Promise<CryptoKey> {
	let bytes: Uint8Array<ArrayBuffer>;
	try {
		bytes = unbase64(raw);
		if (bytes.length !== 32) throw new Error();
	} catch {
		throw new ConnectFault(503, "encryption_unavailable", "Connect encryption key is invalid.");
	}
	const source = await crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveKey"]);
	return crypto.subtle.deriveKey(
		{
			name: "HKDF",
			hash: "SHA-256",
			salt: encoder.encode("bat.connect.v1"),
			info: encoder.encode(context),
		},
		source,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

/** Random nonce + purpose/server/record-bound authenticated encryption. No plaintext cache. */
export async function seal(
	rawKeys: string | undefined,
	context: string,
	plaintext: string,
): Promise<string> {
	const ring = keyring(rawKeys);
	const key = await deriveKey(ring.keys[ring.active] as string, context);
	const nonce = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv: nonce, additionalData: encoder.encode(context), tagLength: 128 },
		key,
		encoder.encode(plaintext),
	);
	return ["1", ring.active, base64url(nonce), base64url(new Uint8Array(encrypted))].join(".");
}

export async function unseal(
	rawKeys: string | undefined,
	context: string,
	ciphertext: string,
): Promise<string> {
	const ring = keyring(rawKeys);
	try {
		const [version, keyId, nonce, data, extra] = ciphertext.split(".");
		if (version !== "1" || !keyId || !nonce || !data || extra || !Object.hasOwn(ring.keys, keyId))
			throw new Error();
		const key = await deriveKey(ring.keys[keyId] as string, context);
		const plaintext = await crypto.subtle.decrypt(
			{
				name: "AES-GCM",
				iv: unbase64(nonce),
				additionalData: encoder.encode(context),
				tagLength: 128,
			},
			key,
			unbase64(data),
		);
		return new TextDecoder().decode(plaintext);
	} catch {
		throw new ConnectFault(
			503,
			"decryption_failed",
			"This secret could not be decrypted. Contact the server administrator.",
		);
	}
}

export function tokenContext(
	deployment: string,
	token: Pick<ConnectTokenRow, "id" | "server_id" | "scope" | "owner" | "expires_at">,
): string {
	return JSON.stringify([
		"token",
		deployment,
		token.server_id,
		token.id,
		token.scope,
		token.owner,
		token.expires_at,
	]);
}

const iso = (value: number | null): string | null =>
	value === null ? null : new Date(value * 1000).toISOString();
export function tokenMetadata(row: ConnectTokenRow): ConnectToken {
	return {
		id: row.id,
		serverId: row.server_id,
		name: row.name,
		scope: row.scope,
		prefix: row.prefix,
		createdAt: iso(row.created_at) as string,
		lastUsedAt: iso(row.last_used_at),
		expiresAt: iso(row.expires_at),
		revokedAt: iso(row.revoked_at),
		version: row.version,
	};
}

export function validateTokenInput(
	body: Record<string, unknown>,
	now: number,
): { name: string; scope: ConnectScope; expiresAt: number | null } {
	if (
		typeof body.name !== "string" ||
		!body.name.trim() ||
		body.name.trim().length > 64 ||
		[...body.name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
		body.name.includes("batc_")
	)
		throw new ConnectFault(400, "invalid_name", "Name must contain 1–64 printable characters.");
	if (body.scope !== "read" && body.scope !== "write")
		throw new ConnectFault(
			400,
			"invalid_scope",
			"Scope must be read or write; write includes read.",
		);
	let expiresAt: number | null = null;
	if (body.expiresAt !== undefined && body.expiresAt !== null) {
		if (typeof body.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(body.expiresAt))
			throw new ConnectFault(
				400,
				"invalid_expiry",
				"expiresAt must be an ISO 8601 timestamp or null.",
			);
		expiresAt = Math.floor(Date.parse(body.expiresAt) / 1000);
		if (!Number.isFinite(expiresAt) || expiresAt <= now)
			throw new ConnectFault(400, "invalid_expiry", "Expiry must be in the future.");
	}
	return { name: body.name.trim(), scope: body.scope, expiresAt };
}

export function configuredManager(config: string | undefined, principal: string): boolean {
	return (config ?? "")
		.split(",")
		.map((entry) => entry.trim().toLowerCase())
		.filter(Boolean)
		.includes(principal.toLowerCase());
}

export function isConnectPath(path: string): boolean {
	return (
		path === "/api/v1" ||
		path.startsWith("/api/v1/") ||
		path === "/api/connect" ||
		path.startsWith("/api/connect/")
	);
}

export function isVersionedPath(path: string): boolean {
	return path === "/api/v1" || path.startsWith("/api/v1/");
}

export function coordinates(method: string, path: string): boolean {
	if (["GET", "HEAD", "OPTIONS"].includes(method) || !path.startsWith("/api/")) return false;
	return !["/api/ingest", "/api/identity", "/api/tier2", "/api/events"].includes(path);
}
