import type { WebhookConfigRow } from "@bat/shared";
// Unit tests for the pure DTO shaper in webhooks route.
import { describe, expect, test } from "vitest";
import { toWebhookConfig } from "./webhooks";

const baseRow: WebhookConfigRow = {
	id: 42,
	host_id: "web-01",
	token: "deadbeef".repeat(4),
	rate_limit: 60,
	is_active: 1,
	created_at: 1_700_000_000,
	updated_at: 1_700_001_000,
	window_start: 1_700_000_000,
	window_count: 3,
};

describe("toWebhookConfig", () => {
	test("copies the public fields verbatim", () => {
		const out = toWebhookConfig(baseRow);
		expect(out.id).toBe(42);
		expect(out.host_id).toBe("web-01");
		expect(out.token).toBe(baseRow.token);
		expect(out.rate_limit).toBe(60);
		expect(out.created_at).toBe(1_700_000_000);
		expect(out.updated_at).toBe(1_700_001_000);
	});

	test("coerces is_active=1 to true and is_active=0 to false", () => {
		expect(toWebhookConfig({ ...baseRow, is_active: 1 }).is_active).toBe(true);
		expect(toWebhookConfig({ ...baseRow, is_active: 0 }).is_active).toBe(false);
	});

	test("does not leak window_start / window_count onto the DTO", () => {
		const out = toWebhookConfig(baseRow) as Record<string, unknown>;
		expect("window_start" in out).toBe(false);
		expect("window_count" in out).toBe(false);
	});

	test("does not mutate the input row", () => {
		const row = { ...baseRow };
		toWebhookConfig(row);
		expect(row).toEqual(baseRow);
	});

	test("non-1 is_active values are treated as false (defensive)", () => {
		expect(toWebhookConfig({ ...baseRow, is_active: 2 as 0 | 1 }).is_active).toBe(false);
	});
});

import { parseWebhookId, validateWebhookCreateBody } from "./webhooks";

describe("parseWebhookId", () => {
	test("parses valid integer string", () => {
		expect(parseWebhookId("42")).toBe(42);
		expect(parseWebhookId("0")).toBe(0);
	});
	test("returns null for undefined/empty", () => {
		expect(parseWebhookId(undefined)).toBeNull();
		expect(parseWebhookId("")).toBeNull();
	});
	test("returns null for non-numeric", () => {
		expect(parseWebhookId("abc")).toBeNull();
	});
	test("parses leading-integer strings like parseInt", () => {
		expect(parseWebhookId("12x")).toBe(12);
	});
	test("returns null for pure whitespace", () => {
		expect(parseWebhookId("   ")).toBeNull();
	});
});

describe("validateWebhookCreateBody", () => {
	test("accepts valid body with host_id", () => {
		expect(validateWebhookCreateBody({ host_id: "web-01" })).toEqual({
			ok: true,
			host_id: "web-01",
		});
	});
	test("rejects null / non-object", () => {
		expect(validateWebhookCreateBody(null)).toEqual({ ok: false, error: "Invalid payload" });
		expect(validateWebhookCreateBody("x")).toEqual({ ok: false, error: "Invalid payload" });
		expect(validateWebhookCreateBody(42)).toEqual({ ok: false, error: "Invalid payload" });
	});
	test("rejects missing host_id", () => {
		expect(validateWebhookCreateBody({})).toEqual({
			ok: false,
			error: "host_id is required",
		});
	});
	test("rejects empty-string host_id", () => {
		expect(validateWebhookCreateBody({ host_id: "" })).toEqual({
			ok: false,
			error: "host_id is required",
		});
	});
	test("rejects non-string host_id", () => {
		expect(validateWebhookCreateBody({ host_id: 5 })).toEqual({
			ok: false,
			error: "host_id is required",
		});
	});
	test("ignores extra fields (future rate_limit etc.)", () => {
		expect(validateWebhookCreateBody({ host_id: "web-01", rate_limit: 120, extra: true })).toEqual({
			ok: true,
			host_id: "web-01",
		});
	});
});
