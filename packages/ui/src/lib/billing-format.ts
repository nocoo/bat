// Billing formatting for the dashboard. Every number the UI shows about a
// host's cost comes from the shared derivation helpers — this file only
// decides how a number is written down.

import type { BillingFields, HostOverviewItem } from "@bat/shared";
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

/** The three inputs of the edit form, as typed. */
export interface BillingDraft {
	amount: string;
	paidAt: string;
	renewsAt: string;
}

export type BillingDraftResult = { ok: true; value: BillingFields } | { ok: false; error: string };

/** The empty form clears the billing data of the host. */
export function emptyBillingDraft(): BillingDraft {
	return { amount: "", paidAt: "", renewsAt: "" };
}

/** The form draft of a host that already carries billing data. */
export function billingDraftFrom(fields: BillingFields): BillingDraft {
	return {
		amount: fields.cost_amount_cny === null ? "" : String(fields.cost_amount_cny),
		paidAt: fields.paid_at ?? "",
		renewsAt: fields.renews_at ?? "",
	};
}

/**
 * Validate the edit form. The rules live in the shared validator — the form
 * only translates them into an operator-facing sentence.
 */
export function validateBillingDraft(draft: BillingDraft): BillingDraftResult {
	const amountText = draft.amount.trim();
	const paidAt = draft.paidAt.trim();
	const renewsAt = draft.renewsAt.trim();
	if (amountText === "" && paidAt === "" && renewsAt === "") {
		return { ok: true, value: { cost_amount_cny: null, paid_at: null, renews_at: null } };
	}
	if (amountText === "" || paidAt === "" || renewsAt === "") {
		return {
			ok: false,
			error: "Amount, last payment date and next payment date are all required.",
		};
	}
	const parsed = validateBillingInput({
		cost_amount_cny: Number(amountText),
		paid_at: paidAt,
		renews_at: renewsAt,
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
