// Loading placeholders that copy the real page anatomy — the same card slots,
// cell insets, line boxes and row heights — so the swap to content does not
// jump. Every measurement here mirrors a component in the page it stands in
// for; change the component and you must change the skeleton beside it.

import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, style, ...props }: React.ComponentProps<"div">) {
	return (
		<SkeletonLine
			className={cn("h-full w-full", className)}
			style={{ width: undefined, ...style }}
			{...props}
		/>
	);
}

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

/** Same insets as `Reading`: px-basalt-card py-basalt-layout, 12/18/12 tiers + trend slot. */
function SummaryCell() {
	return (
		<div className="min-w-0 space-y-basalt-space-sm px-basalt-card py-basalt-card">
			<Line size="sm" width="w-16" />
			<div className="flex items-center justify-between gap-basalt-space-sm">
				<Line size="xl" width="w-20" />
				<Skeleton className="hidden h-6 w-14 xl:block" />
			</div>
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

/** Header card: identity band plus the readings row, matching real paddings and column tracks. */
export function SkeletonHeaderCard({ readings = 4 }: { readings?: number }) {
	return (
		<LayerCard padding="none">
			<div className="flex items-center gap-basalt-space-lg px-basalt-card py-basalt-card">
				<Skeleton className="size-9 shrink-0 rounded-basalt-md" />
				<div className="space-y-basalt-space-sm">
					<Skeleton className="h-7 w-56" />
					<Skeleton className="h-3.5 w-80" />
				</div>
			</div>
			<div className="grid grid-cols-2 divide-basalt-border border-t border-basalt-border sm:grid-cols-3 lg:grid-cols-[minmax(17rem,1.15fr)_repeat(4,minmax(0,1fr))] min-[90rem]:grid-cols-[minmax(26rem,1.15fr)_repeat(4,minmax(0,1fr))] lg:divide-x">
				<div className="col-span-2 min-w-0 space-y-basalt-space-sm border-b border-basalt-border px-basalt-card py-basalt-card sm:col-span-3 lg:col-span-1 lg:border-b-0">
					<Line size="sm" width="w-20" />
					<Line size="xl" width="w-28" />
					<Line size="sm" width="w-24" />
				</div>
				{Array.from({ length: readings }, (_, index) => (
					<SummaryCell key={`reading-skeleton-${index.toString()}`} />
				))}
			</div>
		</LayerCard>
	);
}

/** Table rows match real two-line + sparkline rows (~60px) rather than compact 40px rows. */
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
				<div className="flex items-center justify-between px-basalt-card py-3">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-3.5 w-16" />
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
						className="flex min-h-[3.75rem] items-center gap-basalt-layout border-t border-basalt-border py-3 ps-basalt-table-x pe-basalt-table-x"
					>
						<div className="flex flex-1 flex-col justify-center gap-1.5">
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

/** Card grid skeleton mirroring HostCardGrid / WorkstationCardGrid anatomy. */
export function SkeletonCardGrid({ cards = 6, bars = 4 }: { cards?: number; bars?: 3 | 4 }) {
	return (
		<div className="grid auto-rows-fr grid-cols-1 items-stretch gap-basalt-layout md:grid-cols-2 2xl:grid-cols-3">
			{Array.from({ length: cards }, (_, index) => (
				<LayerCard key={`card-grid-skeleton-${index.toString()}`} className="h-full">
					<div className="flex h-full flex-col gap-3">
						{/* Header */}
						<div className="flex items-center justify-between gap-basalt-space-lg">
							<div className="flex items-center gap-basalt-space-lg">
								<Skeleton className="size-2.5 shrink-0 rounded-[2px]" />
								<Skeleton className="h-4 w-36" />
							</div>
							<Skeleton className="h-6 w-16 rounded-basalt-full" />
						</div>

						{/* Segmented resource bars */}
						<div
							className={
								bars === 4
									? "grid grid-cols-2 gap-x-basalt-space-md gap-y-basalt-space-sm sm:grid-cols-4"
									: "grid grid-cols-3 gap-x-basalt-space-lg gap-y-basalt-space-sm"
							}
						>
							{Array.from({ length: bars }, (_, barIdx) => (
								<div
									key={`bar-skeleton-${index.toString()}-${barIdx.toString()}`}
									className="space-y-1.5"
								>
									<div className="flex items-center justify-between gap-1">
										<Skeleton className="h-3 w-8" />
										<Skeleton className="h-3 w-7" />
									</div>
									<Skeleton className="h-1.5 w-full rounded-[1px]" />
								</div>
							))}
						</div>

						{/* 2x3 telemetry matrix */}
						<div className="grid grid-cols-3 gap-x-basalt-space-lg gap-y-basalt-space-md">
							{Array.from({ length: 6 }, (_, cellIdx) => (
								<div
									key={`matrix-skeleton-${index.toString()}-${cellIdx.toString()}`}
									className="space-y-1"
								>
									<Skeleton className="h-3 w-12" />
									<Skeleton className="h-4 w-16" />
								</div>
							))}
						</div>

						{/* 3-column framed sub-cards */}
						<div className="grid grid-cols-3 gap-basalt-space-md">
							{Array.from({ length: 3 }, (_, subIdx) => (
								<div
									key={`sub-skeleton-${index.toString()}-${subIdx.toString()}`}
									className="space-y-1.5 rounded-basalt-md border border-basalt-border/70 bg-basalt-muted/30 px-basalt-space-lg py-basalt-space-md"
								>
									<Skeleton className="h-3 w-10" />
									<Skeleton className="h-4 w-16" />
									<Skeleton className="h-3 w-12" />
								</div>
							))}
						</div>

						{/* Footer */}
						<div className="mt-auto flex items-center justify-between border-t border-basalt-border/70 pt-basalt-space-md">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-3.5 w-14" />
						</div>
					</div>
				</LayerCard>
			))}
		</div>
	);
}

/** Chart card mirrors `ChartCard` + `ChartHeader`: 16px card inset, 16px header margin, 256px plot. */
export function SkeletonChartCard({ height = "h-64" }: { height?: string }) {
	return (
		<LayerCard>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-x-basalt-layout gap-y-basalt-space-sm">
				<div className="flex items-center gap-basalt-space-lg">
					<Skeleton className="size-4 rounded-basalt-sm" />
					<Line size="base" width="w-24" />
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

/** Right rail cards: header slot plus four label/value lines with comfortable spacing. */
export function SkeletonRail({ cards = 3 }: { cards?: number }) {
	return (
		<>
			{Array.from({ length: cards }, (_, index) => (
				<LayerCard key={`rail-skeleton-${index.toString()}`} padding="none">
					<div className="px-basalt-card py-3">
						<Line size="base" width="w-24" />
					</div>
					<div className="space-y-3 border-t border-basalt-border px-basalt-card py-basalt-card">
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

/** Form card: header slot plus a control and supporting lines with comfortable vertical rhythm. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
	return (
		<LayerCard padding="none">
			<div className="flex items-center justify-between px-basalt-card py-3">
				<Line size="base" width="w-28" />
				<Line size="sm" width="w-20" />
			</div>
			<div className="space-y-3 border-t border-basalt-border px-basalt-card py-basalt-card">
				{Array.from({ length: lines }, (_, index) => (
					<Skeleton
						key={`card-line-${index.toString()}`}
						className={index === 0 ? "h-9 w-full" : "h-3.5 w-2/3"}
					/>
				))}
			</div>
		</LayerCard>
	);
}
