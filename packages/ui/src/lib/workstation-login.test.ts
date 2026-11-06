import { describe, expect, test } from "vitest";
import {
	buildAuthorizeInput,
	parseWorkstationLoginQuery,
	validateWorkstationRedirect,
	workstationMachineLabel,
} from "./workstation-login";

const installation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const challenge = "A".repeat(43);
const state = "state-0123456789abcdef";
const callback = "http://127.0.0.1:8787/callback";

function query(overrides: Record<string, string | null> = {}): string {
	const params = new URLSearchParams({
		installation_id: installation,
		code_challenge: challenge,
		code_challenge_method: "S256",
		state,
		callback,
	});
	for (const [key, value] of Object.entries(overrides)) {
		if (value === null) params.delete(key);
		else params.set(key, value);
	}
	return params.toString();
}

function parsed(search = query()) {
	const result = parseWorkstationLoginQuery(search);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

describe("parseWorkstationLoginQuery", () => {
	test("accepts the validated PKCE consent query and defaults the name", () => {
		expect(parsed()).toEqual({
			installation_id: installation,
			code_challenge: challenge,
			state,
			callback,
			name: "Workstation",
			hostname: null,
		});
		expect(parseWorkstationLoginQuery(new URLSearchParams(query()))).toMatchObject({ ok: true });
	});

	test("uses an optional hostname as the default display name", () => {
		const value = parsed(query({ hostname: "field-laptop" }));
		expect(value.hostname).toBe("field-laptop");
		expect(value.name).toBe("field-laptop");
		expect(workstationMachineLabel(value)).toBe("field-laptop");
	});

	test("keeps an explicit name and machine label", () => {
		const value = parsed(query({ hostname: "field-laptop", name: "Build laptop" }));
		expect(value.name).toBe("Build laptop");
		expect(workstationMachineLabel(value)).toBe("field-laptop");
		expect(workstationMachineLabel(parsed(query({ name: "Build laptop" })))).toBe("Build laptop");
	});

	test("rejects missing fields with the offending name", () => {
		for (const key of [
			"installation_id",
			"code_challenge",
			"code_challenge_method",
			"state",
			"callback",
		]) {
			expect(parseWorkstationLoginQuery(query({ [key]: null }))).toEqual({
				ok: false,
				error: `Missing required ${key} parameter.`,
			});
			expect(parseWorkstationLoginQuery(query({ [key]: " " }))).toMatchObject({ ok: false });
		}
	});

	test("rejects a non-UUID installation, bad challenge, wrong method and weak state", () => {
		expect(parseWorkstationLoginQuery(query({ installation_id: "not-a-uuid" }))).toEqual({
			ok: false,
			error: "installation_id must be a UUID.",
		});
		expect(parseWorkstationLoginQuery(query({ code_challenge: "short" }))).toEqual({
			ok: false,
			error: "code_challenge must be a 43 character base64url S256 digest.",
		});
		expect(parseWorkstationLoginQuery(query({ code_challenge_method: "plain" }))).toEqual({
			ok: false,
			error: "code_challenge_method must be S256.",
		});
		expect(parseWorkstationLoginQuery(query({ state: "short" }))).toEqual({
			ok: false,
			error: "state must be 16 to 128 URL-safe characters.",
		});
	});

	test("rejects non-loopback, non-callback and query-bearing callbacks", () => {
		for (const value of [
			"https://evil.example/callback",
			"http://127.0.0.1:8787/other",
			"http://127.0.0.1:8787/callback?x=1",
			"http://user:pass@127.0.0.1:8787/callback",
			"ftp://127.0.0.1/callback",
		]) {
			expect(parseWorkstationLoginQuery(query({ callback: value }))).toEqual({
				ok: false,
				error: "callback must be a loopback http or https URL at exactly /callback.",
			});
		}
	});

	test("validates optional hostname and name bounds", () => {
		expect(parseWorkstationLoginQuery(query({ hostname: "x".repeat(254) }))).toEqual({
			ok: false,
			error: "hostname must be 1 to 253 characters.",
		});
		expect(parseWorkstationLoginQuery(query({ hostname: " " }))).toMatchObject({ ok: false });
		expect(parseWorkstationLoginQuery(query({ name: " " }))).toEqual({
			ok: false,
			error: "name must be 1 to 64 characters.",
		});
		expect(parseWorkstationLoginQuery(query({ name: "x".repeat(65) }))).toEqual({
			ok: false,
			error: "name must be 1 to 64 characters.",
		});
	});

	test("truncates an overlong hostname default to the name limit", () => {
		const value = parsed(query({ hostname: "h".repeat(80) }));
		expect(value.name).toHaveLength(64);
	});
});

describe("buildAuthorizeInput", () => {
	test("always pins S256 and sends a trimmed display name", () => {
		expect(buildAuthorizeInput(parsed(), "  Field laptop  ")).toEqual({
			installation_id: installation,
			code_challenge: challenge,
			code_challenge_method: "S256",
			state,
			callback,
			name: "Field laptop",
		});
	});

	test("omits a blank name so the server default applies", () => {
		expect(buildAuthorizeInput(parsed(), "   ")).not.toHaveProperty("name");
	});

	test("caps a display name at 64 characters", () => {
		expect(buildAuthorizeInput(parsed(), "x".repeat(70)).name).toHaveLength(64);
	});
});

describe("validateWorkstationRedirect", () => {
	const redirect = `${callback}?code=${"B".repeat(43)}&state=${state}`;

	test("accepts the exact callback with only code and state", () => {
		expect(validateWorkstationRedirect(callback, redirect, state)).toEqual({
			ok: true,
			url: redirect,
		});
	});

	test("rejects malformed URLs and unsafe requested callbacks", () => {
		expect(validateWorkstationRedirect(callback, "not a url", state)).toEqual({
			ok: false,
			error: "The authorization response was not a valid URL.",
		});
		expect(validateWorkstationRedirect("https://evil.example/callback", redirect, state)).toEqual({
			ok: false,
			error: "The requested callback is not a safe loopback URL.",
		});
	});

	test("rejects a different origin, path, protocol or embedded credentials", () => {
		for (const candidate of [
			`http://127.0.0.1:9999/callback?code=${"B".repeat(43)}&state=${state}`,
			`http://127.0.0.1:8787/other?code=${"B".repeat(43)}&state=${state}`,
			`https://127.0.0.1:8787/callback?code=${"B".repeat(43)}&state=${state}`,
			`http://user@127.0.0.1:8787/callback?code=${"B".repeat(43)}&state=${state}`,
			`http://127.0.0.1:8787/callback?code=${"B".repeat(43)}&state=${state}#fragment`,
		]) {
			expect(validateWorkstationRedirect(callback, candidate, state)).toMatchObject({ ok: false });
		}
	});

	test("rejects unexpected, duplicate or missing parameters", () => {
		for (const candidate of [
			`${callback}?code=${"B".repeat(43)}&state=${state}&extra=1`,
			`${callback}?code=${"B".repeat(43)}&code=${"B".repeat(43)}&state=${state}`,
			`${callback}?code=${"B".repeat(43)}`,
			`${callback}?state=${state}`,
		]) {
			expect(validateWorkstationRedirect(callback, candidate, state)).toMatchObject({ ok: false });
		}
	});

	test("rejects an invalid code or mismatched state", () => {
		expect(
			validateWorkstationRedirect(callback, `${callback}?code=short&state=${state}`, state),
		).toEqual({
			ok: false,
			error: "The authorization response did not contain a valid code.",
		});
		expect(
			validateWorkstationRedirect(
				callback,
				`${callback}?code=${"B".repeat(43)}&state=other-state-value`,
				state,
			),
		).toEqual({
			ok: false,
			error: "The authorization response state did not match this request.",
		});
	});
});
