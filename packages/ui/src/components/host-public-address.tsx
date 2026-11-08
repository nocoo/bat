import type { HostDetailItem } from "@bat/shared";
import { IpAddressRow } from "@/components/ip-address-row";

export function HostPublicAddress({ detail }: { detail: HostDetailItem | undefined }) {
	return (
		<div className="mt-basalt-space-xs flex min-w-0 flex-wrap items-start gap-x-basalt-layout gap-y-basalt-space-xs lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-basalt-space-sm">
			<IpAddressRow label="IPv4" value={detail?.public_ip_v4} />
			<IpAddressRow label="IPv6" value={detail?.public_ip_v6} />
		</div>
	);
}
