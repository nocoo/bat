import type { MetricsDataPoint } from "@bat/shared";
import { LayerCard } from "@nocoo/basalt";
import { HardDrive } from "lucide-react";
import { useMemo } from "react";
import { formatBytes, transformDiskData } from "@/lib/transforms";

export function DiskBars({ data }: { data: MetricsDataPoint[] }) {
	const disks = useMemo(() => transformDiskData(data), [data]);

	if (disks.length === 0) {
		return (
			<LayerCard>
				<div className="flex items-center justify-center h-32 text-basalt-muted-foreground text-basalt-base">
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
			<div className="space-y-3">
				{disks.map((disk) => (
					<div key={disk.mount} className="space-y-1">
						<div className="flex items-center justify-between gap-3 text-basalt-base">
							<span className="font-mono truncate min-w-0" title={disk.mount}>
								{disk.mount}
							</span>
							<span className="text-basalt-muted-foreground tabular-nums shrink-0 whitespace-nowrap">
								{disk.used_pct.toFixed(1)}% — {formatBytes(disk.avail_bytes)} free
							</span>
						</div>
						<div className="h-2 w-full rounded-full bg-basalt-muted">
							<div
								className={`h-full rounded-full transition-all ${
									disk.used_pct > 90
										? "bg-basalt-destructive"
										: disk.used_pct > 80
											? "bg-basalt-warning"
											: "bg-basalt-primary"
								}`}
								style={{ width: `${Math.min(disk.used_pct, 100)}%` }}
							/>
						</div>
					</div>
				))}
			</div>
		</LayerCard>
	);
}
