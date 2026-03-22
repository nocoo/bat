"use client";

import { chart, chartAxis } from "@/lib/palette";
import { getTimeFormatter, transformDiskIoData } from "@/lib/transforms";
import type { MetricsDataPoint } from "@bat/shared";
import { HardDrive } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { DashboardResponsiveContainer } from "./dashboard-responsive-container";
import { maintenanceAreas } from "./maintenance-overlay";

const SERIES = [
	{ key: "read_iops", label: "Read IOPS", color: chart.lime, width: 2 },
	{ key: "write_iops", label: "Write IOPS", color: chart.red, width: 2 },
	{ key: "io_util_pct", label: "Utilization %", color: chart.amber, width: 1.5 },
] as const;

export function DiskIoChart({
	data,
	resolution = "raw",
	rangeSeconds = 3600,
	maintenanceWindow,
}: {
	data: MetricsDataPoint[];
	resolution?: "raw" | "hourly";
	rangeSeconds?: number;
	maintenanceWindow?: { start: string; end: string } | null;
}) {
	const chartData = useMemo(() => transformDiskIoData(data, resolution), [data, resolution]);
	const tickFormatter = getTimeFormatter(rangeSeconds);

	const mwAreas = useMemo(() => {
		if (!maintenanceWindow || chartData.length === 0) {
			return [];
		}
		const from = chartData[0]?.ts ?? 0;
		const to = chartData[chartData.length - 1]?.ts ?? 0;
		return maintenanceAreas(maintenanceWindow.start, maintenanceWindow.end, from, to);
	}, [maintenanceWindow, chartData]);

	if (chartData.length === 0) {
		return (
			<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
				<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
					No disk I/O data
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
				<div className="flex items-center gap-2 text-base font-semibold">
					<HardDrive className="h-4 w-4" />
					Disk I/O
				</div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					{SERIES.map((s) => (
						<span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<span
								className="inline-block h-2 w-2 rounded-full"
								style={{ backgroundColor: s.color }}
							/>
							{s.label}
						</span>
					))}
				</div>
			</div>

			<DashboardResponsiveContainer width="100%" height={256}>
				<LineChart data={chartData}>
					<CartesianGrid stroke={chartAxis} strokeOpacity={0.15} vertical={false} />
					<XAxis
						dataKey="ts"
						tickFormatter={tickFormatter}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<YAxis axisLine={false} tickLine={false} tick={{ fill: chartAxis, fontSize: 11 }} />
					<Tooltip content={<ChartTooltip />} />
					{mwAreas.map((area) => (
						<ReferenceArea
							key={`mw-${area.x1}`}
							x1={area.x1}
							x2={area.x2}
							fill="currentColor"
							fillOpacity={0.06}
							stroke="none"
							ifOverflow="hidden"
						/>
					))}
					{SERIES.map((s) => (
						<Line
							key={s.key}
							type="monotone"
							dataKey={s.key}
							name={s.label}
							stroke={s.color}
							dot={false}
							strokeWidth={s.width}
							isAnimationActive={false}
						/>
					))}
				</LineChart>
			</DashboardResponsiveContainer>
		</div>
	);
}
