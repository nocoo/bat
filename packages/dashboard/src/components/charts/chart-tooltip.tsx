"use client";

import type { Payload } from "recharts/types/component/DefaultTooltipContent";

interface ChartTooltipProps {
	active?: boolean;
	payload?: Payload<number, string>[];
	label?: string | number;
	labelFormatter?: (label: string | number) => string;
	valueFormatter?: (value: number, name: string) => string;
}

function defaultLabelFormatter(label: string | number): string {
	return new Date(Number(label) * 1000).toLocaleString();
}

function defaultValueFormatter(value: number, _name: string): string {
	return `${value.toFixed(1)}%`;
}

/**
 * Unified custom tooltip for all dashboard charts.
 * Styled to match the basalt design system: rounded card, border, shadow.
 */
export function ChartTooltip({
	active,
	payload,
	label,
	labelFormatter = defaultLabelFormatter,
	valueFormatter = defaultValueFormatter,
}: ChartTooltipProps) {
	if (!active || !payload?.length) return null;

	return (
		<div className="rounded-[var(--radius-widget)] border border-border bg-card p-2.5 shadow-sm">
			<p className="mb-1.5 text-xs text-muted-foreground">
				{labelFormatter(label as string | number)}
			</p>
			<div className="space-y-1">
				{payload.map((entry) => (
					<div
						key={entry.dataKey as string}
						className="flex items-center justify-between gap-4 text-sm"
					>
						<span className="flex items-center gap-1.5">
							<span
								className="inline-block h-2.5 w-2.5 rounded-full"
								style={{ backgroundColor: entry.color }}
							/>
							<span className="text-muted-foreground">{entry.name}</span>
						</span>
						<span className="font-mono font-medium tabular-nums">
							{valueFormatter(entry.value as number, entry.name as string)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
