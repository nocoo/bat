"use client";

import { formatTime, transformMemData } from "@/lib/transforms";
import { ALERT_THRESHOLDS } from "@bat/shared";
import type { MetricsDataPoint } from "@bat/shared";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

export function MemoryChart({ data }: { data: MetricsDataPoint[] }) {
	const chartData = transformMemData(data);

	if (chartData.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
				No memory data
			</div>
		);
	}

	return (
		<ResponsiveContainer width="100%" height={256}>
			<AreaChart data={chartData}>
				<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
				<XAxis dataKey="ts" tickFormatter={formatTime} className="text-xs" />
				<YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} className="text-xs" />
				<Tooltip
					labelFormatter={(label) => new Date(Number(label) * 1000).toLocaleString()}
					formatter={(value) => [`${Number(value).toFixed(1)}%`]}
				/>
				<ReferenceLine
					y={ALERT_THRESHOLDS.MEM_HIGH_PCT}
					stroke="var(--chart-3)"
					strokeDasharray="5 5"
				/>
				<Area
					type="monotone"
					dataKey="used_pct"
					name="Memory Used"
					stroke="var(--chart-4)"
					fill="var(--chart-4)"
					fillOpacity={0.2}
					strokeWidth={2}
				/>
			</AreaChart>
		</ResponsiveContainer>
	);
}
