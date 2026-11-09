import { describe, expect, test } from "vitest";
import {
	billingDraftFrom,
	emptyBillingDraft,
	fleetCostSummary,
	formatCny,
	hostCostView,
	todayCalendarDate,
	validateBillingDraft,
} from "./billing-format";

describe("formatCny", () => {
	test("writes yuan with two decimals", () => {
		expect(formatCny(365)).toBe("¥365.00");
		expect(formatCny(88.5)).toBe("¥88.50");
		expect(formatCny(1234.5)).toBe("¥1,234.50");
		expect(formatCny(0)).toBe("¥0.00");
	});

	test("shows a dash for an unknown amount", () => {
		expect(formatCny(null)).toBe("—");
		expect(formatCny(undefined)).toBe("—");
		expect(formatCny(Number.NaN)).toBe("—");
	});
});

describe("todayCalendarDate", () => {
	test("writes the local calendar day", () => {
		expect(todayCalendarDate(new Date(2026, 2, 4))).toBe("2026-03-04");
		expect(todayCalendarDate(new Date(2026, 11, 31))).toBe("2026-12-31");
		expect(todayCalendarDate(new Date(2026, 0, 1))).toBe("2026-01-01");
	});
});

describe("hostCostView", () => {
	const billing = {
		cost_amount_cny: 365,
		paid_at: "2026-01-01",
		renews_at: "2027-01-01",
	};

	test("derives the period, the daily rate and the countdown", () => {
		const view = hostCostView(billing, "2026-09-21");
		expect(view.periodDays).toBe(365);
		expect(view.dailyCny).toBeCloseTo(1, 10);
		expect(view.daysLeft).toBe(102);
		expect(view.label).toBe("102 天");
		expect(view.tone).toBe("muted");
	});

	test("marks an overdue renewal", () => {
		const view = hostCostView(
			{ cost_amount_cny: 30, paid_at: "2026-01-01", renews_at: "2026-01-31" },
			"2026-02-03",
		);
		expect(view.daysLeft).toBe(-3);
		expect(view.label).toBe("已过期 3 天");
		expect(view.tone).toBe("overdue");
	});

	test("marks a renewal inside the week", () => {
		const view = hostCostView(billing, "2026-12-28");
		expect(view.daysLeft).toBe(4);
		expect(view.tone).toBe("warning");
	});

	test("has nothing to show without billing data", () => {
		const view = hostCostView(
			{ cost_amount_cny: null, paid_at: null, renews_at: null },
			"2026-09-21",
		);
		expect(view.periodDays).toBeNull();
		expect(view.dailyCny).toBeNull();
		expect(view.label).toBeNull();
	});
});

describe("fleetCostSummary", () => {
	const host = (over: Partial<Parameters<typeof fleetCostSummary>[0][number]>) =>
		({
			cost_amount_cny: null,
			paid_at: null,
			renews_at: null,
			...over,
		}) as Parameters<typeof fleetCostSummary>[0][number];

	test("totals the daily rate of the priced hosts only", () => {
		const summary = fleetCostSummary([
			host({ cost_amount_cny: 365, paid_at: "2026-01-01", renews_at: "2027-01-01" }),
			host({ cost_amount_cny: 60, paid_at: "2026-01-01", renews_at: "2026-01-31" }),
			host({}),
		]);
		expect(summary.pricedHosts).toBe(2);
		expect(summary.totalHosts).toBe(3);
		expect(summary.dailyCny).toBeCloseTo(1 + 2, 10);
		expect(summary.monthlyCny).toBeCloseTo((3 * 365.25) / 12, 10);
	});

	test("reports an empty fleet without a daily rate", () => {
		const summary = fleetCostSummary([]);
		expect(summary.pricedHosts).toBe(0);
		expect(summary.dailyCny).toBe(0);
		expect(summary.monthlyCny).toBe(0);
	});

	test("ignores a host whose period is not usable", () => {
		const summary = fleetCostSummary([
			host({ cost_amount_cny: 100, paid_at: "2026-01-01", renews_at: "2026-01-01" }),
		]);
		expect(summary.pricedHosts).toBe(0);
		expect(summary.dailyCny).toBe(0);
	});
});

describe("billing drafts", () => {
	test("an empty draft clears the billing data", () => {
		const result = validateBillingDraft(emptyBillingDraft());
		expect(result).toEqual({
			ok: true,
			value: { cost_amount_cny: null, paid_at: null, renews_at: null },
		});
	});

	test("a filled draft becomes the billing triple", () => {
		const result = validateBillingDraft({
			amount: "365",
			paidAt: "2026-01-01",
			renewsAt: "2027-01-01",
		});
		expect(result).toEqual({
			ok: true,
			value: { cost_amount_cny: 365, paid_at: "2026-01-01", renews_at: "2027-01-01" },
		});
	});

	test("a partial draft is refused", () => {
		const result = validateBillingDraft({
			amount: "365",
			paidAt: "2026-01-01",
			renewsAt: "",
		});
		expect(result.ok).toBe(false);
	});

	test("a negative amount is refused", () => {
		const result = validateBillingDraft({
			amount: "-1",
			paidAt: "2026-01-01",
			renewsAt: "2027-01-01",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("Amount");
	});

	test("an amount with three decimals is refused", () => {
		const result = validateBillingDraft({
			amount: "12.345",
			paidAt: "2026-01-01",
			renewsAt: "2027-01-01",
		});
		expect(result.ok).toBe(false);
	});

	test("a date that is not a calendar day is refused", () => {
		const result = validateBillingDraft({
			amount: "365",
			paidAt: "2026-02-30",
			renewsAt: "2027-01-01",
		});
		expect(result.ok).toBe(false);
	});

	test("a renewal before the payment is refused", () => {
		const result = validateBillingDraft({
			amount: "365",
			paidAt: "2026-01-01",
			renewsAt: "2025-12-31",
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.error).toContain("after the last payment date");
	});

	test("a stored triple becomes an editable draft", () => {
		expect(
			billingDraftFrom({
				cost_amount_cny: 365,
				paid_at: "2026-01-01",
				renews_at: "2027-01-01",
			}),
		).toEqual({ amount: "365", paidAt: "2026-01-01", renewsAt: "2027-01-01" });
		expect(billingDraftFrom({ cost_amount_cny: null, paid_at: null, renews_at: null })).toEqual({
			amount: "",
			paidAt: "",
			renewsAt: "",
		});
	});
});
