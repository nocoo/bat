// An address literal rendered with break opportunities at its separators only.
//
// The literal is emitted as the same characters, split into segments around `:`
// and `.`, with a `<wbr>` between them: nothing is inserted, and the container's
// `overflow-wrap: anywhere` keeps an unexpected long token wrapping instead of
// clipping. Copy actions keep using the original string, never this markup.

import { Fragment, type ReactNode } from "react";
import { literalSegments } from "@/lib/ip-literal";

export function IpLiteral({ value }: { value: string }): ReactNode {
	return literalSegments(value).map((segment, index) => (
		// Positions are stable: the same literal never appears twice in one row.
		// biome-ignore lint/suspicious/noArrayIndexKey: ordered static segments.
		<Fragment key={`${index}:${segment}`}>
			{index > 0 && <wbr />}
			{segment}
		</Fragment>
	));
}
