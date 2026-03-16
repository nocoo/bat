"use client";

import { chart, chartAxis } from "@/lib/palette";
import { getTimeFormatter, transformMemData } from "@/lib/transforms";
import { ALERT_THRESHOLDS } from "@bat/shared";
import type { MetricsDataPoint } from "@bat/shared";
import { HardDrive } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { DashboardResponsiveContainer } from "./dashboard-responsive-container";

const GRADIENT_ID = "memoryGradient";

export function MemoryChart({
	data,
	rangeSeconds = 3600,
}: { data: MetricsDataPoint[]; rangeSeconds?: number }) {
	const chartData = transformMemData(data);
	const tickFormatter = getTimeFormatter(rangeSeconds);

	if (chartData.length === 0) {
		return (
			<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
				<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
					No memory data
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
			{/* Header: icon + title + legend */}
			<div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
				<div className="flex items-center gap-2 text-base font-semibold">
					<HardDrive className="h-4 w-4" />
					Memory
				</div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<span
							className="inline-block h-2 w-2 rounded-full"
							style={{ backgroundColor: chart.green }}
						/>
						Memory Used
					</span>
					<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<span
							className="inline-block h-2 w-2 rounded-[1px] border border-current opacity-50"
							style={{ borderColor: chart.teal }}
						/>
						Threshold
					</span>
				</div>
			</div>

			<DashboardResponsiveContainer width="100%" height={256}>
				<AreaChart data={chartData}>
					<defs>
						<linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={chart.green} stopOpacity={0.3} />
							<stop offset="100%" stopColor={chart.green} stopOpacity={0} />
						</linearGradient>
					</defs>
					<CartesianGrid stroke={chartAxis} strokeOpacity={0.15} vertical={false} />
					<XAxis
						dataKey="ts"
						tickFormatter={tickFormatter}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<YAxis
						domain={[0, 100]}
						tickFormatter={(v: number) => `${v}%`}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<Tooltip content={<ChartTooltip />} />
					<ReferenceLine
						y={ALERT_THRESHOLDS.MEM_HIGH_PCT}
						stroke={chart.teal}
						strokeDasharray="5 5"
						strokeOpacity={0.6}
					/>
					<Area
						type="monotone"
						dataKey="used_pct"
						name="Memory Used"
						stroke={chart.green}
						fill={`url(#${GRADIENT_ID})`}
						strokeWidth={2}
					/>
				</AreaChart>
			</DashboardResponsiveContainer>
		</div>
	);
}
