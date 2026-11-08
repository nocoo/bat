// The address row shows every IPv6 in one fixed short form: the first two
// groups, an ellipsis and the last group — `2a0b:9900…232d`. Two groups of
// four hex digits plus the ellipsis plus one group of four digits is 14
// characters, so the row keeps the same content at every column width and
// never depends on a measured width. IPv4 keeps its complete literal.

/** Characters the short IPv6 form occupies: head, ellipsis and tail. */
export const IP_ADDRESS_BUDGET = 14;

const ELLIPSIS = "…";

/**
 * Shorten an address for the address row.
 *
 * - IPv4 stays complete.
 * - An IPv6 keeps its first two groups and its last group, joined by one
 *   ellipsis: `2a0b:9900…232d`.
 * - The tail is the literal's last group and is never cut; the head is the
 *   literal's first two groups, so the compression marker of a `::` literal is
 *   normalised away.
 * - A literal with fewer than three groups is already short and stays whole.
 */
export function abbreviateAddress(value: string): string {
	if (!value.includes(":")) {
		return value;
	}

	const groups = value.split(":").filter((group) => group.length > 0);
	if (groups.length < 3) {
		return value;
	}

	const tail = groups[groups.length - 1];
	let head = `${groups[0]}:${groups[1]}`;
	if (head.length + ELLIPSIS.length + tail.length > IP_ADDRESS_BUDGET) {
		head = groups[0];
	}
	return `${head}${ELLIPSIS}${tail}`;
}
