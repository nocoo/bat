// Workstation credential helpers. Keys are dedicated `batw_` values carrying
// 256 random bits; D1 only ever stores the SHA-256 digest.

import {
	WORKSTATION_PAIRING_ALPHABET,
	WORKSTATION_PAIRING_LENGTH,
	WORKSTATION_TOKEN_BYTES,
} from "@bat/shared";
import { hashToken } from "./cli-token.js";

const encoder = new TextEncoder();

export function base64url(bytes: Uint8Array): string {
	let binary = "";
	for (let start = 0; start < bytes.length; start += 32768)
		binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function generateWorkstationToken(): string {
	return `batw_${base64url(crypto.getRandomValues(new Uint8Array(WORKSTATION_TOKEN_BYTES)))}`;
}

/** One-time authorization codes are opaque to the CLI; only their digest is stored. */
export function generateAuthCode(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Eight characters from the dictation-safe alphabet: 32^8 ≈ 2^40. A human types
 * it in the dashboard once, and approval still requires an Access session.
 */
export function generatePairingCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(WORKSTATION_PAIRING_LENGTH));
	let code = "";
	for (const byte of bytes) {
		code += WORKSTATION_PAIRING_ALPHABET[byte % WORKSTATION_PAIRING_ALPHABET.length];
	}
	return code;
}

export async function hashSecret(value: string): Promise<string> {
	return hashToken(value);
}

/** PKCE S256: BASE64URL(SHA-256(ASCII(code_verifier))). */
export async function pkceChallenge(verifier: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
	return base64url(new Uint8Array(digest));
}

export function bearerToken(header: string | undefined): string | null {
	if (!header) {
		return null;
	}
	const parts = header.split(" ");
	if (parts.length !== 2 || parts[0] !== "Bearer") {
		return null;
	}
	return parts[1] as string;
}
