"use client";

import { chart, chartAxis } from "@/lib/palette";
import { getTimeFormatter, transformTcpData } from "@/lib/transforms";
import type { MetricsDataPoint } from "@bat/shared";
import { Cable } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./chart-tooltip";
import { DashboardResponsiveContainer } from "./dashboard-responsive-container";

const SERIES = [
	{ key: "established", label: "Established", color: chart.green, width: 2 },
	{ key: "time_wait", label: "TIME_WAIT", color: chart.orange, width: 1.5 },
	{ key: "orphan", label: "Orphan", color: chart.red, width: 1.5 },
] as const;

export function TcpChart({
	data,
	rangeSeconds = 3600,
}: { data: MetricsDataPoint[]; rangeSeconds?: number }) {
	const chartData = useMemo(() => transformTcpData(data), [data]);
	const tickFormatter = getTimeFormatter(rangeSeconds);

	if (chartData.length === 0) {
		return (
			<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
				<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
					No TCP connection data
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
				<div className="flex items-center gap-2 text-base font-semibold">
					<Cable className="h-4 w-4" />
					TCP Connections
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
