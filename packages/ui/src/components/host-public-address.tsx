// The public address of a host, one row per address family.
//
// The families are independent observations: a host that only has IPv4 still
// shows an IPv6 row with a muted dash, so an absent observation is visible
// instead of silently missing. The preferred address stays on the host row for
// the list views; this block is the per-family view.

import type { HostDetailItem } from "@bat/shared";
import { CopyableAddress } from "@/components/workstation/copyable-address";

export function HostPublicAddress({ detail }: { detail: HostDetailItem | undefined }) {
	return (
		<div className="mt-basalt-space-xs space-y-basalt-space-xs">
			<CopyableAddress
				label="IPv4"
				value={detail?.public_ip_v4 ?? null}
				emptyText="—"
				sizeClassName="text-basalt-base"
				testId="host-public-ip-v4"
				iconOnly
			/>
			<CopyableAddress
				label="IPv6"
				value={detail?.public_ip_v6 ?? null}
				emptyText="—"
				sizeClassName="text-basalt-base"
				testId="host-public-ip-v6"
				iconOnly
			/>
		</div>
	);
}
