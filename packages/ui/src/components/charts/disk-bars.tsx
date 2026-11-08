import type { MetricsDataPoint } from "@bat/shared";
import { LayerCard } from "@nocoo/basalt";
import { DonutChart } from "@nocoo/basalt/charts/donut";
import { HardDrive } from "lucide-react";
import { useMemo } from "react";
import { chart, chartMuted } from "../../lib/palette";
import { formatBytes, transformDiskData } from "../../lib/transforms";

export function DiskBars({ data }: { data: MetricsDataPoint[] }) {
	const disks = useMemo(() => transformDiskData(data), [data]);

	if (disks.length === 0) {
		return (
			<LayerCard>
				<div className="flex h-32 items-center justify-center text-basalt-base text-basalt-muted-foreground">
					No disk data
				</div>
			</LayerCard>
		);
	}

	return (
		<LayerCard>
			<div className="mb-3 flex items-center gap-2 text-basalt-base font-medium">
				<HardDrive className="h-4 w-4" />
				Disk Usage
			</div>
			<div className="flex flex-wrap justify-center gap-x-3 gap-y-3">
				{disks.map((disk) => {
					// Chart palette hues carry the severity: primary → warning → destructive.
					const usedColor =
						disk.used_pct > 90 ? chart.red : disk.used_pct > 80 ? chart.orange : chart.sky;
					const usedBytes =
						disk.total_bytes > 0 ? Math.max(disk.total_bytes - disk.avail_bytes, 0) : disk.used_pct;
					const freeBytes = disk.total_bytes > 0 ? disk.avail_bytes : 100 - disk.used_pct;
					const primaryMount = disk.mounts[0] ?? disk.key;
					return (
						<div
							key={disk.key}
							data-testid="disk-donut"
							data-disk-device={disk.device ?? ""}
							className="flex w-24 min-w-0 flex-col items-center text-center"
						>
							<DonutChart
								ariaLabel={`${primaryMount} disk usage`}
								className="h-24 w-24"
								data={[
									{ name: "Used", value: usedBytes },
									{ name: "Free", value: freeBytes },
								]}
								series={[
									{ key: "Used", label: "Used", color: usedColor },
									{ key: "Free", label: "Free", color: chartMuted },
								]}
								valueFormatter={(value) =>
									disk.total_bytes > 0 ? formatBytes(value) : `${value.toFixed(1)}%`
								}
								accessibilityLayer={false}
							/>
							<p className="mt-1 text-basalt-xs font-medium tabular-nums">
								{disk.used_pct.toFixed(1)}% used
							</p>
							<p className="text-basalt-xs tabular-nums text-basalt-muted-foreground">
								{formatBytes(disk.avail_bytes)} free
							</p>
							{disk.device ? (
								<p className="truncate font-mono text-basalt-xs text-basalt-muted-foreground">
									{disk.device}
								</p>
							) : null}
							<div className="space-y-0 text-basalt-xs">
								{disk.mounts.map((mount) => (
									<p
										key={mount}
										className="truncate font-mono text-basalt-muted-foreground"
										title={mount}
									>
										{mount}
									</p>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</LayerCard>
	);
}
