import { describe, expect, test } from "bun:test";
import type { HostOverviewItem, WebhookConfig } from "@bat/shared";
import {
	buildCurlCommand,
	displayWebhookHostname,
	filterAvailableHosts,
	validateTagName,
} from "./webhooks-format";

const host = (host_id: string, hostname = host_id): HostOverviewItem =>
	({ host_id, hostname }) as HostOverviewItem;
const wh = (host_id: string, id = 1): WebhookConfig => ({ id, host_id }) as WebhookConfig;

describe("filterAvailableHosts", () => {
	test("returns [] when hosts is null/empty", () => {
		expect(filterAvailableHosts(null, [])).toEqual([]);
		expect(filterAvailableHosts([], null)).toEqual([]);
	});

	test("returns all hosts when no webhooks configured", () => {
		const hs = [host("a"), host("b")];
		expect(filterAvailableHosts(hs, null)).toEqual(hs);
		expect(filterAvailableHosts(hs, [])).toEqual(hs);
	});

	test("excludes hosts that already have a webhook", () => {
		const hs = [host("a"), host("b"), host("c")];
		const ws = [wh("a"), wh("c")];
		expect(filterAvailableHosts(hs, ws).map((h) => h.host_id)).toEqual(["b"]);
	});

	test("does not mutate input hosts array", () => {
		const hs = [host("a"), host("b")];
		const out = filterAvailableHosts(hs, []);
		expect(out).not.toBe(hs);
	});
});

describe("displayWebhookHostname", () => {
	test("uses hostname when host is found", () => {
		const hs = [host("deadbeefcafe", "web-01")];
		expect(displayWebhookHostname(hs, "deadbeefcafe")).toBe("web-01");
	});

	test("falls back to first 8 chars of host_id when host not found", () => {
		expect(displayWebhookHostname([], "deadbeefcafe")).toBe("deadbeef");
		expect(displayWebhookHostname(null, "deadbeefcafe")).toBe("deadbeef");
	});

	test("returns full id when id is shorter than 8 chars", () => {
		expect(displayWebhookHostname([], "abc")).toBe("abc");
	});
});

describe("buildCurlCommand", () => {
	test("contains URL, token, content-type header, and test payload", () => {
		const cmd = buildCurlCommand("https://api.example.com", "tok-123");
		expect(cmd).toContain("https://api.example.com/api/events");
		expect(cmd).toContain("Authorization: Bearer tok-123");
		expect(cmd).toContain("Content-Type: application/json");
		expect(cmd).toContain('"type":"test"');
	});

	test("is a multi-line curl command", () => {
		const cmd = buildCurlCommand("https://x", "t");
		expect(cmd.split("\n").length).toBeGreaterThanOrEqual(4);
	});
});

describe("validateTagName", () => {
	test("rejects empty/whitespace-only names", () => {
		expect(validateTagName("", 32).ok).toBe(false);
		expect(validateTagName("   ", 32).ok).toBe(false);
	});

	test("trims whitespace and returns normalized name", () => {
		expect(validateTagName("  prod  ", 32)).toEqual({ ok: true, name: "prod" });
	});

	test("rejects names exceeding max length (after trim)", () => {
		const long = "x".repeat(33);
		expect(validateTagName(long, 32).ok).toBe(false);
	});

	test("accepts names at exactly max length", () => {
		const exact = "x".repeat(32);
		expect(validateTagName(exact, 32)).toEqual({ ok: true, name: exact });
	});

	test("accepts Unicode/CJK names", () => {
		expect(validateTagName("生产", 32)).toEqual({ ok: true, name: "生产" });
	});
});
