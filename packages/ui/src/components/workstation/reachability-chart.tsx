// Reachability over time: one line per authorized server on the millisecond
// axis, plus the selected target's packet loss on a second 0-100 % axis.
// Selecting a legend entry is the focus control; nothing is fabricated for a
// target that never answered.

import { cartesianAxisProps, chartTooltipProps, GRID_PROPS } from "@nocoo/basalt/charts/config";
import { ChartShell } from "@nocoo/basalt/charts/frame";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { chartAxis } from "@/lib/palette";
import type { TargetRow } from "@/lib/workstation-detail";
import { clockLabel, reachabilitySeries } from "@/lib/workstation-detail";
import { formatLoss, formatRtt } from "@/lib/workstation-format";
import { SeriesLegend } from "./series-legend";

const LOSS_COLOR = chartAxis;

interface TooltipEntry {
	dataKey?: string | number;
	name?: string | number;
	value?: number | string | null;
	color?: string;
}

function ReachabilityTooltip({
	active,
	payload,
	label,
	windowSeconds,
}: {
	active?: boolean;
	payload?: readonly TooltipEntry[];
	label?: string | number;
	windowSeconds: number;
}) {
	if (!active || !payload || payload.length === 0) {
		return null;
	}
	const rows = [...payload]
		.filter((entry) => entry.value !== null && entry.value !== undefined)
		.sort((a, b) => Number(b.value) - Number(a.value));
	const header =
		label === undefined
			? ""
			: new Date(Number(label)).toLocaleString(undefined, {
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
					...(windowSeconds <= 86_400 ? { second: "2-digit" } : {}),
				});
	return (
		<div className="min-w-40 rounded-basalt-md border border-basalt-border bg-basalt-card p-basalt-space-md text-basalt-sm shadow-basalt-popover">
			<p className="mb-basalt-space-sm font-medium">{header}</p>
			<ul className="space-y-basalt-space-xs">
				{rows.map((entry) => (
					<li
						key={String(entry.dataKey)}
						className="flex items-center justify-between gap-basalt-layout"
					>
						<span className="flex min-w-0 items-center gap-basalt-space-md">
							<span
								aria-hidden="true"
								className="size-2 shrink-0 rounded-basalt-full"
								style={{ backgroundColor: entry.color }}
							/>
							<span className="truncate">{entry.name}</span>
						</span>
						<span className="font-mono tabular-nums">
							{entry.dataKey === "loss"
								? `${Math.round(Number(entry.value) * 10) / 10}%`
								: formatRtt(Number(entry.value))}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
}

export function ReachabilityChart({
	rows,
	windowSeconds,
	windowLabel,
	focusedServerId,
	onFocus,
	loading,
	error,
	onRetry,
}: {
	rows: readonly TargetRow[];
	windowSeconds: number;
	windowLabel: string;
	focusedServerId: string | null;
	onFocus: (serverId: string) => void;
	loading: boolean;
	error: boolean;
	onRetry: () => void;
}) {
	if (loading) {
		return <Skeleton className="h-56 w-full" />;
	}

	if (error) {
		return (
			<div className="flex h-56 flex-col items-center justify-center gap-basalt-space-lg text-basalt-sm text-basalt-muted-foreground">
				<span>Could not load connectivity samples for this window.</span>
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

	if (rows.length === 0) {
		return (
			<div className="flex h-56 items-center justify-center text-basalt-sm text-basalt-muted-foreground">
				No connectivity samples in the {windowLabel} window.
			</div>
		);
	}

	const series = reachabilitySeries(rows);
	const focused = rows.find((row) => row.serverId === focusedServerId) ?? null;
	const lossValues = focused?.series.map((point) => point.loss) ?? [];
	const hasLoss = lossValues.some((value) => value !== null);
	const data = series.data.map((point, index) => ({
		...point,
		loss: focused ? (focused.series.find((entry) => entry.x === point.x)?.loss ?? null) : null,
		key: index,
	}));

	return (
		<ChartShell
			ariaLabel={`Round-trip time to ${rows.length} servers across ${series.data.length} samples`}
			className="h-72 w-full"
			legend={
				<SeriesLegend
					label="Reachability targets"
					items={rows.map((row) => ({
						label: row.name,
						color: row.color,
						value: formatRtt(row.last),
						active: row.serverId === focusedServerId,
						onSelect: () => onFocus(row.serverId),
					}))}
				/>
			}
			summary="Mean round-trip time per report. A line stops where the probe went unanswered; the dashed axis carries the selected target's loss."
		>
			<LineChart data={data} margin={{ top: 8, right: hasLoss ? 4 : 8, bottom: 0, left: 0 }}>
				<CartesianGrid {...GRID_PROPS} />
				<XAxis
					dataKey="x"
					{...cartesianAxisProps()}
					tickFormatter={(value) => clockLabel(value, windowSeconds)}
					minTickGap={32}
				/>
				<YAxis
					yAxisId="rtt"
					domain={[0, "auto"]}
					{...cartesianAxisProps()}
					tickFormatter={(value: number) => `${Math.round(value)}ms`}
					width={48}
				/>
				{hasLoss && (
					<YAxis
						yAxisId="loss"
						orientation="right"
						domain={[0, 100]}
						{...cartesianAxisProps()}
						tickFormatter={(value: number) => `${value}%`}
						width={36}
					/>
				)}
				<Tooltip
					{...chartTooltipProps({ cursor: "line" })}
					content={<ReachabilityTooltip windowSeconds={windowSeconds} />}
				/>
				{series.keys.map((key) => {
					const dimmed = focused !== null && focused.serverId !== key.serverId;
					return (
						<Line
							key={key.key}
							yAxisId="rtt"
							type="monotone"
							dataKey={key.key}
							name={key.label}
							stroke={key.color}
							strokeWidth={dimmed ? 1.25 : 1.75}
							strokeOpacity={dimmed ? 0.22 : 1}
							dot={series.data.length <= 12}
							isAnimationActive={false}
							connectNulls={false}
						/>
					);
				})}
				{hasLoss && (
					<Line
						yAxisId="loss"
						type="monotone"
						dataKey="loss"
						name={`${focused?.name ?? ""} loss`}
						stroke={LOSS_COLOR}
						strokeWidth={1.25}
						strokeDasharray="4 3"
						dot={false}
						isAnimationActive={false}
						connectNulls={false}
					/>
				)}
			</LineChart>
		</ChartShell>
	);
}

export { formatLoss };
