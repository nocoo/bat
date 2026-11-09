// Billing formatting for the dashboard. Every number the UI shows about a
// host's cost comes from the shared derivation helpers — this file only
// decides how a number is written down.

import type { BillingFields, ContractFields, HostOverviewItem } from "@bat/shared";
import {
	billingPeriodDays,
	dailyCostCny,
	daysUntilRenewal,
	monthlyEquivalentCny,
	type RenewalTone,
	renewalCountdownLabel,
	renewalTone,
	validateBillingInput,
} from "@bat/shared";

/** Format an amount in yuan: `¥365.00`. */
export function formatCny(amount: number | null | undefined): string {
	if (amount === null || amount === undefined || !Number.isFinite(amount)) return "—";
	return `¥${amount.toLocaleString("zh-CN", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;
}

/** Today's calendar date in the reader's time zone (`YYYY-MM-DD`). */
export function todayCalendarDate(now: Date = new Date()): string {
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/** What the cost card and the list badge need about one host. */
export interface HostCostView {
	/** Days between the payment and the renewal. Null when unknown. */
	periodDays: number | null;
	/** Amount per day for the current period. Null when unknown. */
	dailyCny: number | null;
	/** Days left until the renewal — negative when overdue. */
	daysLeft: number | null;
	/** Countdown text for the detail card. Null when unknown. */
	label: string | null;
	/** How urgent the renewal is. */
	tone: RenewalTone;
}

/** Derive everything the UI shows about one host's billing. */
export function hostCostView(billing: BillingFields, today: string): HostCostView {
	const daysLeft = daysUntilRenewal(billing.renews_at, today);
	return {
		periodDays: billingPeriodDays(billing.paid_at, billing.renews_at),
		dailyCny: dailyCostCny(billing.cost_amount_cny, billing.paid_at, billing.renews_at),
		daysLeft,
		label: renewalCountdownLabel(daysLeft),
		tone: renewalTone(daysLeft),
	};
}

/** The fleet cost of the visible hosts. */
export interface FleetCostSummary {
	/** Hosts in the visible set. */
	totalHosts: number;
	/** Hosts that carry billing data. */
	pricedHosts: number;
	/** Sum of the daily rates of the priced hosts, in yuan. */
	dailyCny: number;
	/** Monthly equivalent of that daily total. */
	monthlyCny: number;
}

/**
 * Total the daily cost of the hosts that carry billing data.
 * Hosts without billing data contribute nothing and are not counted, so the
 * priced-host count keeps a partial number from reading as the whole fleet.
 */
export function fleetCostSummary(hosts: readonly HostOverviewItem[]): FleetCostSummary {
	let dailyCny = 0;
	let pricedHosts = 0;
	for (const host of hosts) {
		const rate = dailyCostCny(host.cost_amount_cny, host.paid_at, host.renews_at);
		if (rate === null) continue;
		dailyCny += rate;
		pricedHosts += 1;
	}
	return {
		totalHosts: hosts.length,
		pricedHosts,
		dailyCny,
		monthlyCny: monthlyEquivalentCny(dailyCny),
	};
}

/** Text colour for a renewal countdown: destructive when overdue, warning
 *  inside the last week, muted otherwise. */
export function renewalToneClass(tone: RenewalTone): string {
	if (tone === "overdue") return "text-basalt-destructive";
	if (tone === "warning") return "text-basalt-warning";
	return "text-basalt-muted-foreground";
}

/** The inputs of the edit form, as typed. The contract fields are
 *  independent: each one may be filled or empty on its own. */
export interface BillingDraft {
	amount: string;
	paidAt: string;
	renewsAt: string;
	bandwidth: string;
	trafficGb: string;
	resetDay: string;
}

export type BillingDraftResult =
	| { ok: true; value: BillingFields & ContractFields }
	| { ok: false; error: string };

/** The empty form clears every stored contract field. */
export function emptyBillingDraft(): BillingDraft {
	return { amount: "", paidAt: "", renewsAt: "", bandwidth: "", trafficGb: "", resetDay: "" };
}

/** The form draft of a host that already carries contract data. */
export function billingDraftFrom(fields: BillingFields & ContractFields): BillingDraft {
	return {
		amount: fields.cost_amount_cny === null ? "" : String(fields.cost_amount_cny),
		paidAt: fields.paid_at ?? "",
		renewsAt: fields.renews_at ?? "",
		bandwidth: fields.bandwidth_mbps === null ? "" : String(fields.bandwidth_mbps),
		trafficGb: fields.traffic_quota_gb === null ? "" : String(fields.traffic_quota_gb),
		resetDay: fields.traffic_reset_day === null ? "" : String(fields.traffic_reset_day),
	};
}

/** One optional counter field: empty means null, otherwise a whole number
 *  between 1 and `max`, as an operator-facing sentence on failure. */
function parseDraftCount(
	text: string,
	label: string,
	max: number,
): { ok: true; value: number | null } | { ok: false; error: string } {
	if (text === "") return { ok: true, value: null };
	const parsed = Number(text);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
		return {
			ok: false,
			error: `${label} must be a whole number between 1 and ${max.toLocaleString("en-US")}.`,
		};
	}
	return { ok: true, value: parsed };
}

/**
 * Validate the edit form. The amount/date rules live in the shared validator
 * — the form only translates them into operator-facing sentences — while the
 * three contract fields parse independently, so a host can carry a bandwidth
 * without a quota or a price.
 */
export function validateBillingDraft(draft: BillingDraft): BillingDraftResult {
	const amountText = draft.amount.trim();
	const paidAt = draft.paidAt.trim();
	const renewsAt = draft.renewsAt.trim();
	const bandwidthText = draft.bandwidth.trim();
	const trafficText = draft.trafficGb.trim();
	const resetDayText = draft.resetDay.trim();
	const trioEmpty = amountText === "" && paidAt === "" && renewsAt === "";
	if (!trioEmpty && (amountText === "" || paidAt === "" || renewsAt === "")) {
		return {
			ok: false,
			error: "Amount, last payment date and next payment date are all required.",
		};
	}
	const bandwidth = parseDraftCount(bandwidthText, "Bandwidth", 1_000_000);
	if (!bandwidth.ok) return bandwidth;
	const traffic = parseDraftCount(trafficText, "Traffic quota", 1_000_000);
	if (!traffic.ok) return traffic;
	const resetDay = parseDraftCount(resetDayText, "Reset day", 31);
	if (!resetDay.ok) return resetDay;
	const parsed = validateBillingInput({
		cost_amount_cny: trioEmpty ? null : Number(amountText),
		paid_at: trioEmpty ? null : paidAt,
		renews_at: trioEmpty ? null : renewsAt,
		bandwidth_mbps: bandwidth.value,
		traffic_quota_gb: traffic.value,
		traffic_reset_day: resetDay.value,
	});
	if (!parsed.ok) {
		return {
			ok: false,
			error: parsed.error.includes("cost_amount_cny")
				? "Amount must be a non-negative number with at most two decimals."
				: "Dates must be real YYYY-MM-DD days, and the next payment date must be after the last payment date.",
		};
	}
	return parsed;
}
