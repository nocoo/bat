import type { HostDetailItem } from "@bat/shared";
import { IpAddressRow } from "@/components/ip-address-row";

export function HostPublicAddress({ detail }: { detail: HostDetailItem | undefined }) {
	return (
		<div className="mt-basalt-space-sm flex min-w-0 flex-col items-start gap-y-basalt-space-sm min-[90rem]:flex-row min-[90rem]:gap-x-basalt-4">
			<IpAddressRow label="IPv4" value={detail?.public_ip_v4} />
			<IpAddressRow label="IPv6" value={detail?.public_ip_v6} />
		</div>
	);
}
