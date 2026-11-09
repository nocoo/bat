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
import { ToggleGroup, ToggleGroupItem } from "@nocoo/basalt/components/toggle-group";
import { AlertTriangle, LayoutGrid, Server, Table2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import { FleetCostTotal } from "@/components/host/fleet-cost-total";
import { HostCardGrid } from "@/components/host/host-card-grid";
import { HostTable } from "@/components/host/host-table";
import { SkeletonSummary, SkeletonTable } from "@/components/layout/page-skeleton";
import { PageSummary, type ReadingItem } from "@/components/layout/reading";
import { TagFilterBar } from "@/components/tag-filter-bar";
import { useHosts, useHostTags, useTags } from "@/hooks";
import { type HostsView, isHostsView, loadHostsView, saveHostsView } from "@/lib/host-view";
import { chart } from "@/lib/palette";

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

function HostsError({ message }: { message: string }) {
	return (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<AlertTriangle className="mb-4 h-12 w-12 text-basalt-destructive" strokeWidth={1} />
			<h2 className="text-basalt-xl font-semibold text-basalt-foreground">Failed to load hosts</h2>
			<p className="mt-2 text-basalt-base">{message}</p>
		</div>
	);
}

function HostsEmpty() {
	return (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<Server className="mb-4 h-12 w-12" strokeWidth={1} />
			<h2 className="text-basalt-xl font-semibold text-basalt-foreground">No hosts registered</h2>
			<p className="mt-2 text-basalt-base">Deploy a probe to start monitoring your servers.</p>
			<Button asChild={true} className="mt-4">
				<Link to="/setup">Setup Guide</Link>
			</Button>
		</div>
	);
}

function summaryItems(hosts: readonly HostOverviewItem[]): ReadingItem[] {
	const healthy = hosts.filter((host) => host.status === "healthy").length;
	const degraded = hosts.filter(
		(host) => host.status === "warning" || host.status === "critical",
	).length;
	const offline = hosts.filter((host) => host.status === "offline").length;
	const alerts = hosts.reduce((total, host) => total + host.alert_count, 0);
	return [
		{
			label: "Servers",
			value: String(hosts.length),
			detail: "registered probes",
			color: chart.sky,
		},
		{ label: "Healthy", value: String(healthy), detail: "reporting normally", color: chart.green },
		{
			label: "Degraded",
			value: String(degraded),
			detail: "warning or critical",
			color: chart.amber,
		},
		{ label: "Offline", value: String(offline), detail: "no recent report", color: chart.red },
		{
			label: "Open alerts",
			value: String(alerts),
			detail: "across the fleet",
			color: chart.orange,
		},
	];
}

/** The table / cards switch for the hosts list. */
function HostsViewSwitch({
	view,
	onChange,
}: {
	view: HostsView;
	onChange: (view: HostsView) => void;
}) {
	return (
		<ToggleGroup
			type="single"
			value={view}
			onValueChange={(next) => {
				// A single-toggle group can also be deselected; keep a view chosen.
				if (isHostsView(next)) onChange(next);
			}}
			aria-label="Hosts view"
		>
			<ToggleGroupItem value="table" aria-label="Table view" data-testid="hosts-view-table">
				<Table2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
			</ToggleGroupItem>
			<ToggleGroupItem value="cards" aria-label="Card view" data-testid="hosts-view-cards">
				<LayoutGrid className="size-4" strokeWidth={1.5} aria-hidden="true" />
			</ToggleGroupItem>
		</ToggleGroup>
	);
}

export function HostsPage() {
	const { data: hosts, error, isLoading } = useHosts();
	const { data: hostTagsMap } = useHostTags();
	const { data: allTags } = useTags();
	const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
	const [sortKey, setSortKey] = useState<SortKey>("name-asc");
	const [view, setView] = useState<HostsView>(loadHostsView);

	const handleToggleTag = useCallback((tagId: number) => {
		setSelectedTagIds((prev) =>
			prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
		);
	}, []);

	const handleViewChange = useCallback((next: HostsView) => {
		setView(next);
		saveHostsView(next);
	}, []);

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

	const showFilterBar = allTags && allTags.length > 0;
	const now = Math.floor(Date.now() / 1000);

	return isLoading && !hosts ? (
		<div className="space-y-basalt-layout" data-testid="hosts-page">
			<PageHeader
				title="Hosts"
				description="Monitored servers and real-time infrastructure status."
			/>
			<SkeletonSummary />
			<SkeletonTable rows={8} columns={7} />
		</div>
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
					<div className="flex flex-wrap items-center gap-basalt-space-lg">
						<HostsViewSwitch view={view} onChange={handleViewChange} />
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
					</div>
				}
				filters={
					showFilterBar ? (
						<TagFilterBar tags={allTags} selected={selectedTagIds} onToggle={handleToggleTag} />
					) : null
				}
			/>

			<PageSummary items={summaryItems(filteredHosts)} />

			<LayerCard data-testid="host-list">
				<LayerCard.Header>
					<h2>Servers</h2>
					<span className="text-basalt-sm text-basalt-muted-foreground">
						{filteredHosts.length} of {hosts.length}
						{selectedTagIds.length > 0 ? " · filtered by tags" : ""}
					</span>
				</LayerCard.Header>
				{filteredHosts.length === 0 ? (
					<LayerCard.Body className="space-y-basalt-space-md">
						<p className="text-basalt-sm text-basalt-muted-foreground">
							No hosts match the selected tags.
						</p>
						<Button variant="outline" size="sm" onClick={() => setSelectedTagIds([])}>
							Clear filters
						</Button>
					</LayerCard.Body>
				) : view === "cards" ? (
					<div className="flex flex-col gap-basalt-layout-sm">
						<HostCardGrid
							hosts={filteredHosts}
							tagsFor={(hostId) => hostTagsMap?.[hostId]}
							now={now}
						/>
						<div className="flex justify-end" data-testid="host-card-footer">
							<FleetCostTotal hosts={filteredHosts} />
						</div>
					</div>
				) : (
					<HostTable hosts={filteredHosts} tagsFor={(hostId) => hostTagsMap?.[hostId]} now={now} />
				)}
			</LayerCard>
		</div>
	);
}
