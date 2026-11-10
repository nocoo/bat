// The one line both list views end with: the total daily cost of the visible
// hosts, its monthly equivalent and the priced-host count that keeps a
// partial total from reading as the whole fleet. The numbers come from the
// shared derivation — this component only writes them down.

import type { HostOverviewItem } from "@bat/shared";
import { fleetCostSummary, formatCny } from "@/lib/billing-format";

export function FleetCostTotal({
	hosts,
	testId = "fleet-cost",
}: {
	hosts: readonly HostOverviewItem[];
	testId?: string;
}) {
	const summary = fleetCostSummary(hosts);
	const hasPriced = summary.pricedHosts > 0;
	return (
		<span
			className="flex w-full flex-wrap items-baseline justify-end gap-basalt-space-md text-basalt-sm text-basalt-muted-foreground"
			data-testid={testId}
		>
			<span className="font-mono tabular-nums">
				{hasPriced ? `${formatCny(summary.dailyCny)}/day` : "—"}
			</span>
			<span>{hasPriced ? `≈ ${formatCny(summary.monthlyCny)}/month` : "no billing data"}</span>
			<span className="whitespace-nowrap">
				{summary.pricedHosts} / {summary.totalHosts} hosts
			</span>
		</span>
	);
}
