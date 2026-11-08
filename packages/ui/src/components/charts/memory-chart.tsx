import type { MetricsDataPoint } from "@bat/shared";
import { ALERT_THRESHOLDS } from "@bat/shared";
import { HardDrive } from "lucide-react";
import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { chart, chartAxis } from "@/lib/palette";
import { getTimeFormatter, transformMemData } from "@/lib/transforms";
import { ChartCard, ChartEmptyState, ChartHeader } from "./chart-primitives";
import { ChartTooltip } from "./chart-tooltip";
import { DashboardResponsiveContainer } from "./dashboard-responsive-container";

const GRADIENT_ID = "memoryGradient";

export function MemoryChart({
	data,
	rangeSeconds = 3600,
}: {
	data: MetricsDataPoint[];
	rangeSeconds?: number;
}) {
	const chartData = useMemo(() => transformMemData(data), [data]);
	const tickFormatter = getTimeFormatter(rangeSeconds);

	if (chartData.length === 0) {
		return <ChartEmptyState message="No memory data" />;
	}

	return (
		<ChartCard>
			<ChartHeader
				icon={HardDrive}
				title="Memory"
				series={[{ key: "used_pct", label: "Memory Used", color: chart.green }]}
				extraLegend={
					<span className="flex items-center gap-1.5 text-basalt-sm text-basalt-muted-foreground">
						<span
							className="inline-block h-2 w-2 rounded-[1px] border border-current opacity-50"
							style={{ borderColor: chart.teal }}
						/>
						Threshold
					</span>
				}
			/>

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
						isAnimationActive={false}
					/>
				</AreaChart>
			</DashboardResponsiveContainer>
		</ChartCard>
	);
}
