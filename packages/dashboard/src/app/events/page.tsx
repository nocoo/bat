"use client";

import { EventTable } from "@/components/event-table";
import { AppShell } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEvents } from "@/lib/hooks";
import { AlertTriangle, ScrollText } from "lucide-react";

export default function EventsPage() {
	const { data: events, error, isLoading } = useEvents();

	return (
		<AppShell breadcrumbs={[{ label: "Events" }]}>
			{isLoading && !events ? (
				<Card>
					<CardContent className="py-6 space-y-4">
						{Array.from({ length: 5 }, (_, i) => (
							<Skeleton key={`event-skeleton-${i.toString()}`} className="h-8 w-full" />
						))}
					</CardContent>
				</Card>
			) : error && !events ? (
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
				<Card>
					<CardContent className="py-2">
						<EventTable events={events} />
					</CardContent>
				</Card>
			)}
		</AppShell>
	);
}
