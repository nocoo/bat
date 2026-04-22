// Tests for pure helpers inside route files that didn't have unit coverage.
// Keeping these in a single "pure-helpers" file (vs one test-per-route)
// minimizes boilerplate.

import { describe, expect, test } from "bun:test";
import { extractBearerToken } from "./events-ingest";
import { parsePagination, parseTags } from "./events-list";
import { decodeJwtPayload } from "./me";

describe("extractBearerToken", () => {
	test("returns null for undefined/empty header", () => {
		expect(extractBearerToken(undefined)).toBeNull();
		expect(extractBearerToken("")).toBeNull();
	});

	test("returns null for non-Bearer scheme", () => {
		expect(extractBearerToken("Basic abc123")).toBeNull();
		expect(extractBearerToken("Token xyz")).toBeNull();
	});

	test("returns null for malformed header (wrong number of parts)", () => {
		expect(extractBearerToken("Bearer")).toBeNull();
		expect(extractBearerToken("Bearer foo bar")).toBeNull();
	});

	test("case-sensitive on the scheme name", () => {
		expect(extractBearerToken("bearer abc")).toBeNull();
		expect(extractBearerToken("BEARER abc")).toBeNull();
	});

	test("returns the token on a valid header", () => {
		expect(extractBearerToken("Bearer deadbeef")).toBe("deadbeef");
		expect(extractBearerToken("Bearer 0123456789abcdef")).toBe("0123456789abcdef");
	});
});

describe("parseTags", () => {
	test("returns [] on invalid JSON", () => {
		expect(parseTags("")).toEqual([]);
		expect(parseTags("not json")).toEqual([]);
		expect(parseTags("{")).toEqual([]);
	});

	test("returns [] when JSON is not an array", () => {
		expect(parseTags('"tag"')).toEqual([]);
		expect(parseTags("42")).toEqual([]);
		expect(parseTags('{"a":1}')).toEqual([]);
	});

	test("returns the parsed array as-is", () => {
		expect(parseTags('["prod","db"]')).toEqual(["prod", "db"]);
		expect(parseTags("[]")).toEqual([]);
	});
});

describe("parsePagination", () => {
	test("returns defaults when both params are undefined", () => {
		expect(parsePagination(undefined, undefined)).toEqual({ limit: 30, offset: 0 });
	});

	test("parses valid limit/offset strings", () => {
		expect(parsePagination("10", "5")).toEqual({ limit: 10, offset: 5 });
		expect(parsePagination("1", "0")).toEqual({ limit: 1, offset: 0 });
	});

	test("caps limit at MAX_LIMIT (500)", () => {
		expect(parsePagination("10000", undefined).limit).toBe(500);
	});

	test("falls back to defaults on non-numeric or non-positive input", () => {
		expect(parsePagination("abc", "xyz")).toEqual({ limit: 30, offset: 0 });
		expect(parsePagination("0", "-1")).toEqual({ limit: 30, offset: 0 });
		expect(parsePagination("", "")).toEqual({ limit: 30, offset: 0 });
	});

	test("accepts offset of 0 explicitly", () => {
		expect(parsePagination("10", "0").offset).toBe(0);
	});

	test("ignores trailing garbage (parseInt semantics)", () => {
		expect(parsePagination("10abc", "3abc")).toEqual({ limit: 10, offset: 3 });
	});
});

describe("decodeJwtPayload", () => {
	const b64url = (s: string) =>
		Buffer.from(s).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

	test("decodes a valid JWT payload (email + name)", () => {
		const payload = JSON.stringify({ email: "alice@example.com", name: "Alice" });
		const jwt = `header.${b64url(payload)}.sig`;
		expect(decodeJwtPayload(jwt)).toEqual({ email: "alice@example.com", name: "Alice" });
	});

	test("handles URL-safe base64 characters (- and _)", () => {
		const payload = JSON.stringify({ email: "x@y" });
		const encoded = b64url(payload);
		const jwt = `h.${encoded}.s`;
		expect(decodeJwtPayload(jwt)?.email).toBe("x@y");
	});

	test("returns null when JWT doesn't have 3 parts", () => {
		expect(decodeJwtPayload("abc")).toBeNull();
		expect(decodeJwtPayload("abc.def")).toBeNull();
		expect(decodeJwtPayload("a.b.c.d")).toBeNull();
	});

	test("returns null when payload is not valid base64/JSON", () => {
		expect(decodeJwtPayload("h...s")).toBeNull();
		expect(decodeJwtPayload("h.!!!.s")).toBeNull();
	});

	test("returns null when payload is empty", () => {
		expect(decodeJwtPayload("h..s")).toBeNull();
	});
});
