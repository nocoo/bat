// Per-family public addresses.
//
// The legacy `public_ip` column holds one address of unknown provenance, so it
// may contain junk. A family column is trusted only when it holds a literal of
// that family; otherwise the legacy value is used, and only when it parses as
// that family. An invalid legacy value therefore never surfaces and never wins
// the preferred slot.
//
// The parsers are the shared ones, so the Worker never re-implements address
// grammar.

import { isIpv4, isIpv6 } from "@bat/shared";

export interface StoredPublicAddresses {
	/** The legacy single-column address: preferred family, unknown provenance. */
	public_ip: string | null;
	/** The stored IPv4 family value, if the probe reported one. */
	public_ip_v4: string | null;
	/** The stored IPv6 family value, if the probe reported one. */
	public_ip_v6: string | null;
}

export interface ResolvedPublicAddresses {
	/** The preferred address: IPv4 first, then IPv6. */
	public_ip: string | null;
	public_ip_v4: string | null;
	public_ip_v6: string | null;
}

export type PublicAddressFamily = "v4" | "v6";

/** Keep a value only when it is a literal of the given family. */
export function publicAddressLiteral(
	value: string | null | undefined,
	family: PublicAddressFamily,
): string | null {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	const matches = family === "v4" ? isIpv4 : isIpv6;
	return matches(value) ? value : null;
}

/**
 * Resolve the stored columns into the per-family addresses to expose.
 *
 * Each family prefers its own stored column and falls back to the legacy value
 * only when that value parses as the same family. The preferred address is the
 * IPv4 value when present, otherwise the IPv6 one.
 */
export function resolvePublicAddresses(stored: StoredPublicAddresses): ResolvedPublicAddresses {
	const legacy = stored.public_ip;
	const v4 = publicAddressLiteral(stored.public_ip_v4, "v4") ?? publicAddressLiteral(legacy, "v4");
	const v6 = publicAddressLiteral(stored.public_ip_v6, "v6") ?? publicAddressLiteral(legacy, "v6");
	return { public_ip: v4 ?? v6, public_ip_v4: v4, public_ip_v6: v6 };
}
