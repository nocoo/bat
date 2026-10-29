import type { MetricsDataPoint } from "@bat/shared";
import { HardDrive } from "lucide-react";
import { useMemo } from "react";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Line,
	ReferenceArea,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { chart, chartAxis } from "@/lib/palette";
import { getTimeFormatter, transformDiskIoData } from "@/lib/transforms";
import { ChartCard, ChartEmptyState, ChartHeader, useMaintenanceAreas } from "./chart-primitives";
import { ChartTooltip } from "./chart-tooltip";
import { DashboardResponsiveContainer } from "./dashboard-responsive-container";

const SERIES = [
	{ key: "read_iops", label: "Read IOPS", color: chart.lime, width: 2 },
	{ key: "write_iops", label: "Write IOPS", color: chart.red, width: 2 },
	{ key: "io_util_pct", label: "Utilization %", color: chart.amber, width: 1.5 },
] as const;

export function DiskIoChart({
	data,
	resolution = "raw",
	rangeSeconds = 3600,
	maintenanceWindow,
}: {
	data: MetricsDataPoint[];
	resolution?: "raw" | "hourly";
	rangeSeconds?: number;
	maintenanceWindow?: { start: string; end: string } | null;
}) {
	const chartData = useMemo(() => transformDiskIoData(data, resolution), [data, resolution]);
	const tickFormatter = getTimeFormatter(rangeSeconds);
	const mwAreas = useMaintenanceAreas(chartData, maintenanceWindow);

	if (chartData.length === 0) {
		return <ChartEmptyState message="No disk I/O data" />;
	}

	return (
		<ChartCard>
			<ChartHeader icon={HardDrive} title="Disk I/O" series={SERIES} />

			<DashboardResponsiveContainer width="100%" height={256}>
				<ComposedChart data={chartData}>
					<CartesianGrid stroke={chartAxis} strokeOpacity={0.15} vertical={false} />
					<XAxis
						dataKey="ts"
						tickFormatter={tickFormatter}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<YAxis
						yAxisId="iops"
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<YAxis
						yAxisId="util"
						orientation="right"
						domain={[0, 100]}
						allowDataOverflow
						tickFormatter={(value: number) => `${value}%`}
						axisLine={false}
						tickLine={false}
						tick={{ fill: chartAxis, fontSize: 11 }}
					/>
					<Tooltip content={<ChartTooltip valueFormatter={(value) => value.toFixed(1)} />} />
					{mwAreas.map((area) => (
						<ReferenceArea
							key={`mw-${area.x1}`}
							yAxisId="iops"
							x1={area.x1}
							x2={area.x2}
							fill="currentColor"
							fillOpacity={0.06}
							stroke="none"
							ifOverflow="hidden"
						/>
					))}
					{SERIES.slice(0, 2).map((s) => (
						<Area
							key={s.key}
							stackId="iops"
							yAxisId="iops"
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
					<Line
						yAxisId="util"
						type="monotone"
						dataKey={SERIES[2].key}
						name={SERIES[2].label}
						stroke={SERIES[2].color}
						dot={false}
						strokeWidth={SERIES[2].width}
						isAnimationActive={false}
					/>
				</ComposedChart>
			</DashboardResponsiveContainer>
		</ChartCard>
	);
}
