"use client";

import { HostCard } from "@/components/host-card";
import { AppShell } from "@/components/layout";
import { TagFilterBar } from "@/components/tag-filter-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHostTags, useHosts, useTags } from "@/lib/hooks";
import { AlertTriangle, Server } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

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
	const { data: hostTagsMap } = useHostTags();
	const { data: allTags } = useTags();
	const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

	const handleToggleTag = useCallback((tagId: number) => {
		setSelectedTagIds((prev) =>
			prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
		);
	}, []);

	// Filter hosts by selected tags (AND logic)
	const filteredHosts = useMemo(() => {
		if (!hosts) {
			return [];
		}
		if (selectedTagIds.length === 0) {
			return hosts;
		}
		if (!hostTagsMap) {
			return hosts;
		}

		return hosts.filter((host) => {
			const tags = hostTagsMap[host.host_id] ?? [];
			const tagIds = new Set(tags.map((t) => t.id));
			return selectedTagIds.every((id) => tagIds.has(id));
		});
	}, [hosts, selectedTagIds, hostTagsMap]);

	// Only show filter bar when there are tags defined
	const showFilterBar = allTags && allTags.length > 0;

	return (
		<AppShell breadcrumbs={[{ label: "Hosts" }]}>
			{isLoading && !hosts ? (
				<HostsLoading />
			) : error && !hosts ? (
				<HostsError message={error.message} />
			) : !hosts || hosts.length === 0 ? (
				<HostsEmpty />
			) : (
				<div className="space-y-3">
					{showFilterBar && (
						<TagFilterBar tags={allTags} selected={selectedTagIds} onToggle={handleToggleTag} />
					)}
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{filteredHosts.map((host) => (
							<HostCard key={host.host_id} host={host} tags={hostTagsMap?.[host.host_id]} />
						))}
					</div>
					{filteredHosts.length === 0 && selectedTagIds.length > 0 && (
						<div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
							<p className="text-sm">No hosts match the selected tags.</p>
							<button
								type="button"
								onClick={() => setSelectedTagIds([])}
								className="mt-2 text-sm text-primary hover:underline"
							>
								Clear filters
							</button>
						</div>
					)}
				</div>
			)}
		</AppShell>
	);
}
