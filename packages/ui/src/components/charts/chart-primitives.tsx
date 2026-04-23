// Tiny shared chart primitives — keep individual chart files focused on the
// recharts geometry / series config and let these handle the boilerplate
// shared across every chart card.
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { maintenanceAreas } from "./maintenance-overlay";

interface MaintenanceWindow {
	start: string;
	end: string;
}

interface TimePoint {
	ts: number;
}

/**
 * Compute maintenance overlay rectangles aligned to the chart's data range.
 * Returns [] when no data or no window is set.
 */
export function useMaintenanceAreas(
	chartData: readonly TimePoint[],
	window: MaintenanceWindow | null | undefined,
): { x1: number; x2: number }[] {
	return useMemo(() => {
		if (!window || chartData.length === 0) {
			return [];
		}
		const from = chartData[0]?.ts ?? 0;
		const to = chartData[chartData.length - 1]?.ts ?? 0;
		return maintenanceAreas(window.start, window.end, from, to);
	}, [window, chartData]);
}

/** Card wrapper used by every chart (consistent padding + radius). */
export function ChartCard({ children }: { children: ReactNode }) {
	return <div className="rounded-card bg-secondary p-4 md:p-5">{children}</div>;
}

/** "No X data" placeholder rendered inside a {@link ChartCard}. */
export function ChartEmptyState({ message }: { message: string }) {
	return (
		<ChartCard>
			<div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
				{message}
			</div>
		</ChartCard>
	);
}

export interface SeriesLegendItem {
	key: string;
	label: string;
	color: string;
}

/**
 * Standard chart header: icon + title on the left, color-dot legend on the right.
 * Pass `extraLegend` for non-series legend chips (e.g. a threshold marker).
 */
export function ChartHeader({
	icon: Icon,
	title,
	series,
	extraLegend,
}: {
	icon: LucideIcon;
	title: string;
	series?: readonly SeriesLegendItem[];
	extraLegend?: ReactNode;
}) {
	const hasLegend = (series && series.length > 0) || extraLegend !== undefined;
	return (
		<div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
			<div className="flex items-center gap-2 text-base font-semibold">
				<Icon className="h-4 w-4" />
				{title}
			</div>
			{hasLegend && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
					{series?.map((s) => (
						<span key={s.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
							<span
								className="inline-block h-2 w-2 rounded-full"
								style={{ backgroundColor: s.color }}
							/>
							{s.label}
						</span>
					))}
					{extraLegend}
				</div>
			)}
		</div>
	);
}
