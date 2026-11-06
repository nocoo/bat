// Workstation consent query parsing and callback verification. The consent page
// must never hand the browser an unverified redirect: the returned URL is only
// accepted when it resolves to the exact loopback callback that requested it.

import type { WorkstationAuthorizeInput } from "@bat/shared";
import { isPkceS256Challenge, isUuid, isWorkstationCallbackUrl } from "@bat/shared";

const STATE_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const AUTH_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const NAME_MAX = 64;
const HOSTNAME_MAX = 253;

export interface WorkstationLoginParams {
	installation_id: string;
	code_challenge: string;
	state: string;
	callback: string;
	name: string;
	hostname: string | null;
}

export type WorkstationLoginParse =
	| { ok: true; value: WorkstationLoginParams }
	| { ok: false; error: string };

function text(params: URLSearchParams, key: string): string | null {
	const value = params.get(key);
	return value === null || value.trim() === "" ? null : value;
}

export function parseWorkstationLoginQuery(
	search: string | URLSearchParams,
): WorkstationLoginParse {
	const params = typeof search === "string" ? new URLSearchParams(search) : search;
	for (const key of [
		"installation_id",
		"code_challenge",
		"code_challenge_method",
		"state",
		"callback",
	]) {
		if (text(params, key) === null) {
			return { ok: false, error: `Missing required ${key} parameter.` };
		}
	}
	const installationId = params.get("installation_id") as string;
	if (!isUuid(installationId)) {
		return { ok: false, error: "installation_id must be a UUID." };
	}
	const challenge = params.get("code_challenge") as string;
	if (!isPkceS256Challenge(challenge)) {
		return { ok: false, error: "code_challenge must be a 43 character base64url S256 digest." };
	}
	if (params.get("code_challenge_method") !== "S256") {
		return { ok: false, error: "code_challenge_method must be S256." };
	}
	const state = params.get("state") as string;
	if (!STATE_PATTERN.test(state)) {
		return { ok: false, error: "state must be 16 to 128 URL-safe characters." };
	}
	const callback = params.get("callback") as string;
	if (!isWorkstationCallbackUrl(callback)) {
		return {
			ok: false,
			error: "callback must be a loopback http or https URL at exactly /callback.",
		};
	}
	const rawHostname = params.get("hostname");
	if (rawHostname !== null && (rawHostname.length > HOSTNAME_MAX || rawHostname.trim() === "")) {
		return { ok: false, error: `hostname must be 1 to ${HOSTNAME_MAX} characters.` };
	}
	const rawName = params.get("name");
	let name = (rawHostname ?? "Workstation").slice(0, NAME_MAX);
	if (rawName !== null) {
		const trimmed = rawName.trim();
		if (trimmed.length === 0 || rawName.length > NAME_MAX) {
			return { ok: false, error: `name must be 1 to ${NAME_MAX} characters.` };
		}
		name = rawName;
	}
	return {
		ok: true,
		value: {
			installation_id: installationId,
			code_challenge: challenge,
			state,
			callback,
			name,
			hostname: rawHostname,
		},
	};
}

export function workstationMachineLabel(params: WorkstationLoginParams): string {
	return params.hostname ?? params.name;
}

export function buildAuthorizeInput(
	params: WorkstationLoginParams,
	name: string,
): WorkstationAuthorizeInput {
	const trimmed = name.trim();
	return {
		installation_id: params.installation_id,
		code_challenge: params.code_challenge,
		code_challenge_method: "S256",
		state: params.state,
		callback: params.callback,
		...(trimmed === "" ? {} : { name: trimmed.slice(0, NAME_MAX) }),
	};
}

export type RedirectCheck = { ok: true; url: string } | { ok: false; error: string };

export function validateWorkstationRedirect(
	requestedCallback: string,
	redirectUrl: string,
	expectedState: string,
): RedirectCheck {
	let requested: URL;
	let candidate: URL;
	try {
		requested = new URL(requestedCallback);
		candidate = new URL(redirectUrl);
	} catch {
		return { ok: false, error: "The authorization response was not a valid URL." };
	}
	if (!isWorkstationCallbackUrl(requestedCallback)) {
		return { ok: false, error: "The requested callback is not a safe loopback URL." };
	}
	if (
		candidate.protocol !== requested.protocol ||
		candidate.origin !== requested.origin ||
		candidate.pathname !== requested.pathname
	) {
		return {
			ok: false,
			error: "The authorization response did not return to the requested loopback callback.",
		};
	}
	if (candidate.username !== "" || candidate.password !== "" || candidate.hash !== "") {
		return { ok: false, error: "The authorization response contained unsafe URL components." };
	}
	const keys = [...candidate.searchParams.keys()].sort();
	if (keys.length !== 2 || keys[0] !== "code" || keys[1] !== "state") {
		return { ok: false, error: "The authorization response contained unexpected parameters." };
	}
	const code = candidate.searchParams.get("code") as string;
	if (!AUTH_CODE_PATTERN.test(code)) {
		return { ok: false, error: "The authorization response did not contain a valid code." };
	}
	if (candidate.searchParams.get("state") !== expectedState) {
		return { ok: false, error: "The authorization response state did not match this request." };
	}
	return { ok: true, url: redirectUrl };
}
