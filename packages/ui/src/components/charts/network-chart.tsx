import type { MetricsDataPoint, MetricsResolution } from "@bat/shared";
import { Globe } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { chart, chartAxis } from "@/lib/palette";
import { formatBytesRate, getTimeFormatter, transformNetData } from "@/lib/transforms";
import { ChartCard, ChartEmptyState, ChartHeader } from "./chart-primitives";
import { ChartTooltip } from "./chart-tooltip";
import { DashboardResponsiveContainer } from "./dashboard-responsive-container";

const SERIES = [
	{ key: "rx_rate", label: "Inbound", color: chart.sky },
	{ key: "tx_rate", label: "Outbound", color: chart.orange },
] as const;

export function NetworkChart({
	data,
	resolution,
	rangeSeconds = 3600,
}: {
	data: MetricsDataPoint[];
	resolution: MetricsResolution;
	rangeSeconds?: number;
}) {
	const chartData = useMemo(() => transformNetData(data, resolution), [data, resolution]);
	const tickFormatter = getTimeFormatter(rangeSeconds);

	if (chartData.length === 0) {
		return <ChartEmptyState message="No network data" />;
	}

	return (
		<ChartCard>
			<ChartHeader icon={Globe} title="Network" series={SERIES} />

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
							isAnimationActive={false}
						/>
					))}
				</LineChart>
			</DashboardResponsiveContainer>
		</ChartCard>
	);
}
