"use client";

import { HostCard } from "@/components/host-card";
import { AppShell } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHosts } from "@/lib/hooks";
import { AlertTriangle, Server } from "lucide-react";
import Link from "next/link";

function HostsLoading() {
	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{Array.from({ length: 6 }, (_, i) => (
				<Card key={`skeleton-${i.toString()}`}>
					<CardContent className="space-y-4 py-6">
						<Skeleton className="h-5 w-32" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</CardContent>
				</Card>
			))}
		</div>
	);
}

function HostsError({ message }: { message: string }) {
	return (
		<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
			<AlertTriangle className="h-12 w-12 mb-4 text-destructive" strokeWidth={1} />
			<h2 className="text-lg font-semibold text-foreground">Failed to load hosts</h2>
			<p className="mt-2 text-sm">{message}</p>
		</div>
	);
}

function HostsEmpty() {
	return (
		<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
			<Server className="h-12 w-12 mb-4" strokeWidth={1} />
			<h2 className="text-lg font-semibold text-foreground">No hosts registered</h2>
			<p className="mt-2 text-sm">Deploy a probe to start monitoring your servers.</p>
			<Link
				href="/setup"
				className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
			>
				Setup Guide
			</Link>
		</div>
	);
}

export default function HostsPage() {
	const { data: hosts, error, isLoading } = useHosts();

	return (
		<AppShell breadcrumbs={[{ label: "Hosts" }]}>
			{isLoading ? (
				<HostsLoading />
			) : error ? (
				<HostsError message={error.message} />
			) : !hosts || hosts.length === 0 ? (
				<HostsEmpty />
			) : (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{hosts.map((host) => (
						<HostCard key={host.host_id} host={host} />
					))}
				</div>
			)}
		</AppShell>
	);
}
