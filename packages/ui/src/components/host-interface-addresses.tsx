import type { NetInterfaceDTO } from "@bat/shared";
import { IpAddressRow } from "@/components/ip-address-row";

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
				<div key={entry.iface} data-testid={`host-interface-${entry.iface}`} className="min-w-0">
					<p className="font-mono text-basalt-xs text-basalt-muted-foreground">{entry.iface}</p>
					<div className="ml-basalt-space-lg space-y-0">
						{[...entry.ipv4, ...entry.ipv6].map((address) => (
							<IpAddressRow key={address} value={address} />
						))}
					</div>
				</div>
			))}
		</div>
	);
}
