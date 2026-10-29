import type { HostOverviewItem } from "@bat/shared";
import { Button } from "@nocoo/basalt";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import { AlertTriangle, Server } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { HostCard } from "@/components/host-card";
import { TagFilterBar } from "@/components/tag-filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { useAlerts, useHosts, useHostTags, useTags } from "@/hooks";
import { countOpenPublicPorts } from "@/lib/host-card-ports";

type SortKey = "name-asc" | "name-desc" | "cpu" | "mem" | "disk";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
	{ value: "name-asc", label: "Name A→Z" },
	{ value: "name-desc", label: "Name Z→A" },
	{ value: "cpu", label: "CPU ↓" },
	{ value: "mem", label: "Memory ↓" },
	{ value: "disk", label: "Disk ↓" },
];

function sortHosts(hosts: HostOverviewItem[], key: SortKey): HostOverviewItem[] {
	return [...hosts].sort((a, b) => {
		switch (key) {
			case "name-asc":
				return a.hostname.localeCompare(b.hostname);
			case "name-desc":
				return b.hostname.localeCompare(a.hostname);
			case "cpu":
				return (b.cpu_usage_pct ?? -1) - (a.cpu_usage_pct ?? -1);
			case "mem":
				return (b.mem_used_pct ?? -1) - (a.mem_used_pct ?? -1);
			case "disk":
				return (b.disk_root_used_pct ?? -1) - (a.disk_root_used_pct ?? -1);
			default:
				return 0;
		}
	});
}

function HostsLoading() {
	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
			{Array.from({ length: 6 }, (_, i) => (
				<LayerCard key={`skeleton-${i.toString()}`}>
					<LayerCard.Body className="space-y-4 py-6">
						<Skeleton className="h-5 w-32" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
					</LayerCard.Body>
				</LayerCard>
			))}
		</div>
	);
}

function HostsError({ message }: { message: string }) {
	return (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<AlertTriangle className="h-12 w-12 mb-4 text-basalt-destructive" strokeWidth={1} />
			<h2 className="text-basalt-lg font-semibold text-basalt-foreground">Failed to load hosts</h2>
			<p className="mt-2 text-basalt-base">{message}</p>
		</div>
	);
}

function HostsEmpty() {
	return (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<Server className="h-12 w-12 mb-4" strokeWidth={1} />
			<h2 className="text-basalt-lg font-semibold text-basalt-foreground">No hosts registered</h2>
			<p className="mt-2 text-basalt-base">Deploy a probe to start monitoring your servers.</p>
			<Button asChild className="mt-4">
				<Link to="/setup">Setup Guide</Link>
			</Button>
		</div>
	);
}

export function HostsPage() {
	const { data: hosts, error, isLoading } = useHosts();
	const { data: hostTagsMap } = useHostTags();
	const { data: allTags } = useTags();
	const { data: alerts } = useAlerts();
	const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
	const [sortKey, setSortKey] = useState<SortKey>("name-asc");

	const handleToggleTag = useCallback((tagId: number) => {
		setSelectedTagIds((prev) =>
			prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
		);
	}, []);

	// Filter hosts by selected tags (AND logic), then sort
	const filteredHosts = useMemo(() => {
		if (!hosts) {
			return [];
		}
		let filtered: HostOverviewItem[];
		if (selectedTagIds.length === 0 || !hostTagsMap) {
			filtered = hosts;
		} else {
			filtered = hosts.filter((host) => {
				const tags = hostTagsMap[host.host_id] ?? [];
				const tagIds = new Set(tags.map((t) => t.id));
				return selectedTagIds.every((id) => tagIds.has(id));
			});
		}
		return sortHosts(filtered, sortKey);
	}, [hosts, selectedTagIds, hostTagsMap, sortKey]);

	// Only show filter bar when there are tags defined
	const showFilterBar = allTags && allTags.length > 0;

	return isLoading && !hosts ? (
		<HostsLoading />
	) : error && !hosts ? (
		<HostsError message={error.message} />
	) : !hosts || hosts.length === 0 ? (
		<HostsEmpty />
	) : (
		<div className="space-y-basalt-layout">
			<PageHeader
				title="Hosts"
				description="Monitored servers and real-time infrastructure status."
				actions={
					<Select value={sortKey} onValueChange={(value) => setSortKey(value as SortKey)}>
						<SelectTrigger aria-label="Sort hosts">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SORT_OPTIONS.map((opt) => (
								<SelectItem key={opt.value} value={opt.value}>
									{opt.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				}
				filters={
					showFilterBar ? (
						<TagFilterBar tags={allTags} selected={selectedTagIds} onToggle={handleToggleTag} />
					) : null
				}
			/>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{filteredHosts.map((host, index) => (
					<div
						key={host.host_id}
						className="animate-fade-up"
						style={{ animationDelay: `${index * 60}ms` }}
					>
						<HostCard
							host={host}
							tags={hostTagsMap?.[host.host_id]}
							openPublicPorts={countOpenPublicPorts(alerts, host.host_id)}
						/>
					</div>
				))}
			</div>
			{filteredHosts.length === 0 && selectedTagIds.length > 0 && (
				<div className="flex flex-col items-center justify-center py-12 text-basalt-muted-foreground">
					<p className="text-basalt-base">No hosts match the selected tags.</p>
					<Button variant="link" onClick={() => setSelectedTagIds([])} className="mt-2">
						Clear filters
					</Button>
				</div>
			)}
		</div>
	);
}
