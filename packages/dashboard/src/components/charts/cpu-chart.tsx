"use client";

import { formatTime } from "@/lib/transforms";
import { transformCpuData } from "@/lib/transforms";
import type { MetricsDataPoint } from "@bat/shared";
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

export function CpuChart({ data }: { data: MetricsDataPoint[] }) {
	const chartData = transformCpuData(data);

	if (chartData.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
				No CPU data
			</div>
		);
	}

	return (
		<ResponsiveContainer width="100%" height={256}>
			<LineChart data={chartData}>
				<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
				<XAxis dataKey="ts" tickFormatter={formatTime} className="text-xs" />
				<YAxis domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} className="text-xs" />
				<Tooltip
					labelFormatter={(label) => new Date(Number(label) * 1000).toLocaleString()}
					formatter={(value) => [`${Number(value).toFixed(1)}%`]}
				/>
				<Legend />
				<Line
					type="monotone"
					dataKey="usage"
					name="CPU Usage"
					stroke="var(--chart-1)"
					dot={false}
					strokeWidth={2}
				/>
				<Line
					type="monotone"
					dataKey="iowait"
					name="IO Wait"
					stroke="var(--chart-2)"
					dot={false}
					strokeWidth={1.5}
				/>
				<Line
					type="monotone"
					dataKey="steal"
					name="Steal"
					stroke="var(--chart-3)"
					dot={false}
					strokeWidth={1.5}
				/>
			</LineChart>
		</ResponsiveContainer>
	);
}
