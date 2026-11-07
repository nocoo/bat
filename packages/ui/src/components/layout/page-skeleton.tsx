// Loading placeholders that copy the real page anatomy — the same card slots,
// cell insets, line boxes and row heights — so the swap to content does not
// jump. Every measurement here mirrors a component in the page it stands in
// for; change the component and you must change the skeleton beside it.

import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { Skeleton } from "@/components/ui/skeleton";

/** Bars sit in the same text tiers as `Reading`, so line boxes match exactly. */
function Line({ size, width }: { size: "sm" | "base" | "xl"; width: string }) {
	return (
		<div
			className={
				size === "sm" ? "text-basalt-sm" : size === "base" ? "text-basalt-base" : "text-basalt-xl"
			}
		>
			<Skeleton className={`h-[1lh] ${width}`} />
		</div>
	);
}

/** Same insets as `Reading`: px-basalt-card py-basalt-layout, 12/18/12 tiers. */
function SummaryCell() {
	return (
		<div className="min-w-0 space-y-basalt-space-xs px-basalt-card py-basalt-layout">
			<Line size="sm" width="w-16" />
			<Line size="xl" width="w-20" />
			<Line size="sm" width="w-24" />
		</div>
	);
}

export function SkeletonSummary({ cells = 5 }: { cells?: number }) {
	return (
		<LayerCard padding="none">
			<div className="grid grid-cols-2 divide-basalt-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
				{Array.from({ length: cells }, (_, index) => (
					<SummaryCell key={`summary-skeleton-${index.toString()}`} />
				))}
			</div>
		</LayerCard>
	);
}

/** Header card: identity band plus the readings row, same paddings as the real one. */
export function SkeletonHeaderCard({ readings = 4 }: { readings?: number }) {
	return (
		<LayerCard padding="none">
			<div className="flex items-center gap-basalt-space-md px-basalt-card py-basalt-layout">
				<Skeleton className="size-8 shrink-0 rounded-basalt-md" />
				<div className="space-y-basalt-space-md">
					<Skeleton className="h-8 w-56" />
					<Skeleton className="h-3 w-80" />
				</div>
			</div>
			<div className="grid grid-cols-2 divide-basalt-border border-t border-basalt-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
				<div className="min-w-0 space-y-basalt-space-xs border-b border-basalt-border px-basalt-card py-basalt-layout lg:border-b-0">
					<Line size="sm" width="w-20" />
					<Line size="xl" width="w-28" />
					<Line size="sm" width="w-16" />
				</div>
				{Array.from({ length: readings }, (_, index) => (
					<SummaryCell key={`reading-skeleton-${index.toString()}`} />
				))}
			</div>
		</LayerCard>
	);
}

/** Table rows use the library's own 40px row and 12/8px cell insets. */
export function SkeletonTable({
	rows = 6,
	columns = 7,
	title = true,
}: {
	rows?: number;
	columns?: number;
	title?: boolean;
}) {
	return (
		<LayerCard padding="none">
			{title && (
				<div className="flex items-center justify-between px-basalt-card py-basalt-space-card-sm">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-3 w-16" />
				</div>
			)}
			<div className="border-t border-basalt-border">
				<div className="flex h-basalt-table-row items-center gap-basalt-layout ps-basalt-table-x pe-basalt-table-x">
					{Array.from({ length: columns }, (_, index) => (
						<Skeleton key={`head-${index.toString()}`} className="h-3 flex-1" />
					))}
				</div>
				{Array.from({ length: rows }, (_, row) => (
					<div
						key={`row-${row.toString()}`}
						className="flex h-basalt-table-row items-center gap-basalt-layout border-t border-basalt-border ps-basalt-table-x pe-basalt-table-x"
					>
						<div className="flex flex-1 flex-col justify-center gap-basalt-space-sm">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-3 w-24" />
						</div>
						{Array.from({ length: columns - 1 }, (_, cell) => (
							<Skeleton key={`cell-${row.toString()}-${cell.toString()}`} className="h-4 flex-1" />
						))}
					</div>
				))}
			</div>
		</LayerCard>
	);
}

/** Chart card mirrors `ChartCard` + `ChartHeader`: 16px card inset, 12px gap, 256px plot. */
export function SkeletonChartCard({ height = "h-64" }: { height?: string }) {
	return (
		<LayerCard>
			<div className="mb-basalt-space-card-sm flex flex-wrap items-center justify-between gap-x-basalt-layout gap-y-basalt-space-sm">
				<div className="flex items-center gap-basalt-space-lg">
					<Skeleton className="size-4 rounded-basalt-sm" />
					<Line size="base" width="w-20" />
				</div>
				<div className="flex items-center gap-basalt-layout">
					<Line size="sm" width="w-20" />
					<Line size="sm" width="w-20" />
				</div>
			</div>
			<Skeleton className={height} />
		</LayerCard>
	);
}

/** Right rail cards: header slot plus four label/value lines. */
export function SkeletonRail({ cards = 3 }: { cards?: number }) {
	return (
		<>
			{Array.from({ length: cards }, (_, index) => (
				<LayerCard key={`rail-skeleton-${index.toString()}`} padding="none">
					<div className="px-basalt-card py-basalt-space-card-sm">
						<Line size="base" width="w-24" />
					</div>
					<div className="space-y-basalt-layout px-basalt-card pb-basalt-card">
						{Array.from({ length: 4 }, (_, line) => (
							<div
								key={`rail-line-${index.toString()}-${line.toString()}`}
								className="flex items-baseline justify-between gap-basalt-layout"
							>
								<Line size="base" width="w-20" />
								<Line size="base" width="w-24" />
							</div>
						))}
					</div>
				</LayerCard>
			))}
		</>
	);
}

/** Form card: header slot plus a control and a supporting line. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
	return (
		<LayerCard padding="none">
			<div className="flex items-center justify-between px-basalt-card py-basalt-space-card-sm">
				<Line size="base" width="w-28" />
				<Line size="sm" width="w-20" />
			</div>
			<div className="space-y-basalt-space-md border-t border-basalt-border px-basalt-card py-basalt-card">
				{Array.from({ length: lines }, (_, index) => (
					<Skeleton
						key={`card-line-${index.toString()}`}
						className={index === 0 ? "h-9 w-full" : "h-3 w-2/3"}
					/>
				))}
			</div>
		</LayerCard>
	);
}
