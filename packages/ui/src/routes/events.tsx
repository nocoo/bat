import { type EventItem, hashHostId } from "@bat/shared";
import { Button } from "@nocoo/basalt";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@nocoo/basalt/components/table";
import { AlertTriangle, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { SkeletonSummary, SkeletonTable } from "@/components/layout/page-skeleton";
import { PageSummary, type ReadingItem } from "@/components/layout/reading";
import { EVENTS_PAGE_SIZE, useEvents, useHosts } from "@/hooks";
import { formatTimestamp } from "@/lib/format";
import { chart } from "@/lib/palette";

function EventTable({ events }: { events: EventItem[] }) {
	const { data: hosts } = useHosts();
	const hostMap = new Map(hosts?.map((host) => [host.host_id, host]) ?? []);

	return (
		<div data-basalt-table-container="" data-edge="attached">
			<Table aria-label="Events">
				<TableHeader>
					<TableRow>
						<TableHead>Host</TableHead>
						<TableHead>Title</TableHead>
						<TableHead>Tags</TableHead>
						<TableHead>Source</TableHead>
						<TableHead textAlign="end">When</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{events.map((event) => {
						const host = hostMap.get(event.host_id);
						return (
							<TableRow key={event.id}>
								<TableCell>
									<Link
										to={`/hosts/${hashHostId(event.host_id)}`}
										className="font-medium underline-offset-4 hover:underline"
									>
										{host?.hostname ?? event.hostname ?? event.host_id.slice(0, 8)}
									</Link>
								</TableCell>
								<TableCell className="max-w-md truncate">{event.title}</TableCell>
								<TableCell className="max-w-xs truncate font-mono text-basalt-sm text-basalt-muted-foreground">
									{event.tags.length > 0 ? event.tags.join(", ") : "—"}
								</TableCell>
								<TableCell className="whitespace-nowrap font-mono text-basalt-sm text-basalt-muted-foreground">
									{event.source_ip}
								</TableCell>
								<TableCell
									textAlign="end"
									className="whitespace-nowrap text-basalt-sm text-basalt-muted-foreground"
								>
									{formatTimestamp(event.created_at)}
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}

function summaryItems(events: readonly EventItem[], total: number): ReadingItem[] {
	const hosts = new Set(events.map((event) => event.host_id)).size;
	const tagged = events.filter((event) => event.tags.length > 0).length;
	const newest = events.reduce<number | null>(
		(total, event) => (total === null ? event.created_at : Math.max(total, event.created_at)),
		null,
	);
	return [
		{ label: "Events", value: String(total), detail: "all time", color: chart.sky },
		{
			label: "This page",
			value: String(events.length),
			detail: `of ${EVENTS_PAGE_SIZE}`,
			color: chart.teal,
		},
		{ label: "Hosts", value: String(hosts), detail: "on this page", color: chart.green },
		{ label: "Tagged", value: String(tagged), detail: "with event tags", color: chart.purple },
		{
			label: "Newest",
			value: newest === null ? "—" : formatTimestamp(newest),
			detail: "received",
			color: chart.orange,
		},
	];
}

export function EventsPage() {
	const [page, setPage] = useState(1);
	const { data, error, isLoading } = useEvents(undefined, page);

	const events = data?.items ?? [];
	const total = data?.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / EVENTS_PAGE_SIZE));

	return (
		<div className="space-y-basalt-layout" data-testid="events-page">
			<PageHeader
				title="Events"
				description="Audit timeline of webhook triggers, deployments, and host events."
			/>

			{error && data === undefined ? (
				<LayerCard>
					<LayerCard.Body className="flex items-start gap-basalt-space-md">
						<AlertTriangle
							aria-hidden="true"
							className="mt-basalt-space-xs size-4 shrink-0 text-basalt-destructive"
						/>
						<p className="text-basalt-sm text-basalt-muted-foreground">{error.message}</p>
					</LayerCard.Body>
				</LayerCard>
			) : isLoading && data === undefined ? (
				<>
					<SkeletonSummary />
					<SkeletonTable rows={6} columns={5} />
				</>
			) : (
				<>
					<PageSummary items={summaryItems(events, total)} />
					<LayerCard>
						<LayerCard.Header>
							<h2>Timeline</h2>
							<span className="text-basalt-sm text-basalt-muted-foreground">
								Page {page} of {totalPages}
							</span>
						</LayerCard.Header>
						{events.length === 0 ? (
							<LayerCard.Body>
								<div className="flex items-center gap-basalt-space-md text-basalt-sm text-basalt-muted-foreground">
									<ScrollText aria-hidden="true" className="size-4" strokeWidth={1.5} />
									No events yet. They appear when hosts send webhook payloads.
								</div>
							</LayerCard.Body>
						) : (
							<EventTable events={events} />
						)}
						{totalPages > 1 && (
							<div className="flex items-center justify-between border-t border-basalt-border px-basalt-card py-basalt-space-card-sm">
								<p className="text-basalt-sm text-basalt-muted-foreground">
									{total} events · page {page} of {totalPages}
								</p>
								<div className="flex items-center gap-basalt-space-lg">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setPage((current) => Math.max(1, current - 1))}
										disabled={page <= 1}
									>
										<ChevronLeft aria-hidden="true" />
										Previous
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
										disabled={page >= totalPages}
									>
										Next
										<ChevronRight aria-hidden="true" />
									</Button>
								</div>
							</div>
						)}
					</LayerCard>
				</>
			)}
		</div>
	);
}
