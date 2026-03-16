"use client";

import { chart, chartAxis } from "@/lib/palette";
import { formatBytesRate, formatTime, transformNetData } from "@/lib/transforms";
import type { MetricsDataPoint, MetricsResolution } from "@bat/shared";
import { Globe } from "lucide-react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { DashboardResponsiveContainer } from "./dashboard-responsive-container";

const SERIES = [
	{ key: "rx_rate", label: "Download", color: chart.lime },
	{ key: "tx_rate", label: "Upload", color: chart.amber },
] as const;

export function NetworkChart({
	data,
	resolution,
}: { data: MetricsDataPoint[]; resolution: MetricsResolution }) {
	const chartData = transformNetData(data, resolution);

	if (chartData.length === 0) {
		return (
			<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
				<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
					No network data
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
			{/* Header: icon + title + legend */}
			<div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
				<div className="flex items-center gap-2 text-base font-semibold">
					<Globe className="h-4 w-4" />
					Network
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
						tickFormatter={formatTime}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<YAxis
						tickFormatter={formatBytesRate}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<Tooltip content={<ChartTooltip valueFormatter={(v) => formatBytesRate(v)} />} />
					{SERIES.map((s) => (
						<Line
							key={s.key}
							type="monotone"
							dataKey={s.key}
							name={s.label}
							stroke={s.color}
							dot={false}
							strokeWidth={2}
						/>
					))}
				</LineChart>
			</DashboardResponsiveContainer>
		</div>
	);
}
