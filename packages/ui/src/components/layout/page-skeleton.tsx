// Loading placeholders that mirror the real page anatomy: a summary strip, a
// dense table or chart stack, and the right rail. Keeping them in one place
// means a layout change only needs its skeleton updated once.

import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonSummary({ cells = 5 }: { cells?: number }) {
	return (
		<LayerCard padding="none">
			<div className="grid grid-cols-2 divide-basalt-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
				{Array.from({ length: cells }, (_, index) => (
					<div
						key={`summary-skeleton-${index.toString()}`}
						className="space-y-basalt-space-sm px-basalt-card py-basalt-layout"
					>
						<Skeleton className="h-3 w-16" />
						<Skeleton className="h-5 w-14" />
						<Skeleton className="h-3 w-24" />
					</div>
				))}
			</div>
		</LayerCard>
	);
}

export function SkeletonHeaderCard({ readings = 4 }: { readings?: number }) {
	return (
		<LayerCard padding="none">
			<div className="flex items-center gap-basalt-space-md px-basalt-card py-basalt-layout">
				<Skeleton className="size-8 shrink-0 rounded-basalt-md" />
				<div className="space-y-basalt-space-sm">
					<Skeleton className="h-6 w-56" />
					<Skeleton className="h-3 w-80" />
				</div>
			</div>
			<div className="grid grid-cols-2 divide-basalt-border border-t border-basalt-border sm:grid-cols-3 lg:grid-cols-5 lg:divide-x">
				<div className="space-y-basalt-space-sm border-b border-basalt-border px-basalt-card py-basalt-layout lg:border-b-0">
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-5 w-28" />
					<Skeleton className="h-3 w-16" />
				</div>
				{Array.from({ length: readings }, (_, index) => (
					<div
						key={`reading-skeleton-${index.toString()}`}
						className="space-y-basalt-space-sm px-basalt-card py-basalt-layout"
					>
						<Skeleton className="h-3 w-14" />
						<Skeleton className="h-5 w-16" />
						<Skeleton className="h-3 w-20" />
					</div>
				))}
			</div>
		</LayerCard>
	);
}

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
		<LayerCard>
			{title && (
				<LayerCard.Header>
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-3 w-16" />
				</LayerCard.Header>
			)}
			<div className="divide-y divide-basalt-border border-t border-basalt-border">
				<div className="flex items-center gap-basalt-layout px-basalt-card py-basalt-space-card-sm">
					{Array.from({ length: columns }, (_, index) => (
						<Skeleton key={`head-${index.toString()}`} className="h-3 flex-1" />
					))}
				</div>
				{Array.from({ length: rows }, (_, row) => (
					<div
						key={`row-${row.toString()}`}
						className="flex items-center gap-basalt-layout px-basalt-card py-basalt-space-card-sm"
					>
						<div className="flex-1 space-y-basalt-space-xs">
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-3 w-28" />
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

export function SkeletonChartCard({ height = "h-64" }: { height?: string }) {
	return (
		<LayerCard>
			<LayerCard.Header>
				<div className="flex items-center gap-basalt-space-md">
					<Skeleton className="size-4 rounded-basalt-sm" />
					<Skeleton className="h-4 w-20" />
				</div>
				<Skeleton className="h-3 w-32" />
			</LayerCard.Header>
			<LayerCard.Body>
				<Skeleton className={height} />
			</LayerCard.Body>
		</LayerCard>
	);
}

export function SkeletonRail({ cards = 3 }: { cards?: number }) {
	return (
		<>
			{Array.from({ length: cards }, (_, index) => (
				<LayerCard key={`rail-skeleton-${index.toString()}`}>
					<LayerCard.Header>
						<Skeleton className="h-4 w-24" />
					</LayerCard.Header>
					<LayerCard.Body className="space-y-basalt-space-md">
						{Array.from({ length: 4 }, (_, line) => (
							<div
								key={`rail-line-${index.toString()}-${line.toString()}`}
								className="flex justify-between gap-basalt-layout"
							>
								<Skeleton className="h-3 w-20" />
								<Skeleton className="h-3 w-24" />
							</div>
						))}
					</LayerCard.Body>
				</LayerCard>
			))}
		</>
	);
}

/** Card placeholder for forms and short content blocks. */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
	return (
		<LayerCard>
			<LayerCard.Header>
				<Skeleton className="h-4 w-28" />
				<Skeleton className="h-3 w-20" />
			</LayerCard.Header>
			<LayerCard.Body className="space-y-basalt-space-md">
				{Array.from({ length: lines }, (_, index) => (
					<Skeleton
						key={`card-line-${index.toString()}`}
						className={index === 0 ? "h-9 w-full" : "h-3 w-2/3"}
					/>
				))}
			</LayerCard.Body>
		</LayerCard>
	);
}
