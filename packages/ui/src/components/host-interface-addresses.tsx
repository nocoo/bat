// Interface addresses of a host: one chip per literal, one literal per line.
//
// The chips are full width inside the card, so they share one width and never
// run together; the interface name sits above its chips as a small label. Only
// the families that were observed appear, and a chip abbreviates a long IPv6 in
// the middle while keeping the full literal for copy and hover.

import type { NetInterfaceDTO } from "@bat/shared";
import { IpAddressChip } from "@/components/ip-address-chip";

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
		<div className="min-w-0 space-y-basalt-space-sm">
			<p className="text-basalt-sm text-basalt-muted-foreground">Interfaces</p>
			{rows.map((entry) => (
				<div
					key={entry.iface}
					data-testid={`host-interface-${entry.iface}`}
					className="min-w-0 space-y-basalt-space-xs"
				>
					<p className="text-basalt-sm text-basalt-muted-foreground">{entry.iface}</p>
					<div className="space-y-basalt-space-xs">
						{[...entry.ipv4, ...entry.ipv6].map((address) => (
							<IpAddressChip key={address} value={address} />
						))}
					</div>
				</div>
			))}
		</div>
	);
}
