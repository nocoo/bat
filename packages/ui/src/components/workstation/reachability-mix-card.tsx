// Reachability distribution for the latest report: a ring of how many
// authorized servers answered, and the counts behind it. This is a snapshot of
// the newest sample, not a claim about uptime over the window.

import { DonutChart } from "@nocoo/basalt/charts/donut";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import type { StatusSlice } from "@/lib/workstation-detail";

export function ReachabilityMixCard({
	slices,
	targets,
}: {
	slices: readonly StatusSlice[];
	targets: number;
}) {
	return (
		<LayerCard>
			<LayerCard.Header>
				<h2>Latest result</h2>
			</LayerCard.Header>
			<LayerCard.Body className="space-y-basalt-space-md">
				{slices.length === 0 ? (
					<p className="text-basalt-sm text-basalt-muted-foreground">
						No connectivity targets in the latest report.
					</p>
				) : (
					<>
						<DonutChart
							data={slices.map((slice) => ({ name: slice.name, value: slice.value }))}
							series={slices.map((slice) => ({
								key: slice.name,
								label: slice.name,
								color: slice.color,
							}))}
							ariaLabel={`Reachability of ${targets} servers`}
							className="h-36 w-full"
							showLegend={false}
							summary={`${targets} authorized servers in the newest report.`}
						/>
						<ul className="space-y-basalt-space-xs">
							{slices.map((slice) => (
								<li
									key={slice.name}
									className="flex items-center justify-between gap-basalt-space-md text-basalt-sm"
								>
									<span className="flex items-center gap-basalt-space-md">
										<span
											aria-hidden="true"
											className="size-2 shrink-0 rounded-basalt-full"
											style={{ backgroundColor: slice.color }}
										/>
										{slice.name}
									</span>
									<span className="font-mono tabular-nums text-basalt-muted-foreground">
										{slice.value}/{targets}
									</span>
								</li>
							))}
						</ul>
					</>
				)}
			</LayerCard.Body>
		</LayerCard>
	);
}
