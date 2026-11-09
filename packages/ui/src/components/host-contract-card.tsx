// The Contract card of the host detail page: what the host costs per day,
// how long the current period runs, and the network contract — bandwidth,
// monthly traffic allowance and the day the counter resets. Six manual
// inputs (the price/date trio plus the three contract fields); everything
// else is derived. Editing follows the inline description pattern: one
// form, one save, one error line.

import type { BillingFields, ContractFields } from "@bat/shared";
import { formatBandwidthMbps, formatResetDay, formatTrafficQuotaGb } from "@bat/shared";
import { Button, Field, Input } from "@nocoo/basalt";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { Pencil, Wallet } from "lucide-react";
import { type FormEvent, useCallback, useState } from "react";
import { patchAPI } from "@/api";
import {
	type BillingDraft,
	billingDraftFrom,
	emptyBillingDraft,
	formatCny,
	hostCostView,
	todayCalendarDate,
	validateBillingDraft,
} from "@/lib/billing-format";

function ContractRow({
	label,
	value,
	valueTestId,
}: {
	label: string;
	value: string;
	valueTestId?: string;
}) {
	return (
		<div className="flex justify-between gap-basalt-space-sm text-basalt-base">
			<span className="shrink-0 text-basalt-muted-foreground">{label}</span>
			<span
				className="min-w-0 truncate text-right font-mono tabular-nums"
				data-testid={valueTestId}
			>
				{value}
			</span>
		</div>
	);
}

export function HostContractCard({
	hid,
	billing,
	onSaved,
}: {
	hid: string;
	billing: BillingFields & ContractFields;
	onSaved: (billing: BillingFields & ContractFields) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState<BillingDraft>(() => billingDraftFrom(billing));
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	const view = hostCostView(billing, todayCalendarDate());
	const hasBilling = billing.renews_at !== null;
	const hasContract =
		billing.bandwidth_mbps !== null ||
		billing.traffic_quota_gb !== null ||
		billing.traffic_reset_day !== null;

	const startEditing = useCallback(() => {
		setDraft(billingDraftFrom(billing));
		setError(null);
		setEditing(true);
	}, [billing]);

	const submit = useCallback(
		async (event: FormEvent) => {
			event.preventDefault();
			const result = validateBillingDraft(draft);
			if (!result.ok) {
				setError(result.error);
				return;
			}
			setPending(true);
			setError(null);
			try {
				await patchAPI(`/api/hosts/${hid}/billing`, result.value);
				onSaved(result.value);
				setEditing(false);
			} catch {
				setError("Could not save the contract data.");
			} finally {
				setPending(false);
			}
		},
		[draft, hid, onSaved],
	);

	return (
		<LayerCard data-testid="host-contract-card">
			<LayerCard.Header>
				<h2 className="flex items-center gap-2">
					<Wallet className="h-4 w-4" />
					Contract
				</h2>
				{!editing && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={startEditing}
						aria-label={hasBilling ? "Edit contract" : "Record contract"}
					>
						<Pencil className="h-3.5 w-3.5" />
						{hasBilling ? "Edit" : "Record"}
					</Button>
				)}
			</LayerCard.Header>
			<LayerCard.Body>
				{editing ? (
					<form className="grid gap-basalt-space-md" onSubmit={submit} data-testid="contract-form">
						<Field label="Amount (¥)" htmlFor="cost-amount">
							<Input
								id="cost-amount"
								name="cost-amount"
								type="text"
								inputMode="decimal"
								placeholder="365.00"
								autoComplete="off"
								value={draft.amount}
								onChange={(event) =>
									setDraft((current) => ({ ...current, amount: event.target.value }))
								}
							/>
						</Field>
						<Field label="Last payment date" htmlFor="cost-paid-at">
							<Input
								id="cost-paid-at"
								name="cost-paid-at"
								type="date"
								value={draft.paidAt}
								onChange={(event) =>
									setDraft((current) => ({ ...current, paidAt: event.target.value }))
								}
							/>
						</Field>
						<Field label="Next payment date" htmlFor="cost-renews-at">
							<Input
								id="cost-renews-at"
								name="cost-renews-at"
								type="date"
								value={draft.renewsAt}
								onChange={(event) =>
									setDraft((current) => ({ ...current, renewsAt: event.target.value }))
								}
							/>
						</Field>
						<Field label="Bandwidth (Mbps)" htmlFor="contract-bandwidth">
							<Input
								id="contract-bandwidth"
								name="contract-bandwidth"
								type="text"
								inputMode="numeric"
								placeholder="500"
								autoComplete="off"
								value={draft.bandwidth}
								onChange={(event) =>
									setDraft((current) => ({ ...current, bandwidth: event.target.value }))
								}
							/>
						</Field>
						<Field label="Traffic quota (GB)" htmlFor="contract-traffic">
							<Input
								id="contract-traffic"
								name="contract-traffic"
								type="text"
								inputMode="numeric"
								placeholder="500"
								autoComplete="off"
								value={draft.trafficGb}
								onChange={(event) =>
									setDraft((current) => ({ ...current, trafficGb: event.target.value }))
								}
							/>
						</Field>
						<Field label="Traffic reset day (1-31)" htmlFor="contract-reset-day">
							<Input
								id="contract-reset-day"
								name="contract-reset-day"
								type="text"
								inputMode="numeric"
								placeholder="1"
								autoComplete="off"
								value={draft.resetDay}
								onChange={(event) =>
									setDraft((current) => ({ ...current, resetDay: event.target.value }))
								}
							/>
						</Field>
						{error && (
							<p className="text-basalt-sm text-basalt-destructive" role="alert">
								{error}
							</p>
						)}
						<div className="flex items-center gap-basalt-space-sm">
							<Button type="submit" size="sm" disabled={pending}>
								Save
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => {
									setDraft(emptyBillingDraft());
									setEditing(false);
									setError(null);
								}}
								disabled={pending}
							>
								Cancel
							</Button>
						</div>
					</form>
				) : hasBilling || hasContract ? (
					<div className="grid gap-basalt-space-sm">
						{hasBilling && (
							<>
								<p
									className={`text-basalt-2xl font-semibold tabular-nums ${
										view.tone === "overdue"
											? "text-basalt-destructive"
											: view.tone === "warning"
												? "text-basalt-warning"
												: "text-basalt-foreground"
									}`}
									data-testid="cost-countdown"
								>
									{view.label}
								</p>
								<div className="grid gap-y-basalt-space-sm">
									<ContractRow label="Amount" value={formatCny(billing.cost_amount_cny)} />
									<ContractRow
										label="Daily cost"
										value={view.dailyCny === null ? "—" : `${formatCny(view.dailyCny)}/day`}
									/>
									<ContractRow
										label="Period"
										value={view.periodDays === null ? "—" : `${view.periodDays} days`}
									/>
									<ContractRow label="Last payment" value={billing.paid_at ?? "—"} />
									<ContractRow label="Next payment" value={billing.renews_at ?? "—"} />
								</div>
							</>
						)}
						<div className="grid gap-y-basalt-space-sm">
							<ContractRow
								label="Bandwidth"
								value={formatBandwidthMbps(billing.bandwidth_mbps) ?? "—"}
								valueTestId="contract-bandwidth-value"
							/>
							<ContractRow
								label="Traffic quota"
								value={formatTrafficQuotaGb(billing.traffic_quota_gb) ?? "—"}
							/>
							<ContractRow
								label="Traffic reset"
								value={formatResetDay(billing.traffic_reset_day) ?? "—"}
								valueTestId="contract-reset-value"
							/>
						</div>
					</div>
				) : (
					<p className="text-basalt-sm text-basalt-muted-foreground">
						No contract recorded yet. Add the amount you paid, the payment dates, the bandwidth, the
						monthly traffic allowance and its reset day to see the daily cost, the countdown and the
						link terms.
					</p>
				)}
			</LayerCard.Body>
		</LayerCard>
	);
}
