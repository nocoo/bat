import type { MetricsDataPoint } from "@bat/shared";
import { Gauge } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { chart, chartAxis } from "@/lib/palette";
import { getTimeFormatter, transformPsiData } from "@/lib/transforms";
import { ChartCard, ChartEmptyState, ChartHeader } from "./chart-primitives";
import { ChartTooltip } from "./chart-tooltip";
import { DashboardResponsiveContainer } from "./dashboard-responsive-container";

const SERIES = [
	{ key: "cpu", label: "CPU", color: chart.purple, width: 2 },
	{ key: "memory", label: "Memory", color: chart.orange, width: 1.5 },
	{ key: "io", label: "I/O", color: chart.indigo, width: 1.5 },
] as const;

export function PsiChart({
	data,
	rangeSeconds = 3600,
}: {
	data: MetricsDataPoint[];
	rangeSeconds?: number;
}) {
	const chartData = useMemo(() => transformPsiData(data), [data]);
	const tickFormatter = getTimeFormatter(rangeSeconds);

	if (chartData.length === 0) {
		return <ChartEmptyState message="No PSI pressure data" />;
	}

	return (
		<ChartCard>
			<ChartHeader icon={Gauge} title="Pressure (PSI)" series={SERIES} />

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
						tickFormatter={(v: number) => `${v}%`}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
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
		</ChartCard>
	);
}
