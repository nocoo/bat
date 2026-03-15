"use client";

import { formatBytesRate, formatTime, transformNetData } from "@/lib/transforms";
import type { MetricsDataPoint, MetricsResolution } from "@bat/shared";
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

export function NetworkChart({
	data,
	resolution,
}: { data: MetricsDataPoint[]; resolution: MetricsResolution }) {
	const chartData = transformNetData(data, resolution);

	if (chartData.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
				No network data
			</div>
		);
	}

	return (
		<ResponsiveContainer width="100%" height={256}>
			<LineChart data={chartData}>
				<CartesianGrid strokeDasharray="3 3" className="stroke-border" />
				<XAxis dataKey="ts" tickFormatter={formatTime} className="text-xs" />
				<YAxis tickFormatter={formatBytesRate} className="text-xs" />
				<Tooltip
					labelFormatter={(label) => new Date(Number(label) * 1000).toLocaleString()}
					formatter={(value) => [formatBytesRate(Number(value))]}
				/>
				<Legend />
				<Line
					type="monotone"
					dataKey="rx_rate"
					name="Download"
					stroke="var(--chart-5)"
					dot={false}
					strokeWidth={2}
				/>
				<Line
					type="monotone"
					dataKey="tx_rate"
					name="Upload"
					stroke="var(--chart-6)"
					dot={false}
					strokeWidth={2}
				/>
			</LineChart>
		</ResponsiveContainer>
	);
}
