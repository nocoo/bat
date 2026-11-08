// Fixed character budget for the address row. A 39-character IPv6 literal
// remains complete; longer literals keep the prefix and suffix visible.

export const IP_ADDRESS_BUDGET = 39;

const ELLIPSIS = "…";

/**
 * Middle-abbreviate an address for a single-line address row.
 *
 * - IPv4 and literals that already fit are returned unchanged.
 * - A long IPv6 keeps a head and a tail joined by one ellipsis.
 * - Either side is trimmed back to a group boundary, so the ellipsis never
 *   touches a colon (`:…` / `…:` never appear).
 *
 * The result is never longer than `budget`, its head is a prefix of the input
 * and its tail a suffix, so nothing is invented.
 */
export function abbreviateAddress(value: string, budget: number = IP_ADDRESS_BUDGET): string {
	if (!value.includes(":") || value.length <= budget) {
		return value;
	}

	const room = budget - ELLIPSIS.length;
	if (room < 2) {
		return ELLIPSIS;
	}

	// The head carries the network prefix and reads better with a little more room.
	const headRoom = Math.ceil((room * 2) / 3);
	const tailRoom = room - headRoom;

	const head = value.slice(0, headRoom).replace(/:+$/, "");
	const tail = value.slice(value.length - tailRoom).replace(/^:+/, "");

	return `${head}${ELLIPSIS}${tail}`;
}
