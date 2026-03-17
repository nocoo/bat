"use client";

import { formatBytes, transformDiskData } from "@/lib/transforms";
import type { MetricsDataPoint } from "@bat/shared";
import { HardDrive } from "lucide-react";
import { useMemo } from "react";

export function DiskBars({ data }: { data: MetricsDataPoint[] }) {
	const disks = useMemo(() => transformDiskData(data), [data]);

	if (disks.length === 0) {
		return (
			<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
				<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
					No disk data
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
			<div className="mb-3 flex items-center gap-2 text-base font-semibold">
				<HardDrive className="h-4 w-4" />
				Disk Usage
			</div>
			<div className="space-y-3">
				{disks.map((disk) => (
					<div key={disk.mount} className="space-y-1">
						<div className="flex items-center justify-between text-sm">
							<span className="font-mono">{disk.mount}</span>
							<span className="text-muted-foreground">
								{disk.used_pct.toFixed(1)}% — {formatBytes(disk.avail_bytes)} free
							</span>
						</div>
						<div className="h-2 w-full rounded-full bg-muted">
							<div
								className={`h-full rounded-full transition-all ${
									disk.used_pct > 90
										? "bg-destructive"
										: disk.used_pct > 80
											? "bg-warning"
											: "bg-primary"
								}`}
								style={{ width: `${Math.min(disk.used_pct, 100)}%` }}
							/>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
