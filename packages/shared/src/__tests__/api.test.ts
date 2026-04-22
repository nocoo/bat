// @bat/shared — api.ts tests (hashHostId, route constants)
import { describe, expect, test } from "bun:test";
import { API_ROUTES, hashHostId, MAX_ALLOWED_PORTS_PER_HOST, MAX_TAGS_PER_HOST, TAG_COLOR_COUNT, TAG_MAX_LENGTH } from "../api.js";

describe("hashHostId", () => {
	test("returns an 8-char hex string", () => {
		const h = hashHostId("example.com");
		expect(h).toMatch(/^[0-9a-f]{8}$/);
		expect(h).toHaveLength(8);
	});

	test("is deterministic", () => {
		expect(hashHostId("web-01")).toBe(hashHostId("web-01"));
		expect(hashHostId("db.internal")).toBe(hashHostId("db.internal"));
	});

	test("produces different hashes for different inputs", () => {
		const a = hashHostId("web-01");
		const b = hashHostId("web-02");
		const c = hashHostId("db.internal");
		expect(a).not.toBe(b);
		expect(a).not.toBe(c);
		expect(b).not.toBe(c);
	});

	test("empty string hashes to a valid 8-char hex (FNV-1a offset basis)", () => {
		// FNV-1a with no input returns the offset basis 0x811c9dc5
		expect(hashHostId("")).toBe("811c9dc5");
	});

	test("zero-pads shorter hashes", () => {
		// We can't force a specific short hash, but all outputs must be 8 chars.
		for (const s of ["a", "aa", "aaa", "\u0000", "\u0001"]) {
			expect(hashHostId(s)).toHaveLength(8);
		}
	});

	test("handles non-ASCII input", () => {
		const h = hashHostId("主机-01.例え.com");
		expect(h).toMatch(/^[0-9a-f]{8}$/);
	});

	test("is order-sensitive (not a simple char-sum)", () => {
		expect(hashHostId("abc")).not.toBe(hashHostId("cba"));
		expect(hashHostId("abc")).not.toBe(hashHostId("bca"));
	});
});

describe("API_ROUTES", () => {
	test("all values start with /api/", () => {
		for (const v of Object.values(API_ROUTES)) {
			expect(v.startsWith("/api/")).toBe(true);
		}
	});

	test("contains expected critical routes", () => {
		expect(API_ROUTES.INGEST).toBe("/api/ingest");
		expect(API_ROUTES.HOSTS).toBe("/api/hosts");
		expect(API_ROUTES.ALERTS).toBe("/api/alerts");
		expect(API_ROUTES.EVENTS).toBe("/api/events");
	});

	test("parametric routes use :id convention", () => {
		expect(API_ROUTES.HOST_DETAIL).toContain(":id");
		expect(API_ROUTES.HOST_METRICS).toContain(":id");
		expect(API_ROUTES.WEBHOOK_DETAIL).toContain(":id");
	});
});

describe("API constants", () => {
	test("tag limits are sane positive integers", () => {
		expect(TAG_MAX_LENGTH).toBeGreaterThan(0);
		expect(MAX_TAGS_PER_HOST).toBeGreaterThan(0);
		expect(TAG_COLOR_COUNT).toBeGreaterThan(0);
	});

	test("allowed-ports limit matches docs (50 per host)", () => {
		expect(MAX_ALLOWED_PORTS_PER_HOST).toBe(50);
	});
});
