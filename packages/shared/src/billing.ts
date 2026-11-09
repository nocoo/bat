// @bat/shared — per-host billing derivation (CNY).
//
// A host carries three manual inputs: the amount paid for the current period,
// the date of that payment and the next payment / expiry date. Everything the
// dashboard shows (period length, daily cost, renewal countdown) is derived
// from those three, so the Worker and the UI can never disagree.
//
// Dates are calendar dates (`YYYY-MM-DD`), not instants. They are parsed as
// UTC midnight, so a countdown never shifts with the reader's time zone and a
// period is always a whole number of days.

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** The billing inputs a host stores, all three set or all three null. */
export interface BillingFields {
	/** Amount paid for the current period, in yuan. */
	cost_amount_cny: number | null;
	/** Last payment date (`YYYY-MM-DD`). */
	paid_at: string | null;
	/** Next payment / expiry date (`YYYY-MM-DD`). */
	renews_at: string | null;
}

/**
 * Parse a `YYYY-MM-DD` calendar date into UTC midnight.
 * Returns null for anything that is not a real calendar day
 * (`2026-02-30`, `2026-13-01`, `20260101`, …).
 */
export function parseCalendarDate(value: string | null | undefined): number | null {
	if (typeof value !== "string") return null;
	const match = CALENDAR_DATE.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const timestamp = Date.UTC(year, month - 1, day);
	const date = new Date(timestamp);
	// Years below 100 are mapped into the 1900s by Date.UTC — restore them.
	if (year >= 0 && year < 100) date.setUTCFullYear(year);
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return date.getTime();
}

/**
 * Whole calendar days between the payment date and the renewal date.
 * Null when either date is missing or when the renewal precedes the payment.
 * The same day yields 0 — a zero-length period, not a usable one.
 */
export function billingPeriodDays(
	paidAt: string | null | undefined,
	renewsAt: string | null | undefined,
): number | null {
	const paid = parseCalendarDate(paidAt);
	const renews = parseCalendarDate(renewsAt);
	if (paid === null || renews === null) return null;
	const days = (renews - paid) / MS_PER_DAY;
	if (days < 0) return null;
	return days;
}

/**
 * Amount per day for the current period.
 * Null when the amount is missing or the period is not positive.
 * The raw quotient is returned — rounding happens at the display edge.
 */
export function dailyCostCny(
	amount: number | null | undefined,
	paidAt: string | null | undefined,
	renewsAt: string | null | undefined,
): number | null {
	if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
	const days = billingPeriodDays(paidAt, renewsAt);
	if (days === null || days <= 0) return null;
	return amount / days;
}

/**
 * Whole calendar days from `today` to the renewal date.
 * Negative when the renewal is overdue, 0 on the day itself.
 */
export function daysUntilRenewal(
	renewsAt: string | null | undefined,
	today: string | null | undefined,
): number | null {
	const renews = parseCalendarDate(renewsAt);
	const day = parseCalendarDate(today);
	if (renews === null || day === null) return null;
	return (renews - day) / MS_PER_DAY;
}

/** How urgent a renewal is — drives the destructive / warning / muted colours. */
export type RenewalTone = "muted" | "warning" | "overdue";

/** A renewal inside a week is a warning; an overdue one is destructive. */
export function renewalTone(days: number | null): RenewalTone {
	if (days === null) return "muted";
	if (days < 0) return "overdue";
	if (days <= 7) return "warning";
	return "muted";
}

/** Countdown for the detail card: `112 天`, `今天到期`, `已过期 3 天`. */
export function renewalCountdownLabel(days: number | null): string | null {
	if (days === null) return null;
	if (days < 0) return `已过期 ${-days} 天`;
	if (days === 0) return "今天到期";
	return `${days} 天`;
}

/** Countdown badge for the host list: `剩 112 天`, `今天到期`, `已过期 3 天`. */
export function renewalBadgeLabel(days: number | null): string | null {
	if (days === null) return null;
	if (days < 0) return `已过期 ${-days} 天`;
	if (days === 0) return "今天到期";
	return `剩 ${days} 天`;
}

/** Days in an average year — the bridge from a daily rate to a monthly one. */
export const DAYS_PER_YEAR = 365.25;

/** Monthly equivalent of a daily rate: `daily × 365.25 / 12`. */
export function monthlyEquivalentCny(dailyCny: number): number {
	return (dailyCny * DAYS_PER_YEAR) / 12;
}

/** A number with at most two decimal places. */
function hasAtMostTwoDecimals(value: number): boolean {
	const scaled = value * 100;
	return Math.abs(scaled - Math.round(scaled)) < 1e-9;
}

export type BillingValidation = { ok: true; value: BillingFields } | { ok: false; error: string };

const BILLING_KEYS = ["cost_amount_cny", "paid_at", "renews_at"] as const;

/**
 * Validate the body of `PATCH /api/hosts/:id/billing`.
 *
 * The three fields are all-or-nothing: either every one of them is null
 * (billing cleared) or every one of them carries a value. Amounts are finite,
 * non-negative and carry at most two decimals; dates are real calendar days
 * and the renewal date falls strictly after the payment date.
 */
export function validateBillingInput(body: unknown): BillingValidation {
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return { ok: false, error: "Request body must be a JSON object" };
	}
	const record = body as Record<string, unknown>;
	for (const key of BILLING_KEYS) {
		if (!(key in record)) {
			return { ok: false, error: `${key} is required` };
		}
	}
	const amount = record.cost_amount_cny;
	const paidAt = record.paid_at;
	const renewsAt = record.renews_at;
	const nullCount = [amount, paidAt, renewsAt].filter((value) => value === null).length;
	if (nullCount === BILLING_KEYS.length) {
		return { ok: true, value: { cost_amount_cny: null, paid_at: null, renews_at: null } };
	}
	if (nullCount > 0) {
		return {
			ok: false,
			error: "cost_amount_cny, paid_at and renews_at must all be set or all be null",
		};
	}
	if (
		typeof amount !== "number" ||
		!Number.isFinite(amount) ||
		amount < 0 ||
		!hasAtMostTwoDecimals(amount)
	) {
		return {
			ok: false,
			error: "cost_amount_cny must be a non-negative number with at most two decimals",
		};
	}
	if (typeof paidAt !== "string" || parseCalendarDate(paidAt) === null) {
		return { ok: false, error: "paid_at must be a YYYY-MM-DD calendar date" };
	}
	if (typeof renewsAt !== "string" || parseCalendarDate(renewsAt) === null) {
		return { ok: false, error: "renews_at must be a YYYY-MM-DD calendar date" };
	}
	if (renewsAt <= paidAt) {
		return { ok: false, error: "renews_at must be after paid_at" };
	}
	return { ok: true, value: { cost_amount_cny: amount, paid_at: paidAt, renews_at: renewsAt } };
}
