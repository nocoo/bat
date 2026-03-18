"use client";

import { AlertTable } from "@/components/alert-table";
import { AppShell } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts } from "@/lib/hooks";
import { AlertTriangle, Bell } from "lucide-react";

export default function AlertsPage() {
	const { data: alerts, error, isLoading } = useAlerts();

	return (
		<AppShell breadcrumbs={[{ label: "Alerts" }]}>
			{isLoading && !alerts ? (
				<Card>
					<CardContent className="py-6 space-y-4">
						{Array.from({ length: 5 }, (_, i) => (
							<Skeleton key={`alert-skeleton-${i.toString()}`} className="h-8 w-full" />
						))}
					</CardContent>
				</Card>
			) : error && !alerts ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<AlertTriangle className="h-12 w-12 mb-4 text-destructive" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">Failed to load alerts</h2>
					<p className="mt-2 text-sm">{error.message}</p>
				</div>
			) : !alerts || alerts.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<Bell className="h-12 w-12 mb-4" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">No active alerts</h2>
					<p className="mt-2 text-sm">All systems are running normally.</p>
				</div>
			) : (
				<Card>
					<CardContent className="py-2">
						<AlertTable alerts={alerts} />
					</CardContent>
				</Card>
			)}
		</AppShell>
	);
}
