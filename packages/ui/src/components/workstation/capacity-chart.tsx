// Machine load over time. CPU and memory share one 0-100 % axis because they are
// the same unit; uptime rides a second axis in days, so a reboot is visible
// without pretending days and percent are comparable.

import { cartesianAxisProps, chartTooltipProps, GRID_PROPS } from "@nocoo/basalt/charts/config";
import { ChartShell } from "@nocoo/basalt/charts/frame";
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "@/components/charts/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { chart, chartAxis } from "@/lib/palette";
import type { CapacityPoint } from "@/lib/workstation-detail";
import { clockLabel, uptimeDaysLabel } from "@/lib/workstation-detail";
import { formatPercent } from "@/lib/workstation-format";
import { SeriesLegend } from "./series-legend";

const CPU_COLOR = chart.pink;
const MEM_COLOR = chart.sky;
const UPTIME_COLOR = chartAxis;

export function CapacityChart({
	points,
	windowSeconds,
	windowLabel,
	loading,
	error,
	onRetry,
}: {
	points: readonly CapacityPoint[];
	windowSeconds: number;
	windowLabel: string;
	loading: boolean;
	error: boolean;
	onRetry: () => void;
}) {
	if (loading) {
		return <Skeleton className="h-60 w-full" />;
	}

	if (error) {
		return (
			<div className="flex h-60 flex-col items-center justify-center gap-basalt-space-lg text-basalt-sm text-basalt-muted-foreground">
				<span>Could not load machine samples for this window.</span>
				<button
					type="button"
					onClick={onRetry}
					className="text-basalt-foreground underline underline-offset-4"
				>
					Try again
				</button>
			</div>
		);
	}

	if (points.length === 0) {
		return (
			<div className="flex h-60 items-center justify-center text-basalt-sm text-basalt-muted-foreground">
				No machine samples in the {windowLabel} window.
			</div>
		);
	}

	const last = points[points.length - 1];
	const legend = [
		{ label: "CPU", color: CPU_COLOR, value: formatPercent(last?.cpu) },
		{ label: "Memory", color: MEM_COLOR, value: formatPercent(last?.mem) },
		{ label: "Uptime", color: UPTIME_COLOR, value: uptimeDaysLabel(last?.uptime ?? null) },
	];

	return (
		<ChartShell
			ariaLabel={`CPU, memory and uptime across ${points.length} samples`}
			className="h-64 w-full"
			legend={<SeriesLegend items={legend} label="Machine load series" />}
			summary="CPU and memory share the percentage axis; uptime uses the right axis in days."
		>
			<ComposedChart
				data={points as CapacityPoint[]}
				margin={{ top: 8, right: 4, bottom: 0, left: 0 }}
			>
				<CartesianGrid {...GRID_PROPS} />
				<XAxis
					dataKey="x"
					{...cartesianAxisProps()}
					tickFormatter={(value) => clockLabel(value, windowSeconds)}
					minTickGap={32}
				/>
				<YAxis
					yAxisId="percent"
					domain={[0, 100]}
					{...cartesianAxisProps()}
					tickFormatter={(value: number) => `${value}%`}
					width={36}
				/>
				<YAxis
					yAxisId="uptime"
					orientation="right"
					domain={[0, (dataMax: number) => Math.max(dataMax * 1.2, 1)]}
					{...cartesianAxisProps()}
					tickFormatter={(value: number) => `${Math.round(value)}d`}
					width={30}
				/>
				<Tooltip
					{...chartTooltipProps({ cursor: "line" })}
					content={
						<ChartTooltip
							labelFormatter={(value) =>
								new Date(Number(value)).toLocaleString(undefined, {
									month: "short",
									day: "numeric",
									hour: "2-digit",
									minute: "2-digit",
								})
							}
							valueFormatter={(value) => `${Math.round(value * 10) / 10}`}
						/>
					}
				/>
				<Area
					yAxisId="percent"
					type="monotone"
					dataKey="cpu"
					name="CPU %"
					stroke={CPU_COLOR}
					fill={CPU_COLOR}
					fillOpacity={0.18}
					strokeWidth={2}
					dot={points.length <= 12}
					isAnimationActive={false}
					connectNulls={false}
				/>
				<Line
					yAxisId="percent"
					type="monotone"
					dataKey="mem"
					name="Memory %"
					stroke={MEM_COLOR}
					strokeWidth={2}
					dot={points.length <= 12}
					isAnimationActive={false}
					connectNulls={false}
				/>
				<Line
					yAxisId="uptime"
					type="monotone"
					dataKey="uptime"
					name="Uptime (d)"
					stroke={UPTIME_COLOR}
					strokeWidth={1.5}
					strokeOpacity={0.55}
					strokeDasharray="2 4"
					dot={false}
					isAnimationActive={false}
					connectNulls={false}
				/>
			</ComposedChart>
		</ChartShell>
	);
}
