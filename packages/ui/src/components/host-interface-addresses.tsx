// Interface addresses of a host, one row per interface.
//
// The rows use the same anatomy as the Public IPv4/IPv6 rows in the same card:
// the interface name on the left, its literals right-aligned in monospace. A
// long literal wraps inside the column instead of truncating, so the card stays
// one readable list at rail width.

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
		<div className="min-w-0 space-y-basalt-space-xs">
			<p className="text-basalt-sm text-basalt-muted-foreground">Interfaces</p>
			{rows.map((entry) => (
				<div
					key={entry.iface}
					data-testid={`host-interface-${entry.iface}`}
					className="flex min-w-0 justify-between gap-basalt-space-sm text-basalt-base"
				>
					<span className="shrink-0 text-basalt-muted-foreground">{entry.iface}</span>
					<span
						data-testid={`host-interface-addresses-${entry.iface}`}
						className="flex min-w-0 flex-wrap justify-end gap-x-basalt-space-sm text-right font-mono tabular-nums"
					>
						{[...entry.ipv4, ...entry.ipv6].map((address) => (
							<span key={address} className="min-w-0 break-all">
								{address}
							</span>
						))}
					</span>
				</div>
			))}
		</div>
	);
}
