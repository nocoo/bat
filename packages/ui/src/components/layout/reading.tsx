// The shared header reading: a label, a monospaced value, a supporting line and
// an optional window trend. Workstation and server detail pages use the same
// anatomy so the two pages read as one product.

import { LineChart } from "@nocoo/basalt/charts/line";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import type { ReactNode } from "react";

export interface TrendPoint {
	x: number;
	value: number;
}

export function Trend({ points, color }: { points: readonly TrendPoint[]; color: string }) {
	if (points.length < 2) {
		return <span className="hidden h-6 w-14 xl:block" aria-hidden="true" />;
	}
	return (
		<LineChart
			data={points as TrendPoint[]}
			series={[{ key: "value", color }]}
			ariaLabel="Trend"
			className="hidden h-6 w-14 xl:block"
			showAxes={false}
			showLegend={false}
			accessibilityLayer={false}
		/>
	);
}

export interface ReadingItem {
	label: string;
	value: string;
	detail: string;
	color: string;
	points?: readonly TrendPoint[];
	/** Custom visual instead of the default trend, e.g. a ring or a bar. */
	visual?: ReactNode;
}

export function Reading({ item }: { item: ReadingItem }) {
	return (
		<div className="min-w-0 px-basalt-card py-basalt-layout">
			<p className="text-basalt-sm text-basalt-muted-foreground">{item.label}</p>
			<div className="mt-basalt-space-xs flex items-center justify-between gap-basalt-space-sm">
				<span className="truncate font-mono text-basalt-xl font-semibold tabular-nums">
					{item.value}
				</span>
				{item.visual ?? <Trend points={item.points ?? []} color={item.color} />}
			</div>
			<p className="truncate text-basalt-sm text-basalt-muted-foreground">{item.detail}</p>
		</div>
	);
}

export function Readings({ items, lead }: { items: readonly ReadingItem[]; lead?: ReactNode }) {
	return (
		<div className="grid grid-cols-2 divide-basalt-border border-t border-basalt-border sm:grid-cols-3 lg:grid-cols-[minmax(13rem,1.15fr)_repeat(4,minmax(0,1fr))] lg:divide-x">
			{lead !== undefined && (
				<div className="col-span-2 border-b border-basalt-border px-basalt-card py-basalt-layout sm:col-span-3 lg:col-span-1 lg:border-b-0">
					{lead}
				</div>
			)}
			{items.map((item) => (
				<Reading key={item.label} item={item} />
			))}
		</div>
	);
}

/** Summary strip for list pages: five readings on one surface, no lead cell. */
export function PageSummary({ items }: { items: readonly ReadingItem[] }) {
	return (
		<LayerCard padding="none">
			<div className="grid grid-cols-2 divide-basalt-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
				{items.map((item) => (
					<Reading key={item.label} item={item} />
				))}
			</div>
		</LayerCard>
	);
}
