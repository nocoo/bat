import type { MetricsDataPoint } from "@bat/shared";
import { Cpu } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { chart, chartAxis } from "@/lib/palette";
import { getTimeFormatter, transformCpuData } from "@/lib/transforms";
import { ChartCard, ChartEmptyState, ChartHeader } from "./chart-primitives";
import { ChartTooltip } from "./chart-tooltip";
import { DashboardResponsiveContainer } from "./dashboard-responsive-container";

const SERIES = [
	{ key: "usage", label: "CPU Usage", color: chart.pink, width: 2 },
	{ key: "iowait", label: "IO Wait", color: chart.sky, width: 1.5 },
	{ key: "steal", label: "Steal", color: chart.teal, width: 1.5 },
] as const;

export function CpuChart({
	data,
	rangeSeconds = 3600,
}: {
	data: MetricsDataPoint[];
	rangeSeconds?: number;
}) {
	const chartData = useMemo(() => transformCpuData(data), [data]);
	const tickFormatter = getTimeFormatter(rangeSeconds);

	if (chartData.length === 0) {
		return <ChartEmptyState message="No CPU data" />;
	}

	return (
		<ChartCard>
			<ChartHeader icon={Cpu} title="CPU" series={SERIES} />

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
					<YAxis
						domain={[0, 100]}
						allowDataOverflow
						tickFormatter={(v: number) => `${v}%`}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<Tooltip content={<ChartTooltip />} />
					{SERIES.map((s) => (
						<Area
							key={s.key}
							stackId="cpu"
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
