import type { MetricsDataPoint } from "@bat/shared";
import { LayerCard } from "@nocoo/basalt";
import { DonutChart } from "@nocoo/basalt/charts/donut";
import { HardDrive } from "lucide-react";
import { useMemo } from "react";
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
			<div className="flex flex-wrap gap-basalt-layout">
				{disks.map((disk) => {
					const usedColor =
						disk.used_pct > 90
							? "var(--basalt-destructive)"
							: disk.used_pct > 80
								? "var(--basalt-warning)"
								: "var(--basalt-primary)";
					const usedBytes =
						disk.total_bytes > 0 ? Math.max(disk.total_bytes - disk.avail_bytes, 0) : disk.used_pct;
					const freeBytes = disk.total_bytes > 0 ? disk.avail_bytes : 100 - disk.used_pct;
					const primaryMount = disk.mounts[0] ?? disk.key;
					return (
						<div
							key={disk.key}
							data-testid="disk-donut"
							className="flex min-w-[8.5rem] flex-1 basis-[calc(50%-0.5rem)] flex-col items-center text-center"
						>
							<DonutChart
								ariaLabel={`${primaryMount} disk usage`}
								className="h-basalt-36 w-basalt-36"
								data={[
									{ name: "Used", value: usedBytes },
									{ name: "Free", value: freeBytes },
								]}
								series={[
									{ key: "Used", label: "Used", color: usedColor },
									{ key: "Free", label: "Free", color: "var(--basalt-muted)" },
								]}
								valueFormatter={(value) =>
									disk.total_bytes > 0 ? formatBytes(value) : `${value.toFixed(1)}%`
								}
								summary={`${disk.used_pct.toFixed(1)}% used, ${formatBytes(disk.avail_bytes)} free across ${disk.mounts.join(", ")}`}
								accessibilityLayer={false}
							/>
							<p className="mt-basalt-space-xs text-basalt-base tabular-nums">
								{disk.used_pct.toFixed(1)}% used
							</p>
							<p className="text-basalt-xs text-basalt-muted-foreground tabular-nums">
								{formatBytes(disk.avail_bytes)} free
							</p>
							<div className="mt-basalt-space-xs space-y-0 text-basalt-xs">
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
