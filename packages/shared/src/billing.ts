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
 * The contract inputs a host stores next to its billing. Unlike the billing
 * trio they are independent: each one is set or null on its own, so a host
 * can carry a price but no bandwidth, or a quota without a reset day.
 */
export interface ContractFields {
	/** Port bandwidth as entered, in Mbps. */
	bandwidth_mbps: number | null;
	/** Monthly traffic allowance, in GB. */
	traffic_quota_gb: number | null;
	/** Calendar day of month the traffic counter resets (1–31). */
	traffic_reset_day: number | null;
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

export type BillingValidation =
	| { ok: true; value: BillingFields & ContractFields }
	| { ok: false; error: string };

const BILLING_KEYS = ["cost_amount_cny", "paid_at", "renews_at"] as const;
const CONTRACT_KEYS = ["bandwidth_mbps", "traffic_quota_gb", "traffic_reset_day"] as const;

/** Upper bound of the two counter fields: one million Mbps / GB. */
const CONTRACT_COUNT_MAX = 1_000_000;

/**
 * Validate the body of `PATCH /api/hosts/:id/billing`.
 *
 * The three billing fields are all-or-nothing: either every one of them is
 * null (billing cleared) or every one of them carries a value. Amounts are
 * finite, non-negative and carry at most two decimals; dates are real
 * calendar days and the renewal date falls strictly after the payment date.
 *
 * The three contract fields are optional and independent: a missing key
 * means null, and each present value must be a positive integer up to one
 * million (the reset day only up to 31). The route replaces the whole
 * contract, so a body without contract keys clears whatever was stored.
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
	const contract = validateContractFields(record);
	if (typeof contract === "string") {
		return { ok: false, error: contract };
	}
	const nullCount = [amount, paidAt, renewsAt].filter((value) => value === null).length;
	if (nullCount === BILLING_KEYS.length) {
		return {
			ok: true,
			value: { ...contract, cost_amount_cny: null, paid_at: null, renews_at: null },
		};
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
	return {
		ok: true,
		value: { ...contract, cost_amount_cny: amount, paid_at: paidAt, renews_at: renewsAt },
	};
}

/** Validate one optional contract counter: null (or missing), or a whole
 *  number inside `[1, max]` — never zero, never fractional. */
function validateContractCount(
	record: Record<string, unknown>,
	key: (typeof CONTRACT_KEYS)[number],
	max: number,
): number | null | string {
	if (!(key in record) || record[key] === null) return null;
	const value = record[key];
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return `${key} must be a whole number`;
	}
	if (!Number.isInteger(value)) {
		return `${key} must be a whole number, not a fraction`;
	}
	if (value < 1 || value > max) {
		return `${key} must be between 1 and ${max}`;
	}
	return value;
}

/**
 * Validate the three independent contract fields. A missing key reads as
 * null; every present value must be a positive integer (the reset day inside
 * 1–31, the counters up to one million).
 */
function validateContractFields(record: Record<string, unknown>): ContractFields | string {
	const bandwidth = validateContractCount(record, "bandwidth_mbps", CONTRACT_COUNT_MAX);
	if (typeof bandwidth === "string") return bandwidth;
	const quota = validateContractCount(record, "traffic_quota_gb", CONTRACT_COUNT_MAX);
	if (typeof quota === "string") return quota;
	const resetDay = validateContractCount(record, "traffic_reset_day", 31);
	if (typeof resetDay === "string") return resetDay;
	return {
		bandwidth_mbps: bandwidth,
		traffic_quota_gb: quota,
		traffic_reset_day: resetDay,
	};
}

/**
 * Bandwidth as the reader expects it: below one gigabit the Mbps figure
 * stands (`500 Mbps`); from 1000 up it becomes gigabits with a single
 * decimal at most and no trailing `.0` (`1 Gbps`, `2.5 Gbps`).
 */
export function formatBandwidthMbps(mbps: number | null | undefined): string | null {
	if (mbps === null || mbps === undefined || !Number.isFinite(mbps)) return null;
	if (mbps < 1000) return `${mbps} Mbps`;
	const gbps = mbps / 1000;
	if (Number.isInteger(gbps)) return `${gbps} Gbps`;
	return `${Math.round(gbps * 10) / 10} Gbps`;
}

/** The monthly traffic allowance exactly as entered: `500 GB`, `1000 GB`. */
export function formatTrafficQuotaGb(gb: number | null | undefined): string | null {
	if (gb === null || gb === undefined || !Number.isFinite(gb)) return null;
	return `${gb} GB`;
}

/**
 * The day the traffic counter resets, in the dashboard's calendar words:
 * `每月 1 日`. The countdown labels are Chinese, so the contract day speaks
 * the same language everywhere it appears.
 */
export function formatResetDayCompact(day: number | null | undefined): string | null {
	if (day === null || day === undefined || !Number.isInteger(day)) return null;
	return `每月 ${day} 日`;
}

/** The reset-day sentence of the contract card: `每月 1 日重置`. */
export function formatResetDay(day: number | null | undefined): string | null {
	const compact = formatResetDayCompact(day);
	return compact === null ? null : `${compact}重置`;
}

/** The monthly traffic allowance with its period: `500 GB/月`. */
export function formatMonthlyTrafficGb(gb: number | null | undefined): string | null {
	const quota = formatTrafficQuotaGb(gb);
	return quota === null ? null : `${quota}/月`;
}
