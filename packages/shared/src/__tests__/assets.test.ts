import { describe, expect, test } from "vitest";
import {
	AGENT_MATCH_KEY_MAX_LENGTH,
	AGENT_NICKNAME_MAX_LENGTH,
	ASSET_METADATA_MAX_BYTES,
	ASSET_NAME_MAX_LENGTH,
	generateId,
	VALID_AGENT_STATUSES,
	VALID_ASSET_STATUSES,
	VALID_ASSET_TYPES,
	VALID_CLI_TOKEN_SCOPES,
	validateEnum,
	validateMetadata,
	validateOptionalEnum,
	validateOptionalString,
	validateString,
} from "../assets.js";

describe("generateId", () => {
	test("produces correct length and prefix", () => {
		const id = generateId("agt_");
		expect(id).toHaveLength(4 + 21);
		expect(id.startsWith("agt_")).toBe(true);
	});

	test("produces unique values", () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateId("ast_")));
		expect(ids.size).toBe(100);
	});

	test("uses only alphanumeric chars after prefix", () => {
		const id = generateId("t_");
		const suffix = id.slice(2);
		expect(suffix).toMatch(/^[0-9a-z]{21}$/);
	});

	test("throws on invalid prefix (no trailing underscore)", () => {
		expect(() => generateId("agt")).toThrow("Invalid ID prefix");
	});

	test("throws on invalid prefix (uppercase)", () => {
		expect(() => generateId("AGT_")).toThrow("Invalid ID prefix");
	});

	test("throws on invalid prefix (numbers)", () => {
		expect(() => generateId("a1_")).toThrow("Invalid ID prefix");
	});

	test("throws on empty prefix", () => {
		expect(() => generateId("")).toThrow("Invalid ID prefix");
	});
});

describe("validateMetadata", () => {
	test("accepts undefined → empty object", () => {
		const r = validateMetadata(undefined);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value).toBe("{}");
		}
	});

	test("accepts null → empty object", () => {
		const r = validateMetadata(null);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value).toBe("{}");
		}
	});

	test("accepts valid plain object", () => {
		const r = validateMetadata({ service: "workers", url: "https://x.com" });
		expect(r.ok).toBe(true);
		if (r.ok) {
			const parsed = JSON.parse(r.value);
			expect(parsed.service).toBe("workers");
		}
	});

	test("rejects arrays", () => {
		const r = validateMetadata([1, 2, 3]);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("plain object");
		}
	});

	test("rejects primitives", () => {
		expect(validateMetadata("string").ok).toBe(false);
		expect(validateMetadata(42).ok).toBe(false);
		expect(validateMetadata(true).ok).toBe(false);
	});

	test("rejects oversized metadata", () => {
		const large = { data: "x".repeat(ASSET_METADATA_MAX_BYTES) };
		const r = validateMetadata(large);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("exceeds");
		}
	});

	test("accepts metadata at exactly max bytes", () => {
		// Build an object that's just under the limit
		const payload: Record<string, string> = {};
		let size = 2; // "{}"
		let i = 0;
		while (size < ASSET_METADATA_MAX_BYTES - 20) {
			const key = `k${i}`;
			const val = "v";
			size += JSON.stringify({ [key]: val }).length - 2 + (i > 0 ? 1 : 0);
			payload[key] = val;
			i++;
		}
		const r = validateMetadata(payload);
		expect(r.ok).toBe(true);
	});

	test("rejects Date objects", () => {
		const r = validateMetadata(new Date());
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("plain object");
		}
	});

	test("rejects Map instances", () => {
		const r = validateMetadata(new Map([["key", "val"]]));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("plain object");
		}
	});

	test("rejects class instances", () => {
		class Foo {
			x = 1;
		}
		const r = validateMetadata(new Foo());
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("plain object");
		}
	});

	test("rejects circular references", () => {
		const obj: Record<string, unknown> = {};
		Object.setPrototypeOf(obj, null); // make it "plain" proto-wise
		obj.self = obj; // circular
		const r = validateMetadata(obj);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("unserializable");
		}
	});

	test("rejects BigInt values", () => {
		const obj = Object.create(null);
		obj.big = BigInt(9007199254740991);
		const r = validateMetadata(obj);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("unserializable");
		}
	});

	test("rejects non-ASCII content exceeding byte limit", () => {
		// Each emoji "😀" is 4 UTF-8 bytes but 2 JS chars (surrogate pair)
		// 1100 emojis × 4 bytes = 4400 bytes > 4096, but string length is ~2200 chars
		const r = validateMetadata({ x: "😀".repeat(1100) });
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("exceeds");
		}
	});

	test("accepts plain object with null prototype", () => {
		const obj = Object.create(null);
		obj.key = "value";
		const r = validateMetadata(obj);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(JSON.parse(r.value)).toEqual({ key: "value" });
		}
	});
});

describe("validateString", () => {
	test("accepts valid string", () => {
		const r = validateString("name", "hello", 128);
		expect(r).toEqual({ ok: true, value: "hello" });
	});

	test("trims whitespace", () => {
		const r = validateString("name", "  spaced  ", 128);
		expect(r).toEqual({ ok: true, value: "spaced" });
	});

	test("rejects non-string", () => {
		expect(validateString("name", 42, 128).ok).toBe(false);
		expect(validateString("name", null, 128).ok).toBe(false);
	});

	test("rejects empty after trim", () => {
		expect(validateString("name", "", 128).ok).toBe(false);
		expect(validateString("name", "   ", 128).ok).toBe(false);
	});

	test("rejects too long", () => {
		const r = validateString("name", "x".repeat(ASSET_NAME_MAX_LENGTH + 1), ASSET_NAME_MAX_LENGTH);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("at most");
		}
	});

	test("accepts at max length", () => {
		const r = validateString(
			"key",
			"x".repeat(AGENT_MATCH_KEY_MAX_LENGTH),
			AGENT_MATCH_KEY_MAX_LENGTH,
		);
		expect(r.ok).toBe(true);
	});
});

describe("validateOptionalString", () => {
	test("undefined → null", () => {
		expect(validateOptionalString("f", undefined, 64)).toEqual({ ok: true, value: null });
	});

	test("null → null", () => {
		expect(validateOptionalString("f", null, 64)).toEqual({ ok: true, value: null });
	});

	test("empty string → null", () => {
		expect(validateOptionalString("f", "", 64)).toEqual({ ok: true, value: null });
	});

	test("whitespace only → null", () => {
		expect(validateOptionalString("f", "   ", 64)).toEqual({ ok: true, value: null });
	});

	test("valid string → trimmed", () => {
		expect(validateOptionalString("f", " hello ", 64)).toEqual({ ok: true, value: "hello" });
	});

	test("rejects non-string", () => {
		expect(validateOptionalString("f", 42, 64).ok).toBe(false);
	});

	test("rejects too long", () => {
		const r = validateOptionalString(
			"nick",
			"x".repeat(AGENT_NICKNAME_MAX_LENGTH + 1),
			AGENT_NICKNAME_MAX_LENGTH,
		);
		expect(r.ok).toBe(false);
	});
});

describe("validateEnum", () => {
	test("accepts valid value", () => {
		expect(validateEnum("status", "running", VALID_AGENT_STATUSES)).toEqual({
			ok: true,
			value: "running",
		});
	});

	test("rejects invalid value", () => {
		const r = validateEnum("status", "invalid", VALID_AGENT_STATUSES);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error).toContain("must be one of");
		}
	});

	test("rejects non-string", () => {
		expect(validateEnum("type", 42, VALID_ASSET_TYPES).ok).toBe(false);
	});

	test("works for all enum sets", () => {
		for (const s of VALID_AGENT_STATUSES) {
			expect(validateEnum("s", s, VALID_AGENT_STATUSES).ok).toBe(true);
		}
		for (const t of VALID_ASSET_TYPES) {
			expect(validateEnum("t", t, VALID_ASSET_TYPES).ok).toBe(true);
		}
		for (const s of VALID_ASSET_STATUSES) {
			expect(validateEnum("s", s, VALID_ASSET_STATUSES).ok).toBe(true);
		}
		for (const s of VALID_CLI_TOKEN_SCOPES) {
			expect(validateEnum("s", s, VALID_CLI_TOKEN_SCOPES).ok).toBe(true);
		}
	});
});

describe("validateOptionalEnum", () => {
	test("undefined → null", () => {
		expect(validateOptionalEnum("status", undefined, VALID_AGENT_STATUSES)).toEqual({
			ok: true,
			value: null,
		});
	});

	test("null → null", () => {
		expect(validateOptionalEnum("status", null, VALID_AGENT_STATUSES)).toEqual({
			ok: true,
			value: null,
		});
	});

	test("valid value → value", () => {
		expect(validateOptionalEnum("type", "domain", VALID_ASSET_TYPES)).toEqual({
			ok: true,
			value: "domain",
		});
	});

	test("invalid value → error", () => {
		expect(validateOptionalEnum("type", "bad", VALID_ASSET_TYPES).ok).toBe(false);
	});
});
