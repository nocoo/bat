// Address chips are one fixed-width line, so a long literal cannot be shown in
// full. IPv4 is short enough to keep complete; IPv6 is abbreviated in the middle
// (`2a0b:9900…ec0b`) because both the prefix and the interface identifier are
// meaningful. The full literal always stays available through the chip's title,
// aria-label and copied text.

/** Characters an address may occupy on a chip, including the ellipsis. */
export const IP_CHIP_BUDGET = 14;

const ELLIPSIS = "…";

/**
 * Middle-abbreviate an address for a single-line chip.
 *
 * - IPv4 and literals that already fit are returned unchanged.
 * - A long IPv6 keeps a head and a tail joined by one ellipsis.
 * - Either side is trimmed back to a group boundary, so the ellipsis never
 *   touches a colon (`:…` / `…:` never appear).
 *
 * The result is never longer than `budget`, its head is a prefix of the input
 * and its tail a suffix, so nothing is invented.
 */
export function abbreviateAddress(value: string, budget: number = IP_CHIP_BUDGET): string {
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
