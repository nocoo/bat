import type { MetricsDataPoint } from "@bat/shared";
import { Cable } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { chart, chartAxis } from "@/lib/palette";
import { getTimeFormatter, transformTcpData } from "@/lib/transforms";
import { ChartCard, ChartEmptyState, ChartHeader } from "./chart-primitives";
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
}: {
	data: MetricsDataPoint[];
	rangeSeconds?: number;
}) {
	const chartData = useMemo(() => transformTcpData(data), [data]);
	const tickFormatter = getTimeFormatter(rangeSeconds);

	if (chartData.length === 0) {
		return <ChartEmptyState message="No TCP connection data" />;
	}

	return (
		<ChartCard>
			<ChartHeader icon={Cable} title="TCP Connections" series={SERIES} />

			<DashboardResponsiveContainer width="100%" height={256}>
				<AreaChart data={chartData}>
					<CartesianGrid stroke={chartAxis} strokeOpacity={0.15} vertical={false} />
					<XAxis
						dataKey="ts"
						tickFormatter={tickFormatter}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<YAxis axisLine={false} tickLine={false} tick={{ fill: chartAxis, fontSize: 11 }} />
					<Tooltip content={<ChartTooltip valueFormatter={(value) => value.toLocaleString()} />} />
					{SERIES.map((s) => (
						<Area
							key={s.key}
							stackId="tcp"
							type="monotone"
							dataKey={s.key}
							name={s.label}
							stroke={s.color}
							fill={s.color}
							fillOpacity={0.3}
							dot={false}
							strokeWidth={s.width}
							isAnimationActive={false}
						/>
					))}
				</AreaChart>
			</DashboardResponsiveContainer>
		</ChartCard>
	);
}
