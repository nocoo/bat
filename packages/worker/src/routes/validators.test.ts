import type { IdentityPayload, MetricsPayload, Tier2Payload } from "@bat/shared";
// Tests for body-validators + inventory update builders.
// These are exported from the route files so they can be tested as pure
// functions (no HTTP fixture needed).
import { describe, expect, test as it, test } from "vitest";
import { validateAllowedPortBody } from "./allowed-ports";
import { buildInventoryUpdate, validateIdentityPayload } from "./identity";
import { validateMetricsPayload } from "./ingest";
import { validateMaintenanceBody } from "./maintenance";
import { validateTier2Payload } from "./tier2-ingest";

// --- validateIdentityPayload ---

const validIdentity: IdentityPayload = {
	host_id: "web-01",
	hostname: "web-01.example.com",
	os: "Debian 12",
	kernel: "6.1.0",
	arch: "x86_64",
	cpu_model: "AMD EPYC 7763",
	uptime_seconds: 12345,
	boot_time: 1_700_000_000,
} as IdentityPayload;

describe("validateIdentityPayload", () => {
	test("accepts a minimal valid payload", () => {
		expect(validateIdentityPayload({ ...validIdentity })).toBe(true);
	});

	test("accepts optional probe_version when it's a string", () => {
		expect(validateIdentityPayload({ ...validIdentity, probe_version: "0.6.0" })).toBe(true);
	});

	test("rejects non-objects", () => {
		expect(validateIdentityPayload(null)).toBe(false);
		expect(validateIdentityPayload("string")).toBe(false);
		expect(validateIdentityPayload(42)).toBe(false);
	});

	test("rejects empty host_id / hostname", () => {
		expect(validateIdentityPayload({ ...validIdentity, host_id: "" })).toBe(false);
		expect(validateIdentityPayload({ ...validIdentity, hostname: "" })).toBe(false);
	});

	test("rejects wrong field types", () => {
		expect(validateIdentityPayload({ ...validIdentity, uptime_seconds: "12" })).toBe(false);
		expect(validateIdentityPayload({ ...validIdentity, boot_time: null })).toBe(false);
		expect(validateIdentityPayload({ ...validIdentity, os: 123 })).toBe(false);
	});

	test("rejects non-string probe_version", () => {
		expect(validateIdentityPayload({ ...validIdentity, probe_version: 1 })).toBe(false);
	});
});

// --- buildInventoryUpdate ---

describe("buildInventoryUpdate", () => {
	test("returns empty clauses/values for an empty body", () => {
		expect(buildInventoryUpdate({})).toEqual({ clauses: [], values: [] });
	});

	test("emits clauses only for fields present in the body", () => {
		const { clauses, values } = buildInventoryUpdate({ cpu_logical: 8, virtualization: "kvm" });
		expect(clauses).toEqual(["cpu_logical = ?", "virtualization = ?"]);
		expect(values).toEqual([8, "kvm"]);
	});

	test("serializes net_interfaces / disks as JSON", () => {
		const ifaces = [{ name: "eth0" }];
		const disks = [{ name: "sda" }];
		const { clauses, values } = buildInventoryUpdate({ net_interfaces: ifaces, disks });
		expect(clauses).toEqual(["net_interfaces = ?", "disks = ?"]);
		expect(values).toEqual([JSON.stringify(ifaces), JSON.stringify(disks)]);
	});

	test("preserves null values (2-state semantics: key-present ≠ value-non-null)", () => {
		const { clauses, values } = buildInventoryUpdate({ public_ip: null });
		expect(clauses).toEqual(["public_ip = ?"]);
		expect(values).toEqual([null]);
	});

	test("all 9 inventory keys are handled", () => {
		const body = {
			cpu_logical: 1,
			cpu_physical: 1,
			mem_total_bytes: 1,
			swap_total_bytes: 1,
			virtualization: "",
			net_interfaces: [],
			disks: [],
			boot_mode: "",
			public_ip: "",
		};
		const { clauses } = buildInventoryUpdate(body);
		expect(clauses).toHaveLength(9);
	});
});

// --- validateMetricsPayload ---

const validMetrics: MetricsPayload = {
	host_id: "x",
	timestamp: 1,
	interval: 30,
	uptime_seconds: 1,
	cpu: {
		load1: 0,
		load5: 0,
		load15: 0,
		usage_pct: 0,
		iowait_pct: 0,
		steal_pct: 0,
		count: 1,
	},
	mem: { total_bytes: 1, available_bytes: 1, used_pct: 0 },
	swap: { total_bytes: 0, used_bytes: 0, used_pct: 0 },
	disk: [],
	net: [],
} as MetricsPayload;

describe("validateMetricsPayload", () => {
	test("accepts a minimal valid payload", () => {
		expect(validateMetricsPayload({ ...validMetrics })).toBe(true);
	});

	test("rejects null / non-object", () => {
		expect(validateMetricsPayload(null)).toBe(false);
		expect(validateMetricsPayload("x")).toBe(false);
	});

	test("rejects missing top-level scalars", () => {
		expect(validateMetricsPayload({ ...validMetrics, host_id: "" })).toBe(false);
		expect(validateMetricsPayload({ ...validMetrics, timestamp: "now" })).toBe(false);
		expect(validateMetricsPayload({ ...validMetrics, interval: null })).toBe(false);
	});

	test("rejects missing cpu / mem / swap groups", () => {
		expect(validateMetricsPayload({ ...validMetrics, cpu: null })).toBe(false);
		expect(validateMetricsPayload({ ...validMetrics, mem: null })).toBe(false);
		expect(validateMetricsPayload({ ...validMetrics, swap: null })).toBe(false);
	});

	test("rejects wrong types inside cpu group", () => {
		expect(
			validateMetricsPayload({ ...validMetrics, cpu: { ...validMetrics.cpu, usage_pct: "42" } }),
		).toBe(false);
	});
});

// --- validateTier2Payload ---

const validTier2: Tier2Payload = {
	host_id: "x",
	timestamp: 1,
} as Tier2Payload;

describe("validateTier2Payload", () => {
	test("accepts minimal valid payload", () => {
		expect(validateTier2Payload({ ...validTier2 })).toBe(true);
	});

	test("rejects non-objects and nulls", () => {
		expect(validateTier2Payload(null)).toBe(false);
		expect(validateTier2Payload([])).toBe(false);
	});

	test("rejects missing host_id or timestamp", () => {
		expect(validateTier2Payload({ host_id: "x" })).toBe(false);
		expect(validateTier2Payload({ timestamp: 1 })).toBe(false);
		expect(validateTier2Payload({ host_id: "", timestamp: 1 })).toBe(false);
	});
});

// --- validateAllowedPortBody ---

describe("validateAllowedPortBody", () => {
	test("accepts a valid port with a trimmed reason", () => {
		const out = validateAllowedPortBody({ port: 8080, reason: "  web  " });
		expect(out).toEqual({ ok: true, port: 8080, reason: "web" });
	});

	test("defaults reason to empty string when omitted or not a string", () => {
		expect(validateAllowedPortBody({ port: 22 })).toEqual({ ok: true, port: 22, reason: "" });
		expect(validateAllowedPortBody({ port: 22, reason: 42 })).toEqual({
			ok: true,
			port: 22,
			reason: "",
		});
	});

	test("rejects non-object bodies", () => {
		expect(validateAllowedPortBody(null)).toMatchObject({ ok: false });
		expect(validateAllowedPortBody("x")).toMatchObject({ ok: false });
		expect(validateAllowedPortBody(5)).toMatchObject({ ok: false });
	});

	test("rejects missing / non-integer / out-of-range ports", () => {
		expect(validateAllowedPortBody({})).toMatchObject({ ok: false });
		expect(validateAllowedPortBody({ port: "80" })).toMatchObject({ ok: false });
		expect(validateAllowedPortBody({ port: 80.5 })).toMatchObject({ ok: false });
		expect(validateAllowedPortBody({ port: 0 })).toMatchObject({ ok: false });
		expect(validateAllowedPortBody({ port: 65536 })).toMatchObject({ ok: false });
		expect(validateAllowedPortBody({ port: -1 })).toMatchObject({ ok: false });
	});

	test("accepts boundary ports 1 and 65535", () => {
		expect(validateAllowedPortBody({ port: 1 })).toMatchObject({ ok: true });
		expect(validateAllowedPortBody({ port: 65535 })).toMatchObject({ ok: true });
	});

	test("rejects reasons longer than 200 chars", () => {
		const long = "x".repeat(201);
		expect(validateAllowedPortBody({ port: 80, reason: long })).toMatchObject({ ok: false });
	});

	test("accepts a 200-char reason at the boundary", () => {
		const at = "y".repeat(200);
		expect(validateAllowedPortBody({ port: 80, reason: at })).toMatchObject({
			ok: true,
			reason: at,
		});
	});
});

// --- Tag body validators ---

import { validateTagCreateBody, validateTagUpdateBody } from "./tags";

describe("validateTagCreateBody", () => {
	test("accepts name and trims whitespace", () => {
		expect(validateTagCreateBody({ name: "  prod  " })).toEqual({
			ok: true,
			name: "prod",
			color: null,
		});
	});

	test("accepts explicit valid color index", () => {
		expect(validateTagCreateBody({ name: "db", color: 3 })).toEqual({
			ok: true,
			name: "db",
			color: 3,
		});
	});

	test("ignores out-of-range or non-numeric color and treats as unset", () => {
		expect(validateTagCreateBody({ name: "x", color: -1 })).toEqual({
			ok: true,
			name: "x",
			color: null,
		});
		expect(validateTagCreateBody({ name: "x", color: "red" })).toEqual({
			ok: true,
			name: "x",
			color: null,
		});
	});

	test("rejects missing / blank names", () => {
		expect(validateTagCreateBody({})).toMatchObject({ ok: false });
		expect(validateTagCreateBody({ name: "   " })).toMatchObject({ ok: false });
		expect(validateTagCreateBody({ name: 5 })).toMatchObject({ ok: false });
	});

	test("rejects non-object bodies", () => {
		expect(validateTagCreateBody(null)).toMatchObject({ ok: false });
		expect(validateTagCreateBody("nope")).toMatchObject({ ok: false });
	});

	test("rejects overly long names", () => {
		const long = "a".repeat(100);
		expect(validateTagCreateBody({ name: long })).toMatchObject({ ok: false });
	});
});

describe("validateTagUpdateBody", () => {
	test("accepts name-only update", () => {
		expect(validateTagUpdateBody({ name: "renamed" })).toEqual({
			ok: true,
			name: "renamed",
		});
	});

	test("accepts color-only update", () => {
		expect(validateTagUpdateBody({ color: 2 })).toEqual({ ok: true, color: 2 });
	});

	test("accepts both fields together", () => {
		expect(validateTagUpdateBody({ name: "x", color: 1 })).toEqual({
			ok: true,
			name: "x",
			color: 1,
		});
	});

	test("rejects blank / oversized name when provided", () => {
		expect(validateTagUpdateBody({ name: "" })).toMatchObject({ ok: false });
		expect(validateTagUpdateBody({ name: "a".repeat(100) })).toMatchObject({ ok: false });
	});

	test("rejects out-of-range or non-numeric color when provided", () => {
		expect(validateTagUpdateBody({ color: -1 })).toMatchObject({ ok: false });
		expect(validateTagUpdateBody({ color: 9999 })).toMatchObject({ ok: false });
		expect(validateTagUpdateBody({ color: "red" })).toMatchObject({ ok: false });
	});

	test("accepts empty object (caller handles 'nothing to update')", () => {
		expect(validateTagUpdateBody({})).toEqual({ ok: true });
	});

	test("rejects non-object bodies", () => {
		expect(validateTagUpdateBody(null)).toMatchObject({ ok: false });
	});
});

// --- groupPortsByHost ---

import { groupPortsByHost } from "./allowed-ports";

describe("groupPortsByHost", () => {
	test("returns an empty object for no rows", () => {
		expect(groupPortsByHost([])).toEqual({});
	});

	test("groups ports by host_id preserving input order", () => {
		const rows = [
			{ host_id: "web", port: 80 },
			{ host_id: "web", port: 443 },
			{ host_id: "db", port: 5432 },
		];
		expect(groupPortsByHost(rows)).toEqual({
			web: [80, 443],
			db: [5432],
		});
	});

	test("does not dedupe repeated ports (caller's responsibility)", () => {
		const rows = [
			{ host_id: "x", port: 22 },
			{ host_id: "x", port: 22 },
		];
		expect(groupPortsByHost(rows)).toEqual({ x: [22, 22] });
	});

	test("handles many hosts independently", () => {
		const rows = [
			{ host_id: "a", port: 1 },
			{ host_id: "b", port: 2 },
			{ host_id: "a", port: 3 },
			{ host_id: "c", port: 4 },
		];
		expect(groupPortsByHost(rows)).toEqual({
			a: [1, 3],
			b: [2],
			c: [4],
		});
	});
});

describe("validateMaintenanceBody", () => {
	it("accepts valid body with reason", () => {
		const r = validateMaintenanceBody({ start: "00:00", end: "06:30", reason: "backup" });
		expect(r).toEqual({ ok: true, value: { start: "00:00", end: "06:30", reason: "backup" } });
	});
	it("accepts valid body without reason (null default)", () => {
		const r = validateMaintenanceBody({ start: "09:00", end: "17:00" });
		expect(r).toEqual({ ok: true, value: { start: "09:00", end: "17:00", reason: null } });
	});
	it("rejects non-object body", () => {
		expect(validateMaintenanceBody(null)).toEqual({
			ok: false,
			error: "start and end are required",
		});
		expect(validateMaintenanceBody("x" as unknown)).toEqual({
			ok: false,
			error: "start and end are required",
		});
	});
	it("rejects missing start/end", () => {
		expect(validateMaintenanceBody({ start: "01:00" })).toEqual({
			ok: false,
			error: "start and end are required",
		});
		expect(validateMaintenanceBody({ end: "01:00" })).toEqual({
			ok: false,
			error: "start and end are required",
		});
		expect(validateMaintenanceBody({})).toEqual({
			ok: false,
			error: "start and end are required",
		});
	});
	it("rejects empty string start/end", () => {
		expect(validateMaintenanceBody({ start: "", end: "01:00" })).toEqual({
			ok: false,
			error: "start and end are required",
		});
	});
	it("rejects non-string start/end", () => {
		expect(validateMaintenanceBody({ start: 1, end: "01:00" })).toEqual({
			ok: false,
			error: "start and end are required",
		});
	});
	it("rejects invalid start time", () => {
		expect(validateMaintenanceBody({ start: "25:00", end: "01:00" })).toEqual({
			ok: false,
			error: "Invalid start time: 25:00",
		});
	});
	it("rejects invalid end time", () => {
		expect(validateMaintenanceBody({ start: "01:00", end: "bad" })).toEqual({
			ok: false,
			error: "Invalid end time: bad",
		});
	});
	it("rejects when start equals end", () => {
		expect(validateMaintenanceBody({ start: "02:00", end: "02:00" })).toEqual({
			ok: false,
			error: "start and end must be different",
		});
	});
	it("rejects non-string reason", () => {
		expect(validateMaintenanceBody({ start: "00:00", end: "01:00", reason: 5 })).toEqual({
			ok: false,
			error: "reason must be a string",
		});
	});
	it("rejects reason longer than 200 chars", () => {
		const reason = "x".repeat(201);
		expect(validateMaintenanceBody({ start: "00:00", end: "01:00", reason })).toEqual({
			ok: false,
			error: "reason must be 200 characters or fewer",
		});
	});
	it("accepts reason exactly 200 chars", () => {
		const reason = "x".repeat(200);
		const r = validateMaintenanceBody({ start: "00:00", end: "01:00", reason });
		expect(r.ok).toBe(true);
	});
	it("accepts empty-string reason (coerced to empty string, not null)", () => {
		const r = validateMaintenanceBody({ start: "00:00", end: "01:00", reason: "" });
		expect(r).toEqual({ ok: true, value: { start: "00:00", end: "01:00", reason: "" } });
	});
});

import {
	EVENT_BODY_MAX_BYTES,
	EVENT_TAGS_MAX_COUNT,
	EVENT_TAG_MAX_LENGTH,
	EVENT_TITLE_MAX_LENGTH,
} from "@bat/shared";
import { validateEventPayload } from "./events-ingest";

describe("validateEventPayload", () => {
	it("accepts minimal valid payload (no tags)", () => {
		const r = validateEventPayload({ title: "Hello", body: { k: 1 } });
		expect(r).toEqual({
			ok: true,
			title: "Hello",
			bodyStr: JSON.stringify({ k: 1 }),
			tags: [],
		});
	});
	it("accepts payload with tags", () => {
		const r = validateEventPayload({ title: "x", body: {}, tags: ["a", "b"] });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.tags).toEqual(["a", "b"]);
		}
	});
	it("rejects non-object body input", () => {
		expect(validateEventPayload(null)).toEqual({ ok: false, error: "Invalid payload" });
		expect(validateEventPayload("x")).toEqual({ ok: false, error: "Invalid payload" });
	});
	it("rejects missing title", () => {
		expect(validateEventPayload({ body: {} })).toEqual({
			ok: false,
			error: "title is required",
		});
	});
	it("rejects empty title", () => {
		expect(validateEventPayload({ title: "", body: {} })).toEqual({
			ok: false,
			error: "title is required",
		});
	});
	it("rejects non-string title", () => {
		expect(validateEventPayload({ title: 5, body: {} })).toEqual({
			ok: false,
			error: "title is required",
		});
	});
	it("rejects over-long title", () => {
		const title = "x".repeat(EVENT_TITLE_MAX_LENGTH + 1);
		expect(validateEventPayload({ title, body: {} })).toEqual({
			ok: false,
			error: `title must be at most ${EVENT_TITLE_MAX_LENGTH} characters`,
		});
	});
	it("accepts title at exactly max length", () => {
		const title = "x".repeat(EVENT_TITLE_MAX_LENGTH);
		expect(validateEventPayload({ title, body: {} }).ok).toBe(true);
	});
	it("rejects missing body", () => {
		expect(validateEventPayload({ title: "x" })).toEqual({
			ok: false,
			error: "body must be a JSON object",
		});
	});
	it("rejects array body", () => {
		expect(validateEventPayload({ title: "x", body: [1, 2] })).toEqual({
			ok: false,
			error: "body must be a JSON object",
		});
	});
	it("rejects non-object body", () => {
		expect(validateEventPayload({ title: "x", body: "str" })).toEqual({
			ok: false,
			error: "body must be a JSON object",
		});
	});
	it("rejects body over size limit", () => {
		const big = { data: "x".repeat(EVENT_BODY_MAX_BYTES) };
		expect(validateEventPayload({ title: "x", body: big })).toEqual({
			ok: false,
			error: `body must be at most ${EVENT_BODY_MAX_BYTES} bytes`,
		});
	});
	it("rejects non-array tags", () => {
		expect(validateEventPayload({ title: "x", body: {}, tags: "nope" })).toEqual({
			ok: false,
			error: "tags must be an array",
		});
	});
	it("rejects too many tags", () => {
		const tags = new Array(EVENT_TAGS_MAX_COUNT + 1).fill("a");
		expect(validateEventPayload({ title: "x", body: {}, tags })).toEqual({
			ok: false,
			error: `tags must have at most ${EVENT_TAGS_MAX_COUNT} items`,
		});
	});
	it("rejects empty tag", () => {
		expect(validateEventPayload({ title: "x", body: {}, tags: [""] })).toEqual({
			ok: false,
			error: `each tag must be a non-empty string of at most ${EVENT_TAG_MAX_LENGTH} chars`,
		});
	});
	it("rejects non-string tag", () => {
		expect(validateEventPayload({ title: "x", body: {}, tags: [1] })).toEqual({
			ok: false,
			error: `each tag must be a non-empty string of at most ${EVENT_TAG_MAX_LENGTH} chars`,
		});
	});
	it("rejects over-long tag", () => {
		const tag = "x".repeat(EVENT_TAG_MAX_LENGTH + 1);
		expect(validateEventPayload({ title: "x", body: {}, tags: [tag] })).toEqual({
			ok: false,
			error: `each tag must be a non-empty string of at most ${EVENT_TAG_MAX_LENGTH} chars`,
		});
	});
	it("accepts tag at exactly max length", () => {
		const tag = "x".repeat(EVENT_TAG_MAX_LENGTH);
		expect(validateEventPayload({ title: "x", body: {}, tags: [tag] }).ok).toBe(true);
	});
	it("accepts empty tags array", () => {
		const r = validateEventPayload({ title: "x", body: {}, tags: [] });
		expect(r).toEqual({ ok: true, title: "x", bodyStr: "{}", tags: [] });
	});
});

import { MAX_TAGS_PER_HOST } from "@bat/shared";
import { parseTagId, validateHostTagAddBody, validateHostTagReplaceBody } from "./tags";

describe("parseTagId", () => {
	it("parses integer", () => expect(parseTagId("7")).toBe(7));
	it("returns null for undefined/empty", () => {
		expect(parseTagId(undefined)).toBeNull();
		expect(parseTagId("")).toBeNull();
	});
	it("returns null for non-numeric", () => expect(parseTagId("abc")).toBeNull());
	it("accepts leading-integer strings", () => expect(parseTagId("3x")).toBe(3));
});

describe("validateHostTagAddBody", () => {
	it("accepts numeric tag_id", () =>
		expect(validateHostTagAddBody({ tag_id: 5 })).toEqual({ ok: true, tag_id: 5 }));
	it("rejects missing tag_id", () =>
		expect(validateHostTagAddBody({})).toEqual({ ok: false, error: "tag_id is required" }));
	it("rejects non-number tag_id", () =>
		expect(validateHostTagAddBody({ tag_id: "5" })).toEqual({
			ok: false,
			error: "tag_id is required",
		}));
	it("rejects non-object body", () =>
		expect(validateHostTagAddBody(null)).toEqual({ ok: false, error: "Invalid payload" }));
});

describe("validateHostTagReplaceBody", () => {
	it("accepts array of ids", () => {
		const r = validateHostTagReplaceBody({ tag_ids: [1, 2, 3] });
		expect(r).toEqual({ ok: true, tag_ids: [1, 2, 3] });
	});
	it("accepts empty array", () => {
		const r = validateHostTagReplaceBody({ tag_ids: [] });
		expect(r).toEqual({ ok: true, tag_ids: [] });
	});
	it("rejects non-array", () =>
		expect(validateHostTagReplaceBody({ tag_ids: "x" })).toEqual({
			ok: false,
			error: "tag_ids array is required",
		}));
	it("rejects missing field", () =>
		expect(validateHostTagReplaceBody({})).toEqual({
			ok: false,
			error: "tag_ids array is required",
		}));
	it("rejects too many tags", () => {
		const tag_ids = new Array(MAX_TAGS_PER_HOST + 1).fill(0).map((_, i) => i);
		expect(validateHostTagReplaceBody({ tag_ids })).toEqual({
			ok: false,
			error: `Maximum ${MAX_TAGS_PER_HOST} tags per host`,
		});
	});
	it("accepts exactly MAX tags", () => {
		const tag_ids = new Array(MAX_TAGS_PER_HOST).fill(0).map((_, i) => i);
		expect(validateHostTagReplaceBody({ tag_ids }).ok).toBe(true);
	});
	it("rejects non-object body", () =>
		expect(validateHostTagReplaceBody(null)).toEqual({
			ok: false,
			error: "Invalid payload",
		}));
});

import { parsePortParam } from "./allowed-ports";

describe("parsePortParam", () => {
	it("parses valid port numbers", () => {
		expect(parsePortParam("80")).toBe(80);
		expect(parsePortParam("1")).toBe(1);
		expect(parsePortParam("65535")).toBe(65535);
	});
	it("returns null for undefined / empty", () => {
		expect(parsePortParam(undefined)).toBeNull();
		expect(parsePortParam("")).toBeNull();
	});
	it("returns null for non-numeric", () => {
		expect(parsePortParam("abc")).toBeNull();
	});
	// Wire-contract invariant: DELETE /api/hosts/:id/allowed-ports/:port
	// rejects only non-integer params with 400. Out-of-range integers
	// (0, negative, >65535) must pass through so the DELETE falls through
	// to its usual 404 "Port not found in allowlist" response. Tightening
	// the range here would be a wire-visible behaviour change.
	it("passes through out-of-range integers (preserves 404 fall-through)", () => {
		expect(parsePortParam("0")).toBe(0);
		expect(parsePortParam("65536")).toBe(65536);
		expect(parsePortParam("-1")).toBe(-1);
		expect(parsePortParam("999999")).toBe(999999);
	});
});
