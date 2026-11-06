import type { WorkstationConnectivityHistory, WorkstationMetricPoint } from "@bat/shared";
import { Button } from "@nocoo/basalt";
import { LineChart } from "@nocoo/basalt/charts/line";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import { Skeleton } from "@/components/ui/skeleton";
import { connectivityHistoryLoss } from "@/lib/workstation-format";

interface ResourcePoint {
	x: number;
	cpu: number | null;
	mem: number | null;
}

interface ConnectivityPoint {
	x: number;
	rtt: number | null;
	loss: number | null;
}

function chartTime(value: string | number, windowSeconds: number): string {
	const date = new Date(Number(value));
	if (Number.isNaN(date.getTime())) {
		return "—";
	}
	return date.toLocaleString(undefined, {
		...(windowSeconds <= 21600
			? { hour: "2-digit", minute: "2-digit" }
			: { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
	});
}

function EmptyChart({ message }: { message: string }) {
	return (
		<div className="flex h-36 items-center justify-center rounded-basalt-md bg-basalt-bright text-basalt-sm text-basalt-muted-foreground">
			{message}
		</div>
	);
}

export function WorkstationHistory({
	metrics,
	connectivity,
	windowLabel,
	windowSeconds,
	limit,
	serverName,
	selectedServerId,
	onSelectServer,
	historyNote,
	canLoadOlder,
	onLoadOlder,
	loadingOlder,
	loading,
	metricsError,
	connectivityError,
}: {
	metrics: WorkstationMetricPoint[];
	connectivity: WorkstationConnectivityHistory[];
	windowLabel: string;
	windowSeconds: number;
	limit: number;
	serverName: (serverId: string) => string;
	selectedServerId: string | null;
	onSelectServer: (serverId: string) => void;
	historyNote: string | null;
	canLoadOlder: boolean;
	onLoadOlder: () => void;
	loadingOlder: boolean;
	loading: boolean;
	metricsError: boolean;
	connectivityError: boolean;
}) {
	const resourceData: ResourcePoint[] = metrics.map((point) => ({
		x: point.received_at * 1000,
		cpu: point.cpu_usage_pct,
		mem: point.mem_used_pct,
	}));
	const selected =
		connectivity.find((target) => target.server_id === selectedServerId) ?? connectivity[0];
	const connectivityData: ConnectivityPoint[] =
		selected?.data.map((point) => ({
			x: point.received_at * 1000,
			rtt: point.rtt_avg_ms,
			loss: connectivityHistoryLoss(point),
		})) ?? [];

	return (
		<LayerCard data-testid="workstation-history">
			<LayerCard.Header>
				<h2>History</h2>
			</LayerCard.Header>
			<LayerCard.Body className="space-y-basalt-layout">
				<p className="text-basalt-sm text-basalt-muted-foreground">
					Each point is one report sample at its receipt time, not a ten-minute average.
				</p>
				{historyNote !== null && (
					<p className="text-basalt-sm text-basalt-muted-foreground">{historyNote}</p>
				)}
				{canLoadOlder && (
					<div>
						<Button variant="outline" size="sm" onClick={onLoadOlder} disabled={loadingOlder}>
							{loadingOlder ? "Loading older samples…" : "Load 100 older samples"}
						</Button>
					</div>
				)}

				<section className="space-y-basalt-space-lg" aria-label="CPU and memory history">
					<div className="flex flex-wrap items-baseline justify-between gap-x-basalt-space-lg gap-y-basalt-space-sm">
						<h3 className="text-basalt-sm font-semibold">CPU and memory</h3>
						<span className="text-basalt-sm text-basalt-muted-foreground">{windowLabel}</span>
					</div>
					{loading ? (
						<Skeleton className="h-56 w-full" />
					) : metricsError ? (
						<EmptyChart message="Could not load metric history. Try again later." />
					) : resourceData.length === 0 ? (
						<EmptyChart message="No metric samples in this window." />
					) : (
						<LineChart
							data={resourceData}
							series={[
								{ key: "cpu", label: "CPU" },
								{ key: "mem", label: "Memory" },
							]}
							ariaLabel="Workstation CPU and memory history"
							className="h-56 w-full"
							showAxes={true}
							showLegend={true}
							yDomain={[0, 100]}
							valueFormatter={(value) => `${Math.round(value * 10) / 10}%`}
							xValueFormatter={(value) => chartTime(value, windowSeconds)}
							summary={`CPU and memory percentages for the ${windowLabel} window. Null samples are gaps, not zero.`}
						/>
					)}
				</section>

				<section className="space-y-basalt-space-lg" aria-label="Target connectivity history">
					<div className="flex flex-wrap items-baseline justify-between gap-x-basalt-space-lg gap-y-basalt-space-sm">
						<h3 className="text-basalt-sm font-semibold">Target connectivity</h3>
						<span className="text-basalt-sm text-basalt-muted-foreground">
							Newest {limit} samples per target
						</span>
					</div>
					{loading ? (
						<Skeleton className="h-40 w-full" />
					) : connectivityError ? (
						<EmptyChart message="Could not load connectivity history. Try again later." />
					) : connectivity.length === 0 ? (
						<EmptyChart message="No connectivity samples in this window." />
					) : (
						<>
							<Select value={selected?.server_id ?? ""} onValueChange={onSelectServer}>
								<SelectTrigger aria-label="Connectivity target">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{connectivity.map((target) => (
										<SelectItem key={target.server_id} value={target.server_id}>
											{serverName(target.server_id)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{connectivityData.length === 0 ? (
								<EmptyChart message="This target has no samples in the window." />
							) : (
								<div className="grid gap-basalt-layout lg:grid-cols-2">
									<div className="space-y-basalt-space-sm">
										<span className="text-basalt-sm font-medium">RTT average</span>
										<LineChart
											data={connectivityData}
											series={[{ key: "rtt", label: "RTT average" }]}
											ariaLabel="Selected target round-trip time history"
											className="h-40 w-full"
											showAxes={true}
											showLegend={true}
											yDomain={[0, "auto"]}
											valueFormatter={(value) => `${Math.round(value * 10) / 10} ms`}
											xValueFormatter={(value) => chartTime(value, windowSeconds)}
											summary="Round-trip time per report. Null samples are gaps because that probe did not answer."
										/>
									</div>
									<div className="space-y-basalt-space-sm">
										<span className="text-basalt-sm font-medium">Packet loss</span>
										<LineChart
											data={connectivityData}
											series={[{ key: "loss", label: "Packet loss" }]}
											ariaLabel="Selected target packet loss history"
											className="h-40 w-full"
											showAxes={true}
											showLegend={true}
											yDomain={[0, 100]}
											valueFormatter={(value) => `${Math.round(value * 10) / 10}%`}
											xValueFormatter={(value) => chartTime(value, windowSeconds)}
											summary="Packet loss per report from the three sent pings."
										/>
									</div>
								</div>
							)}
						</>
					)}
				</section>
			</LayerCard.Body>
		</LayerCard>
	);
}
