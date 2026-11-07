import type { WorkstationRecord } from "@bat/shared";
import { computeWorkstationStatus, hashHostId, WORKSTATION_PING_COUNT } from "@bat/shared";
import { Button } from "@nocoo/basalt";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "@/api";
import {
	SkeletonChartCard,
	SkeletonHeaderCard,
	SkeletonRail,
} from "@/components/layout/page-skeleton";
import { CapacityChart } from "@/components/workstation/capacity-chart";
import { DetailHeader, rangeWindowLabel } from "@/components/workstation/detail-header";
import { MachinePanel, NetworkPanel } from "@/components/workstation/machine-panel";
import { ReachabilityChart } from "@/components/workstation/reachability-chart";
import { ReachabilityMixCard } from "@/components/workstation/reachability-mix-card";
import { TargetTable } from "@/components/workstation/target-table";
import { TopologyGraph } from "@/components/workstation/topology-graph";
import { UtilizationCard } from "@/components/workstation/utilization-card";
import { WorkstationDeleteDialog } from "@/components/workstation-delete-dialog";
import {
	useHosts,
	useWorkstation,
	useWorkstationConnectivity,
	useWorkstationMetricsPages,
} from "@/hooks";
import { formatMemory } from "@/lib/host-card-format";
import { buildTargetRows, capacitySeries, statusMix } from "@/lib/workstation-detail";
import { rootDiskUsedPct, workstationCollectionErrors } from "@/lib/workstation-format";

function WorkstationNotFound({ id }: { id: string }) {
	return (
		<div className="space-y-basalt-layout">
			<PageHeader
				title="Workstation not found"
				description="This workstation was deleted or is no longer available."
			/>
			<p className="font-mono text-basalt-sm text-basalt-muted-foreground">{id}</p>
			<Button asChild={true} variant="outline">
				<Link to="/workstations">
					<ArrowLeft aria-hidden="true" />
					Back to workstations
				</Link>
			</Button>
		</div>
	);
}

function WorkstationDetailBody({ record }: { record: WorkstationRecord }) {
	const [rangeSeconds, setRangeSeconds] = useState<number>(86_400);
	const [focusedServerId, setFocusedServerId] = useState<string | null>(null);
	const now = Math.floor(Date.now() / 1000 / 60) * 60;
	const from = now - rangeSeconds;
	const windowLabel = rangeWindowLabel(rangeSeconds);

	const { data: hosts } = useHosts();
	const metricsPages = useWorkstationMetricsPages(record.id, from, now);
	const connectivity = useWorkstationConnectivity(record.id, from, now, 100);

	const report = record.latest_report;
	const status = computeWorkstationStatus(record, now);
	const serverName = (serverId: string) =>
		hosts?.find((host) => host.host_id === serverId)?.hostname ?? hashHostId(serverId);
	const rows = buildTargetRows({
		history: connectivity.data?.targets ?? [],
		latest: report?.connectivity ?? [],
		serverName,
	});
	const capacity = capacitySeries(metricsPages.metrics);
	const mix = statusMix(rows);
	const errors = workstationCollectionErrors(record);
	const rootDisk = rootDiskUsedPct(report);
	const memory = report?.mem ?? null;
	const rootDiskDetail =
		report === null || report.disk.length === 0
			? "No disk reported"
			: `${formatMemory(report.disk[0]?.available_bytes ?? 0) ?? "—"} free`;

	return (
		<div className="space-y-basalt-layout" data-testid="workstation-detail">
			<DetailHeader
				record={record}
				status={status}
				now={now}
				rangeSeconds={rangeSeconds}
				onRangeChange={setRangeSeconds}
				capacity={capacity}
				rows={rows}
				actions={<WorkstationDeleteDialog key={record.id} workstation={record} />}
			/>

			{report !== null && (report.targets_error !== null || errors.length > 0) && (
				<LayerCard data-testid="workstation-report-errors">
					<LayerCard.Header>
						<h2 className="flex items-center gap-basalt-space-md text-basalt-warning">
							<AlertTriangle aria-hidden="true" className="size-4" strokeWidth={1.5} />
							Collection problems
						</h2>
					</LayerCard.Header>
					<LayerCard.Body className="space-y-basalt-space-sm text-basalt-sm">
						{report.targets_error !== null && (
							<p>
								<span className="font-medium">Target discovery:</span> {report.targets_error}
							</p>
						)}
						{errors.map((error) => (
							<p key={error} className="text-basalt-muted-foreground">
								{error}
							</p>
						))}
					</LayerCard.Body>
				</LayerCard>
			)}

			<div className="grid min-w-0 gap-basalt-layout xl:grid-cols-[minmax(0,1fr)_19rem]">
				<div className="min-w-0 space-y-basalt-layout">
					<LayerCard>
						<LayerCard.Header>
							<h2>Load</h2>
							<span className="text-basalt-sm text-basalt-muted-foreground">
								{windowLabel} · {capacity.length} samples
							</span>
						</LayerCard.Header>
						<LayerCard.Body className="space-y-basalt-layout">
							<CapacityChart
								points={capacity}
								windowSeconds={rangeSeconds}
								windowLabel={windowLabel}
								loading={metricsPages.isLoading}
								error={metricsPages.error !== undefined && capacity.length === 0}
								onRetry={() => void metricsPages.mutate?.()}
							/>
							{metricsPages.hasOlder && (
								<Button
									variant="outline"
									size="sm"
									onClick={metricsPages.loadOlder}
									disabled={metricsPages.isLoadingOlder}
								>
									{metricsPages.isLoadingOlder
										? "Loading older samples…"
										: "Load 100 older samples"}
								</Button>
							)}
						</LayerCard.Body>
					</LayerCard>

					<LayerCard>
						<LayerCard.Header>
							<h2>Reachability</h2>
							<span className="text-basalt-sm text-basalt-muted-foreground">
								{WORKSTATION_PING_COUNT} probes each · newest {connectivity.data?.limit ?? 100}{" "}
								samples
							</span>
						</LayerCard.Header>
						<LayerCard.Body>
							<ReachabilityChart
								rows={rows}
								windowSeconds={rangeSeconds}
								windowLabel={windowLabel}
								focusedServerId={focusedServerId}
								onFocus={(serverId) =>
									setFocusedServerId((current) => (current === serverId ? null : serverId))
								}
								loading={connectivity.isLoading}
								error={connectivity.error !== undefined && rows.length === 0}
								onRetry={() => void connectivity.mutate?.()}
							/>
						</LayerCard.Body>
					</LayerCard>
					<LayerCard data-testid="workstation-targets">
						<LayerCard.Header>
							<h2>Targets</h2>
							<span className="text-basalt-sm text-basalt-muted-foreground">
								Unreachable or timeout is a reachability result, not an application-health verdict.
							</span>
						</LayerCard.Header>
						{rows.length === 0 ? (
							<LayerCard.Body>
								<p className="text-basalt-sm text-basalt-muted-foreground">
									No connectivity targets in the latest report.
								</p>
							</LayerCard.Body>
						) : (
							<TargetTable rows={rows} />
						)}
					</LayerCard>
				</div>

				<div className="min-w-0 space-y-basalt-layout">
					<MachinePanel record={record} />
					<UtilizationCard
						cpu={report?.cpu.usage_pct ?? null}
						memory={memory?.used_pct ?? null}
						disk={rootDisk}
						cpuDetail={report === null ? "No report" : `${report.cpu.count} threads`}
						memoryDetail={
							memory === null ? "No report" : `${formatMemory(memory.total_bytes) ?? "—"} total`
						}
						diskDetail={rootDiskDetail}
					/>
					<ReachabilityMixCard slices={mix} targets={rows.length} />
					<NetworkPanel record={record} />
				</div>
			</div>

			<LayerCard data-testid="workstation-topology">
				<LayerCard.Header>
					<h2>Topology</h2>
					<span className="text-basalt-sm text-basalt-muted-foreground">
						A pulse means the probe answered; a dashed link means it did not.
					</span>
				</LayerCard.Header>
				<LayerCard.Body>
					{rows.length === 0 ? (
						<p className="text-basalt-sm text-basalt-muted-foreground">
							No connectivity targets in the latest report.
						</p>
					) : (
						<TopologyGraph
							name={record.name}
							detail={record.public_ip ?? "no public address"}
							rows={rows}
							focusedServerId={focusedServerId}
							onFocus={(serverId) =>
								setFocusedServerId((current) => (current === serverId ? null : serverId))
							}
						/>
					)}
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}

export function WorkstationDetailPage() {
	const params = useParams<{ id: string }>();
	const id = params.id ?? "";
	const { data: record, error, mutate } = useWorkstation(id);

	if (error && !record) {
		return error instanceof ApiError && error.status === 404 ? (
			<WorkstationNotFound id={id} />
		) : (
			<div className="space-y-basalt-layout">
				<PageHeader
					title="Workstation unavailable"
					description="The workstation detail could not be loaded."
				/>
				<Button variant="outline" onClick={() => void mutate()}>
					Try again
				</Button>
			</div>
		);
	}

	if (!record) {
		return (
			<div className="space-y-basalt-layout">
				<SkeletonHeaderCard />
				<div className="grid gap-basalt-layout xl:grid-cols-[minmax(0,1fr)_19rem]">
					<div className="min-w-0 space-y-basalt-layout">
						<SkeletonChartCard />
						<SkeletonChartCard height="h-72" />
					</div>
					<div className="min-w-0 space-y-basalt-layout">
						<SkeletonRail cards={3} />
					</div>
				</div>
			</div>
		);
	}

	return <WorkstationDetailBody record={record} />;
}
