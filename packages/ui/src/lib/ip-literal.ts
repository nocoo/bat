// Address literals are shown in narrow columns, so they need line-break
// opportunities — but only at their separators: breaking an IPv6 inside a
// group (`...:123` / `4:5678`) or an IPv4 inside an octet reads as a different
// address. The renderer inserts a `<wbr>` between the segments below, and the
// container keeps `overflow-wrap: anywhere` as the fallback for a token that
// still cannot fit.

const SEGMENT = /[^:.]+[:.]*|[:.]+/g;

/**
 * Split an address literal into segments that end at a separator.
 *
 * Every character is preserved and the segments concatenate back to exactly
 * the input, so the text content (and any copy action built from the original
 * string) never gains or loses a character.
 */
export function literalSegments(value: string): string[] {
	return value.match(SEGMENT) ?? [];
}
