import type { NetInterfaceDTO } from "@bat/shared";
import {
	CircleDot,
	Container,
	EthernetPort,
	type LucideIcon,
	Network,
	Shield,
	Wifi,
} from "lucide-react";
import { IpAddressRow } from "./ip-address-row";

function interfaceIcon(iface: string): LucideIcon {
	const name = iface.toLowerCase();
	if (name === "lo" || name.startsWith("loopback")) {
		return CircleDot;
	}
	if (/^(tailscale|wg|tun|tap)/.test(name)) {
		return Shield;
	}
	if (/^(docker|br-|veth|virbr)/.test(name)) {
		return Container;
	}
	if (/^(eth|en)/.test(name)) {
		return EthernetPort;
	}
	if (/^(wl)/.test(name)) {
		return Wifi;
	}
	return Network;
}

export function HostInterfaceAddresses({
	interfaces,
}: {
	interfaces: NetInterfaceDTO[] | null | undefined;
}) {
	const rows = (interfaces ?? []).filter((entry) => entry.ipv4.length > 0 || entry.ipv6.length > 0);
	if (rows.length === 0) {
		return null;
	}

	return (
		<div className="min-w-0">
			<p className="mb-basalt-space-sm text-basalt-sm text-basalt-muted-foreground">Interfaces</p>
			<div className="space-y-basalt-space-card">
				{rows.map((entry) => {
					const InterfaceIcon = interfaceIcon(entry.iface);
					return (
						<div
							key={entry.iface}
							data-testid={`host-interface-${entry.iface}`}
							className="min-w-0"
						>
							<p className="flex items-center gap-basalt-space-xs font-mono text-basalt-xs text-basalt-foreground">
								<InterfaceIcon
									aria-hidden="true"
									className="size-basalt-icon shrink-0"
									strokeWidth={1.5}
								/>
								<span>{entry.iface}</span>
							</p>
							<div
								data-testid="host-interface-addresses"
								className="ml-8 border-l border-basalt-border/70 pl-basalt-space-sm"
							>
								{entry.ipv4.map((address) => (
									<div key={address} className="flex min-w-0 items-center gap-basalt-space-xs">
										<span className="shrink-0 font-mono text-basalt-xs text-basalt-muted-foreground">
											v4
										</span>
										<div className="min-w-0 flex-1">
											<IpAddressRow value={address} alignment="right" />
										</div>
									</div>
								))}
								{entry.ipv6.map((address) => (
									<div key={address} className="flex min-w-0 items-center gap-basalt-space-xs">
										<span className="shrink-0 font-mono text-basalt-xs text-basalt-muted-foreground">
											v6
										</span>
										<div className="min-w-0 flex-1">
											<IpAddressRow value={address} alignment="right" />
										</div>
									</div>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
