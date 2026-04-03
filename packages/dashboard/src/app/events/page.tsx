"use client";

import { EventTable } from "@/components/event-table";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENTS_PAGE_SIZE, useEvents } from "@/lib/hooks";
import { AlertTriangle, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useState } from "react";

export default function EventsPage() {
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
