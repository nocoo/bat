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
import { Skeleton } from "@/components/ui/skeleton";
import { EVENTS_PAGE_SIZE, useEvents, useHosts } from "@/hooks";
import { formatTimestamp } from "@/lib/format";

function EventTable({ events }: { events: EventItem[] }) {
	const { data: hosts } = useHosts();
	const hostMap = new Map(hosts?.map((h) => [h.host_id, h]) ?? []);

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Host</TableHead>
					<TableHead>Title</TableHead>
					<TableHead>Tags</TableHead>
					<TableHead>Time</TableHead>
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
									className="text-basalt-primary hover:underline"
								>
									{host?.hostname ?? event.hostname ?? event.host_id.slice(0, 8)}
								</Link>
							</TableCell>
							<TableCell className="text-basalt-base">{event.title}</TableCell>
							<TableCell className="font-mono text-basalt-sm max-w-xs truncate">
								{event.tags.length > 0 ? event.tags.join(", ") : "—"}
							</TableCell>
							<TableCell className="text-basalt-muted-foreground text-basalt-base">
								{formatTimestamp(event.created_at)}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}

export function EventsPage() {
	const [page, setPage] = useState(1);
	const { data, error, isLoading } = useEvents(undefined, page);

	const events = data?.items;
	const total = data?.total ?? 0;
	const totalPages = Math.ceil(total / EVENTS_PAGE_SIZE);

	return isLoading && !data ? (
		<LayerCard>
			<LayerCard.Body className="py-6 space-y-4">
				{Array.from({ length: 5 }, (_, i) => (
					<Skeleton key={`event-skeleton-${i.toString()}`} className="h-8 w-full" />
				))}
			</LayerCard.Body>
		</LayerCard>
	) : error && !data ? (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<AlertTriangle className="h-12 w-12 mb-4 text-basalt-destructive" strokeWidth={1} />
			<h2 className="text-basalt-lg font-semibold text-basalt-foreground">Failed to load events</h2>
			<p className="mt-2 text-basalt-base">{error.message}</p>
		</div>
	) : !events || events.length === 0 ? (
		<div className="space-y-4">
			<PageHeader
				title="Events"
				description="Audit timeline of webhook triggers, deployments, and host events."
			/>
			<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
				<ScrollText className="h-12 w-12 mb-4" strokeWidth={1} />
				<h2 className="text-basalt-lg font-semibold text-basalt-foreground">No events yet</h2>
				<p className="mt-2 text-basalt-base">
					Events will appear here when hosts send webhook payloads.
				</p>
			</div>
		</div>
	) : (
		<div className="space-y-4">
			<PageHeader
				title="Events"
				description="Audit timeline of webhook triggers, deployments, and host events."
			/>
			<LayerCard>
				<LayerCard.Body className="py-2 overflow-x-auto">
					<EventTable events={events} />
				</LayerCard.Body>
			</LayerCard>

			{/* Pagination */}
			{totalPages > 1 && (
				<div className="flex items-center justify-between">
					<p className="text-basalt-base text-basalt-muted-foreground">
						{total} events · Page {page} of {totalPages}
					</p>
					<div className="flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage((p) => Math.max(1, p - 1))}
							disabled={page <= 1}
						>
							<ChevronLeft className="h-4 w-4 mr-1" />
							Previous
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
							disabled={page >= totalPages}
						>
							Next
							<ChevronRight className="h-4 w-4 ml-1" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
