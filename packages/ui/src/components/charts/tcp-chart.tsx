import { chart, chartAxis } from "@/lib/palette";
import { getTimeFormatter, transformTcpData } from "@/lib/transforms";
import type { MetricsDataPoint } from "@bat/shared";
import { Cable } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, ChartEmptyState, ChartHeader, useMaintenanceAreas } from "./chart-primitives";
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
	maintenanceWindow,
}: {
	data: MetricsDataPoint[];
	rangeSeconds?: number;
	maintenanceWindow?: { start: string; end: string } | null;
}) {
	const chartData = useMemo(() => transformTcpData(data), [data]);
	const tickFormatter = getTimeFormatter(rangeSeconds);
	const mwAreas = useMaintenanceAreas(chartData, maintenanceWindow);

	if (chartData.length === 0) {
		return <ChartEmptyState message="No TCP connection data" />;
	}

	return (
		<ChartCard>
			<ChartHeader icon={Cable} title="TCP Connections" series={SERIES} />

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
					{mwAreas.map((area) => (
						<ReferenceArea
							key={`mw-${area.x1}`}
							x1={area.x1}
							x2={area.x2}
							fill="currentColor"
							fillOpacity={0.06}
							stroke="none"
							ifOverflow="hidden"
						/>
					))}
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
