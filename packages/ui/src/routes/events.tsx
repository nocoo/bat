import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { EVENTS_PAGE_SIZE, useEvents, useHosts } from "@/hooks";
import { type EventItem, hashHostId } from "@bat/shared";
import { AlertTriangle, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
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
									className="text-primary hover:underline"
								>
									{host?.hostname ?? event.hostname ?? event.host_id.slice(0, 8)}
								</Link>
							</TableCell>
							<TableCell className="text-sm">{event.title}</TableCell>
							<TableCell className="font-mono text-xs max-w-xs truncate">
								{event.tags.length > 0 ? event.tags.join(", ") : "—"}
							</TableCell>
							<TableCell className="text-muted-foreground text-sm">
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

	return (
		<AppShell breadcrumbs={[{ label: "Events" }]}>
			{isLoading && !data ? (
				<Card>
					<CardContent className="py-6 space-y-4">
						{Array.from({ length: 5 }, (_, i) => (
							<Skeleton key={`event-skeleton-${i.toString()}`} className="h-8 w-full" />
						))}
					</CardContent>
				</Card>
			) : error && !data ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<AlertTriangle className="h-12 w-12 mb-4 text-destructive" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">Failed to load events</h2>
					<p className="mt-2 text-sm">{error.message}</p>
				</div>
			) : !events || events.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<ScrollText className="h-12 w-12 mb-4" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">No events yet</h2>
					<p className="mt-2 text-sm">Events will appear here when hosts send webhook payloads.</p>
				</div>
			) : (
				<div className="space-y-4">
					<Card>
						<CardContent className="py-2">
							<EventTable events={events} />
						</CardContent>
					</Card>

					{/* Pagination */}
					{totalPages > 1 && (
						<div className="flex items-center justify-between">
							<p className="text-sm text-muted-foreground">
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
			)}
		</AppShell>
	);
}
