import { describe, expect, test } from "vitest";
import {
	billingPeriodDays,
	dailyCostCny,
	daysUntilRenewal,
	formatBandwidthMbps,
	formatMonthlyTrafficGb,
	formatResetDayCompact,
	formatTrafficQuotaGb,
	monthlyEquivalentCny,
	parseCalendarDate,
	renewalBadgeLabel,
	renewalCountdownLabel,
	renewalTone,
	validateBillingInput,
} from "../billing";

describe("parseCalendarDate", () => {
	test("parses a calendar date as UTC midnight", () => {
		expect(parseCalendarDate("2026-03-04")).toBe(Date.UTC(2026, 2, 4));
	});

	test("rejects anything that is not a strict YYYY-MM-DD day", () => {
		for (const value of [
			"2026-3-4",
			"20260304",
			"2026-03-04T00:00:00Z",
			"2026-03-04 ",
			" 2026-03-04",
			"26-03-04",
			"",
			"today",
		]) {
			expect(parseCalendarDate(value)).toBeNull();
		}
	});

	test("rejects days that do not exist", () => {
		expect(parseCalendarDate("2026-02-30")).toBeNull();
		expect(parseCalendarDate("2026-13-01")).toBeNull();
		expect(parseCalendarDate("2026-00-10")).toBeNull();
		expect(parseCalendarDate("2026-04-31")).toBeNull();
	});

	test("accepts a leap day only in a leap year", () => {
		expect(parseCalendarDate("2024-02-29")).toBe(Date.UTC(2024, 1, 29));
		expect(parseCalendarDate("2026-02-29")).toBeNull();
	});

	test("rejects missing values", () => {
		expect(parseCalendarDate(null)).toBeNull();
		expect(parseCalendarDate(undefined)).toBeNull();
	});
});

describe("billingPeriodDays", () => {
	test("counts whole calendar days between payment and renewal", () => {
		expect(billingPeriodDays("2026-01-01", "2026-01-31")).toBe(30);
		expect(billingPeriodDays("2026-01-01", "2027-01-01")).toBe(365);
	});

	test("counts a leap day as one day", () => {
		expect(billingPeriodDays("2024-02-28", "2024-03-01")).toBe(2);
		expect(billingPeriodDays("2026-02-28", "2026-03-01")).toBe(1);
	});

	test("counts a month boundary", () => {
		expect(billingPeriodDays("2026-01-31", "2026-02-28")).toBe(28);
		expect(billingPeriodDays("2026-12-31", "2027-01-01")).toBe(1);
	});

	test("returns 0 for the same day", () => {
		expect(billingPeriodDays("2026-03-04", "2026-03-04")).toBe(0);
	});

	test("returns null when the order is wrong", () => {
		expect(billingPeriodDays("2026-03-05", "2026-03-04")).toBeNull();
	});

	test("returns null when a date is missing or invalid", () => {
		expect(billingPeriodDays(null, "2026-03-04")).toBeNull();
		expect(billingPeriodDays("2026-03-04", null)).toBeNull();
		expect(billingPeriodDays("2026-03-04", "2026-02-30")).toBeNull();
	});
});

describe("dailyCostCny", () => {
	test("divides the amount by the period length", () => {
		expect(dailyCostCny(300, "2026-01-01", "2026-01-31")).toBeCloseTo(10, 10);
		expect(dailyCostCny(365, "2026-01-01", "2027-01-01")).toBeCloseTo(1, 10);
	});

	test("keeps the raw quotient — rounding belongs to the display edge", () => {
		expect(dailyCostCny(100, "2026-01-01", "2026-01-04")).toBeCloseTo(33.333333, 5);
	});

	test("returns null when the period is not positive", () => {
		expect(dailyCostCny(100, "2026-01-01", "2026-01-01")).toBeNull();
		expect(dailyCostCny(100, "2026-01-05", "2026-01-01")).toBeNull();
	});

	test("returns null when the amount or the dates are missing", () => {
		expect(dailyCostCny(null, "2026-01-01", "2026-01-31")).toBeNull();
		expect(dailyCostCny(Number.NaN, "2026-01-01", "2026-01-31")).toBeNull();
		expect(dailyCostCny(100, null, "2026-01-31")).toBeNull();
	});
});

describe("daysUntilRenewal", () => {
	test("counts the days from today to the renewal", () => {
		expect(daysUntilRenewal("2026-03-04", "2026-01-01")).toBe(62);
		expect(daysUntilRenewal("2026-01-01", "2026-01-01")).toBe(0);
	});

	test("is negative when the renewal is overdue", () => {
		expect(daysUntilRenewal("2026-01-01", "2026-01-04")).toBe(-3);
	});

	test("crosses a month and a leap-day boundary", () => {
		expect(daysUntilRenewal("2026-03-01", "2026-02-28")).toBe(1);
		expect(daysUntilRenewal("2024-03-01", "2024-02-28")).toBe(2);
	});

	test("returns null when a date is missing or invalid", () => {
		expect(daysUntilRenewal(null, "2026-01-01")).toBeNull();
		expect(daysUntilRenewal("2026-01-01", "2026-02-30")).toBeNull();
	});
});

describe("countdown labels", () => {
	test("labels the remaining days", () => {
		expect(renewalCountdownLabel(112)).toBe("Renews in 112 days");
		expect(renewalBadgeLabel(112)).toBe("112d left");
	});

	test("labels the renewal day", () => {
		expect(renewalCountdownLabel(0)).toBe("Due today");
		expect(renewalBadgeLabel(0)).toBe("due today");
	});

	test("labels an overdue renewal", () => {
		expect(renewalCountdownLabel(-3)).toBe("Overdue by 3 days");
		expect(renewalBadgeLabel(-3)).toBe("3d overdue");
	});

	test("has no label without a countdown", () => {
		expect(renewalCountdownLabel(null)).toBeNull();
		expect(renewalBadgeLabel(null)).toBeNull();
	});

	test("marks overdue, near and calm renewals", () => {
		expect(renewalTone(-1)).toBe("overdue");
		expect(renewalTone(0)).toBe("warning");
		expect(renewalTone(7)).toBe("warning");
		expect(renewalTone(8)).toBe("muted");
		expect(renewalTone(null)).toBe("muted");
	});
});

describe("monthlyEquivalentCny", () => {
	test("converts a daily rate with a 365.25 day year", () => {
		expect(monthlyEquivalentCny(1)).toBeCloseTo(365.25 / 12, 10);
		expect(monthlyEquivalentCny(10)).toBeCloseTo(304.375, 10);
	});
});

describe("validateBillingInput", () => {
	const valid = {
		cost_amount_cny: 365,
		paid_at: "2026-01-01",
		renews_at: "2027-01-01",
	};
	const cleared = {
		bandwidth_mbps: null,
		traffic_quota_gb: null,
		traffic_reset_day: null,
	};

	test("accepts a complete billing triple", () => {
		const result = validateBillingInput(valid);
		expect(result).toEqual({ ok: true, value: { ...cleared, ...valid } });
	});

	test("accepts an all-null triple as a clear", () => {
		const result = validateBillingInput({
			cost_amount_cny: null,
			paid_at: null,
			renews_at: null,
		});
		expect(result).toEqual({
			ok: true,
			value: { ...cleared, cost_amount_cny: null, paid_at: null, renews_at: null },
		});
	});

	test("rejects a mixed null triple", () => {
		const result = validateBillingInput({ ...valid, renews_at: null });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("all be set or all be null");
	});

	test("rejects a missing field", () => {
		const result = validateBillingInput({ cost_amount_cny: 10, paid_at: "2026-01-01" });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("renews_at is required");
	});

	test("rejects a body that is not an object", () => {
		for (const body of [null, "billing", 42, []]) {
			const result = validateBillingInput(body);
			expect(result.ok).toBe(false);
		}
	});

	test("rejects a negative amount", () => {
		const result = validateBillingInput({ ...valid, cost_amount_cny: -1 });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("non-negative");
	});

	test("rejects a non-finite amount", () => {
		const result = validateBillingInput({ ...valid, cost_amount_cny: Number.POSITIVE_INFINITY });
		expect(result.ok).toBe(false);
	});

	test("rejects an amount with more than two decimals", () => {
		const result = validateBillingInput({ ...valid, cost_amount_cny: 12.345 });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("two decimals");
	});

	test("accepts an amount with two decimals", () => {
		const result = validateBillingInput({ ...valid, cost_amount_cny: 12.34 });
		expect(result.ok).toBe(true);
	});

	test("rejects a bad date", () => {
		for (const paid_at of ["2026-13-01", "2026-02-30", "2026-3-1", "20260301", ""]) {
			const result = validateBillingInput({ ...valid, paid_at });
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toContain("paid_at");
		}
	});

	test("rejects a renewal that is not after the payment", () => {
		const same = validateBillingInput({ ...valid, renews_at: "2026-01-01" });
		expect(same.ok).toBe(false);
		if (!same.ok) expect(same.error).toContain("renews_at must be after paid_at");

		const before = validateBillingInput({ ...valid, renews_at: "2025-12-31" });
		expect(before.ok).toBe(false);
	});

	test("rejects a non-string date", () => {
		const result = validateBillingInput({ ...valid, renews_at: 20270101 });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("renews_at");
	});
});

describe("validateBillingInput: contract fields", () => {
	const valid = {
		cost_amount_cny: 365,
		paid_at: "2026-01-01",
		renews_at: "2027-01-01",
	};

	test("accepts the three contract fields alongside the triple", () => {
		const result = validateBillingInput({
			...valid,
			bandwidth_mbps: 2500,
			traffic_quota_gb: 500,
			traffic_reset_day: 1,
		});
		expect(result).toEqual({
			ok: true,
			value: {
				...valid,
				bandwidth_mbps: 2500,
				traffic_quota_gb: 500,
				traffic_reset_day: 1,
			},
		});
	});

	test("accepts each contract field on its own — nulls elsewhere", () => {
		const result = validateBillingInput({ ...valid, bandwidth_mbps: 100 });
		expect(result).toEqual({
			ok: true,
			value: {
				...valid,
				bandwidth_mbps: 100,
				traffic_quota_gb: null,
				traffic_reset_day: null,
			},
		});
	});

	test("accepts a contract without any billing triple", () => {
		const result = validateBillingInput({
			cost_amount_cny: null,
			paid_at: null,
			renews_at: null,
			traffic_quota_gb: 1000,
		});
		expect(result).toEqual({
			ok: true,
			value: {
				cost_amount_cny: null,
				paid_at: null,
				renews_at: null,
				bandwidth_mbps: null,
				traffic_quota_gb: 1000,
				traffic_reset_day: null,
			},
		});
	});

	test("a missing contract key reads as null", () => {
		const result = validateBillingInput(valid);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.value.bandwidth_mbps).toBeNull();
			expect(result.value.traffic_quota_gb).toBeNull();
			expect(result.value.traffic_reset_day).toBeNull();
		}
	});

	test("rejects zero, negative and fractional counters", () => {
		for (const [key, value] of [
			["bandwidth_mbps", 0],
			["bandwidth_mbps", -100],
			["bandwidth_mbps", 100.5],
			["traffic_quota_gb", 0],
			["traffic_quota_gb", -1],
			["traffic_quota_gb", 0.5],
		] as const) {
			const result = validateBillingInput({ ...valid, [key]: value });
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toContain(key);
		}
	});

	test("rejects a counter above one million", () => {
		for (const [key, value] of [
			["bandwidth_mbps", 1_000_001],
			["traffic_quota_gb", 1_000_001],
		] as const) {
			const result = validateBillingInput({ ...valid, [key]: value });
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toContain(key);
		}
		const edge = validateBillingInput({ ...valid, bandwidth_mbps: 1_000_000 });
		expect(edge.ok).toBe(true);
	});

	test("rejects reset days outside the calendar", () => {
		for (const day of [0, 32, -1, 1.5]) {
			const result = validateBillingInput({ ...valid, traffic_reset_day: day });
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toContain("traffic_reset_day");
		}
		for (const day of [1, 15, 31]) {
			const result = validateBillingInput({ ...valid, traffic_reset_day: day });
			expect(result.ok).toBe(true);
		}
	});

	test("rejects a non-numeric counter", () => {
		for (const [key, value] of [
			["bandwidth_mbps", "500"],
			["traffic_quota_gb", "500"],
			["traffic_reset_day", "1"],
		] as const) {
			const result = validateBillingInput({ ...valid, [key]: value });
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.error).toContain(key);
		}
	});
});

describe("formatBandwidthMbps", () => {
	test("keeps Mbps below one gigabit", () => {
		expect(formatBandwidthMbps(100)).toBe("100 Mbps");
		expect(formatBandwidthMbps(999)).toBe("999 Mbps");
	});

	test("switches to gigabits at 1000 without a trailing .0", () => {
		expect(formatBandwidthMbps(1000)).toBe("1 Gbps");
		expect(formatBandwidthMbps(2500)).toBe("2.5 Gbps");
		expect(formatBandwidthMbps(5000)).toBe("5 Gbps");
		expect(formatBandwidthMbps(1234)).toBe("1.2 Gbps");
	});

	test("has nothing to say without a value", () => {
		expect(formatBandwidthMbps(null)).toBeNull();
		expect(formatBandwidthMbps(Number.NaN)).toBeNull();
	});
});

describe("formatTrafficQuotaGb", () => {
	test("shows the allowance exactly as entered", () => {
		expect(formatTrafficQuotaGb(500)).toBe("500 GB");
		expect(formatTrafficQuotaGb(1000)).toBe("1000 GB");
		expect(formatTrafficQuotaGb(2000)).toBe("2000 GB");
	});

	test("has nothing to say without a value", () => {
		expect(formatTrafficQuotaGb(null)).toBeNull();
	});
});

describe("reset-day labels", () => {
	test("the compact form names the day of month", () => {
		expect(formatResetDayCompact(1)).toBe("1st");
		expect(formatResetDayCompact(15)).toBe("15th");
		expect(formatResetDayCompact(28)).toBe("28th");
		expect(formatResetDayCompact(31)).toBe("31st");
		expect(formatResetDayCompact(null)).toBeNull();
	});
});

describe("formatMonthlyTrafficGb", () => {
	test("keeps the allowance and its period together", () => {
		expect(formatMonthlyTrafficGb(500)).toBe("500 GB/mo");
		expect(formatMonthlyTrafficGb(2000)).toBe("2000 GB/mo");
		expect(formatMonthlyTrafficGb(null)).toBeNull();
	});
});
