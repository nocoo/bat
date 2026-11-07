// Machine identity and network inventory for the right rail. Everything here is
// inventory, not measurement: the values come from the latest report and stay
// absent rather than guessed when that report is missing.

import type { WorkstationRecord } from "@bat/shared";
import { DescriptionList } from "@nocoo/basalt/components/description-list";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { Laptop, Network } from "lucide-react";
import { formatTimestamp } from "@/lib/format";
import { formatMemory } from "@/lib/host-card-format";
import { formatUptime } from "@/lib/workstation-format";

export function MachinePanel({ record }: { record: WorkstationRecord }) {
	const report = record.latest_report;
	return (
		<LayerCard>
			<LayerCard.Header>
				<h2 className="flex items-center gap-basalt-space-md">
					<Laptop aria-hidden="true" className="size-4" strokeWidth={1.5} />
					Machine
				</h2>
			</LayerCard.Header>
			<LayerCard.Body>
				{report === null ? (
					<div className="space-y-basalt-space-sm">
						<p className="font-medium">No report yet</p>
						<p className="text-basalt-sm text-basalt-muted-foreground">
							Hostname, OS, capacity and interfaces appear after the first successful collection.
						</p>
					</div>
				) : (
					<DescriptionList columns={1}>
						<DescriptionList.Item term="Hostname">
							<span className="font-mono">{report.hostname}</span>
						</DescriptionList.Item>
						<DescriptionList.Item term="System">
							{report.os} · {report.arch}
						</DescriptionList.Item>
						<DescriptionList.Item term="Processor">
							{report.cpu.model} · {report.cpu.count} threads
						</DescriptionList.Item>
						<DescriptionList.Item term="Uptime">
							{formatUptime(report.uptime_seconds)}
						</DescriptionList.Item>
						<DescriptionList.Item term="Last report">
							{formatTimestamp(report.received_at)}
						</DescriptionList.Item>
						<DescriptionList.Item term="Enrolled">
							{formatTimestamp(record.created_at)}
						</DescriptionList.Item>
						<DescriptionList.Item term="Owner">
							<span className="break-all font-mono text-basalt-sm">{record.owner}</span>
						</DescriptionList.Item>
						<DescriptionList.Item term="CLI">{report.cli_version}</DescriptionList.Item>
					</DescriptionList>
				)}
			</LayerCard.Body>
		</LayerCard>
	);
}

export function NetworkPanel({ record }: { record: WorkstationRecord }) {
	const interfaces = record.latest_report?.network.interfaces ?? [];
	return (
		<LayerCard>
			<LayerCard.Header>
				<h2 className="flex items-center gap-basalt-space-md">
					<Network aria-hidden="true" className="size-4" strokeWidth={1.5} />
					Interfaces
					<span className="text-basalt-sm font-normal text-basalt-muted-foreground">
						{interfaces.length}
					</span>
				</h2>
			</LayerCard.Header>
			<LayerCard.Body>
				{interfaces.length === 0 ? (
					<p className="text-basalt-sm text-basalt-muted-foreground">
						No interface addresses reported.
					</p>
				) : (
					<ul className="max-h-52 space-y-basalt-space-md overflow-y-auto pe-basalt-space-md">
						{interfaces.map((iface) => (
							<li key={iface.name} className="space-y-basalt-space-xs">
								<p className="flex items-baseline gap-basalt-space-md font-mono text-basalt-sm font-medium">
									{iface.name}
									{iface.addresses.length === 0 && (
										<span className="font-sans text-basalt-muted-foreground">no address</span>
									)}
								</p>
								<ul className="space-y-basalt-space-xs">
									{iface.addresses.map((address) => (
										<li
											key={`${iface.name}-${address.address}`}
											className="flex items-baseline gap-basalt-space-md font-mono text-basalt-sm text-basalt-muted-foreground"
										>
											<span className="truncate">{address.address}</span>
											<span className="shrink-0 text-basalt-sm">
												v{address.family}
												{address.internal ? " · internal" : ""}
											</span>
										</li>
									))}
								</ul>
							</li>
						))}
					</ul>
				)}
			</LayerCard.Body>
		</LayerCard>
	);
}

export function memoryDetail(record: WorkstationRecord): string {
	const mem = record.latest_report?.mem;
	if (!mem) {
		return "No memory total reported.";
	}
	return `${formatMemory(mem.total_bytes - mem.available_bytes) ?? "—"} of ${formatMemory(mem.total_bytes) ?? "—"}`;
}
