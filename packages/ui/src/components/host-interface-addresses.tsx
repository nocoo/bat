// Interface addresses of a host, one row per interface.
//
// The rows use the same anatomy as the Public IPv4/IPv6 rows in the same card:
// the interface name on the left, its literals right-aligned in monospace. A
// middle dot separates the literals so their count and boundaries stay legible;
// each literal wraps at its own separators inside the column instead of
// truncating. Only families that were observed appear in the row.

import type { NetInterfaceDTO } from "@bat/shared";
import { Fragment } from "react";
import { IpLiteral } from "@/components/ip-literal";

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
						className="min-w-0 wrap-anywhere text-right font-mono tabular-nums"
					>
						{[...entry.ipv4, ...entry.ipv6].map((address, index) => (
							<Fragment key={address}>
								{index > 0 && <span className="text-basalt-muted-foreground"> · </span>}
								<span className="wrap-anywhere">
									<IpLiteral value={address} />
								</span>
							</Fragment>
						))}
					</span>
				</div>
			))}
		</div>
	);
}
