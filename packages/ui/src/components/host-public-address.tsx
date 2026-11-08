// The public address of a host: one chip per family, stacked and equal width.
//
// The families are independent observations; a family that was never observed
// stays visible as a disabled chip so its absence is explicit.

import type { HostDetailItem } from "@bat/shared";
import { IpAddressChip } from "@/components/ip-address-chip";

export function HostPublicAddress({ detail }: { detail: HostDetailItem | undefined }) {
	return (
		<div className="mt-basalt-space-xs grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-basalt-space-sm gap-y-basalt-space-xs">
			<span className="text-basalt-xs font-semibold text-basalt-muted-foreground">IPv4</span>
			<IpAddressChip value={detail?.public_ip_v4 ?? null} />
			<span className="text-basalt-xs font-semibold text-basalt-muted-foreground">IPv6</span>
			<IpAddressChip value={detail?.public_ip_v6 ?? null} />
		</div>
	);
}
