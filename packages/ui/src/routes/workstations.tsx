import type { WorkstationListItem } from "@bat/shared";
import { computeWorkstationStatus } from "@bat/shared";
import { Button } from "@nocoo/basalt";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { ToggleGroup, ToggleGroupItem } from "@nocoo/basalt/components/toggle-group";
import { Laptop, LayoutGrid, Table2, Terminal } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import {
	SkeletonCardGrid,
	SkeletonSummary,
	SkeletonTable,
} from "@/components/layout/page-skeleton";
import { PageSummary, type ReadingItem } from "@/components/layout/reading";
import { WorkstationCardGrid } from "@/components/workstation/workstation-card-grid";
import { WorkstationPairDialog } from "@/components/workstation/workstation-pair-dialog";
import { WorkstationSetupDialog } from "@/components/workstation/workstation-setup-dialog";
import { WorkstationTable } from "@/components/workstation/workstation-table";
import { useWorkstations } from "@/hooks";
import { chart } from "@/lib/palette";
import {
	isWorkstationsView,
	loadWorkstationsView,
	saveWorkstationsView,
	type WorkstationsView,
} from "@/lib/workstation-view";

function EmptyWorkstations() {
	return (
		<LayerCard.Body>
			<div className="flex flex-col items-center gap-basalt-space-sm py-basalt-layout-lg text-center">
				<Laptop
					aria-hidden="true"
					className="size-8 text-basalt-muted-foreground"
					strokeWidth={1}
				/>
				<p className="font-medium">No workstations enrolled</p>
				<p className="max-w-prose text-basalt-sm text-basalt-muted-foreground">
					Run the bat CLI on your laptop or desktop. The browser consent page links it to your
					account and delivers a dedicated workstation key to that machine.
				</p>
				<Button asChild={true} variant="outline" size="sm" className="mt-basalt-space-sm">
					<Link to="/setup#workstations">
						<Terminal aria-hidden="true" />
						Workstation setup
					</Link>
				</Button>
			</div>
		</LayerCard.Body>
	);
}

function summaryItems(records: readonly WorkstationListItem[], now: number): ReadingItem[] {
	const statuses = records.map((record) => computeWorkstationStatus(record, now));
	const recent = statuses.filter((status) => status === "recent").length;
	const stale = statuses.filter((status) => status === "stale").length;
	const disabled = statuses.filter((status) => status === "disabled").length;
	const targets = records.reduce(
		(total, record) => total + (record.latest_report?.connectivity.length ?? 0),
		0,
	);
	const answering = records.reduce(
		(total, record) =>
			total +
			(record.latest_report?.connectivity.filter(
				(entry) => entry.status === "reachable" || entry.status === "partial",
			).length ?? 0),
		0,
	);
	return [
		{
			label: "Workstations",
			value: String(records.length),
			detail: "enrolled machines",
			color: chart.sky,
		},
		{ label: "Reporting", value: String(recent), detail: "within 30 minutes", color: chart.green },
		{ label: "Stale", value: String(stale), detail: "no report for 30m", color: chart.amber },
		{ label: "Disabled", value: String(disabled), detail: "cannot report", color: chart.purple },
		{
			label: "Answering",
			value: targets === 0 ? "—" : `${answering}/${targets}`,
			detail: "server probes",
			color: chart.orange,
		},
	];
}

function WorkstationsViewSwitch({
	view,
	onChange,
}: {
	view: WorkstationsView;
	onChange: (view: WorkstationsView) => void;
}) {
	return (
		<ToggleGroup
			type="single"
			value={view}
			onValueChange={(next) => {
				if (isWorkstationsView(next)) onChange(next);
			}}
			aria-label="Workstations view"
		>
			<ToggleGroupItem value="table" aria-label="Table view" data-testid="workstations-view-table">
				<Table2 className="size-4" strokeWidth={1.5} aria-hidden="true" />
			</ToggleGroupItem>
			<ToggleGroupItem value="cards" aria-label="Card view" data-testid="workstations-view-cards">
				<LayoutGrid className="size-4" strokeWidth={1.5} aria-hidden="true" />
			</ToggleGroupItem>
		</ToggleGroup>
	);
}

export function WorkstationsPage() {
	const { data, error, isLoading, mutate } = useWorkstations();
	const [view, setView] = useState<WorkstationsView>(loadWorkstationsView);
	const now = Math.floor(Date.now() / 1000);
	const records = data ?? [];

	const handleViewChange = (next: WorkstationsView) => {
		setView(next);
		saveWorkstationsView(next);
	};

	if (error && data === undefined) {
		return (
			<div className="space-y-basalt-layout" data-testid="workstations-page">
				<PageHeader
					title="Workstations"
					description="Your laptops and desktops, reporting capacity and reachability from outside the fleet."
				/>
				<LayerCard>
					<LayerCard.Body className="space-y-basalt-space-md">
						<p className="text-basalt-sm text-basalt-muted-foreground">
							Could not load workstations.
						</p>
						<Button variant="outline" size="sm" onClick={() => void mutate()}>
							Try again
						</Button>
					</LayerCard.Body>
				</LayerCard>
			</div>
		);
	}

	if (isLoading && data === undefined) {
		return (
			<div className="space-y-basalt-layout" data-testid="workstations-page">
				<PageHeader
					title="Workstations"
					description="Your laptops and desktops, reporting capacity and reachability from outside the fleet."
				/>
				<SkeletonSummary />
				{view === "cards" ? (
					<SkeletonCardGrid cards={6} bars={3} />
				) : (
					<SkeletonTable rows={6} columns={7} />
				)}
			</div>
		);
	}

	return (
		<div className="space-y-basalt-layout" data-testid="workstations-page">
			<PageHeader
				title="Workstations"
				description="Your laptops and desktops, reporting capacity and reachability from outside the fleet."
				actions={
					<div className="flex items-center justify-end gap-basalt-space-md whitespace-nowrap">
						<WorkstationPairDialog />
						<WorkstationSetupDialog />
						<WorkstationsViewSwitch view={view} onChange={handleViewChange} />
					</div>
				}
			/>

			{records.length === 0 ? (
				<LayerCard data-testid="workstation-table">
					<EmptyWorkstations />
				</LayerCard>
			) : (
				<>
					<PageSummary items={summaryItems(records, now)} />
					{view === "cards" ? (
						<div className="flex flex-col gap-basalt-space-md" data-testid="workstation-card-view">
							<WorkstationCardGrid records={records} now={now} />
						</div>
					) : (
						<LayerCard data-testid="workstation-table">
							<LayerCard.Header>
								<h2>Machines</h2>
								<span className="text-basalt-sm text-basalt-muted-foreground">
									{records.length} enrolled
								</span>
							</LayerCard.Header>
							<WorkstationTable records={records} now={now} />
						</LayerCard>
					)}
					<p className="text-basalt-sm text-basalt-muted-foreground">
						Stale means no report for more than 30 minutes. It is informational and never raises a
						fleet alert.
					</p>
				</>
			)}
		</div>
	);
}
