import { describe, expect, test } from "vitest";
import {
	currentTzOffsetMinutes,
	describeLocalAsUtc,
	localHHMMToUtc,
	utcHHMMToLocal,
	validateWindow,
} from "./maintenance";

describe("localHHMMToUtc", () => {
	test("UTC+8 (Beijing): 09:00 local → 01:00 UTC", () => {
		expect(localHHMMToUtc("09:00", 480)).toBe("01:00");
	});
	test("UTC-5 (NYC): 21:30 local → 02:30 UTC (wraps next day)", () => {
		expect(localHHMMToUtc("21:30", -300)).toBe("02:30");
	});
	test("UTC+0: identity", () => {
		expect(localHHMMToUtc("13:45", 0)).toBe("13:45");
	});
	test("wraps around midnight forward: 23:30 +60 → 00:30", () => {
		expect(localHHMMToUtc("23:30", -60)).toBe("00:30");
	});
	test("invalid → returns input", () => {
		expect(localHHMMToUtc("nope", 0)).toBe("nope");
		expect(localHHMMToUtc("25:00", 0)).toBe("25:00");
	});
});

describe("utcHHMMToLocal", () => {
	test("inverse of local→utc", () => {
		expect(utcHHMMToLocal("01:00", 480)).toBe("09:00");
		expect(utcHHMMToLocal("02:30", -300)).toBe("21:30");
	});
});

describe("describeLocalAsUtc", () => {
	test("formats with UTC suffix", () => {
		expect(describeLocalAsUtc("09:00", 480)).toBe("01:00 UTC");
	});
});

describe("currentTzOffsetMinutes", () => {
	test("opposite sign of getTimezoneOffset", () => {
		const now = new Date();
		expect(currentTzOffsetMinutes(now)).toBe(-now.getTimezoneOffset());
	});
	test("defaults to current time without arg", () => {
		expect(typeof currentTzOffsetMinutes()).toBe("number");
	});
});

describe("validateWindow", () => {
	test("valid", () => {
		expect(validateWindow("01:00", "03:00", "weekly maint")).toEqual({ ok: true });
	});
	test("bad start", () => {
		const r = validateWindow("99:99", "03:00", "");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.field).toBe("start");
		}
	});
	test("bad end", () => {
		const r = validateWindow("01:00", "ab:cd", "");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.field).toBe("end");
		}
	});
	test("equal range", () => {
		const r = validateWindow("01:00", "01:00", "");
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.field).toBe("range");
		}
	});
	test("reason too long", () => {
		const r = validateWindow("01:00", "03:00", "x".repeat(201));
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.field).toBe("reason");
		}
	});
});
