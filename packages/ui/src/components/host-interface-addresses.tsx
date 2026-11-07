// Interface addresses of a host, one compact entry per interface.
//
// The addresses are what the probe saw on the interface itself: they are not
// public addresses and they are not guaranteed to be reachable. Literals wrap
// instead of truncating, so a long IPv6 stays readable.

import type { NetInterfaceDTO } from "@bat/shared";

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
				<div key={entry.iface} className="min-w-0 space-y-basalt-space-xs">
					<p className="truncate text-basalt-sm font-semibold text-basalt-foreground">
						{entry.iface}
					</p>
					<div className="flex min-w-0 flex-wrap gap-x-basalt-space-sm gap-y-basalt-space-xs">
						{[...entry.ipv4, ...entry.ipv6].map((address) => (
							<span
								key={address}
								className="min-w-0 break-all font-mono text-basalt-xs tabular-nums text-basalt-foreground"
							>
								{address}
							</span>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
