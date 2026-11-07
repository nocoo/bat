// A public address with an explicit copy control and visible feedback. The
// clipboard is optional in embedded browsers, so a refused copy says so instead
// of pretending it worked.
//
// The address never truncates: it wraps inside the available width at its own
// separators, so a long IPv6 literal stays readable and fully selectable while
// remaining one exact address. Callers that render it in a narrow column cap
// the type size instead of clipping the value.

import { Button } from "@nocoo/basalt";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { IpLiteral } from "@/components/ip-literal";

type CopyState = "idle" | "copied" | "failed";

export interface CopyableAddressProps {
	/** The address to show and copy. `null` renders the empty state. */
	value: string | null;
	/** Small leading label, e.g. the address family ("IPv4"). */
	label?: string;
	/** Text shown when no address was observed. */
	emptyText?: string;
	/** Test id of the address element. */
	testId?: string;
	/** Font size class for the address. */
	sizeClassName?: string;
	/** Show the copy control as an icon only, without the text label. */
	iconOnly?: boolean;
}

export function CopyableAddress({
	value,
	label,
	emptyText = "No public IP observed",
	testId = "workstation-public-ip",
	sizeClassName = "text-basalt-xl",
	iconOnly = false,
}: CopyableAddressProps) {
	const [state, setState] = useState<CopyState>("idle");

	useEffect(() => {
		if (state === "idle") {
			return;
		}
		const timer = setTimeout(() => setState("idle"), 2000);
		return () => clearTimeout(timer);
	}, [state]);

	async function copy() {
		if (value === null) {
			return;
		}
		try {
			await navigator.clipboard.writeText(value);
			setState("copied");
		} catch {
			setState("failed");
		}
	}

	return (
		<div className="flex min-w-0 items-start gap-basalt-space-sm">
			<div className="flex min-w-0 flex-1 items-baseline gap-basalt-space-sm">
				{label !== undefined && (
					<span className="shrink-0 text-basalt-xs font-semibold text-basalt-muted-foreground">
						{label}
					</span>
				)}
				<span
					className={`min-w-0 wrap-anywhere font-mono ${sizeClassName} font-semibold tabular-nums`}
					data-testid={testId}
				>
					{value === null ? (
						<span className="text-basalt-muted-foreground">{emptyText}</span>
					) : (
						<IpLiteral value={value} />
					)}
				</span>
			</div>
			{value !== null && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="shrink-0"
					onClick={() => void copy()}
					aria-label={`Copy public address ${value}`}
					title="Copy the public address"
				>
					{state === "copied" ? (
						<Check aria-hidden="true" className="text-basalt-success" strokeWidth={1.5} />
					) : state === "failed" ? (
						<TriangleAlert
							aria-hidden="true"
							className="text-basalt-destructive"
							strokeWidth={1.5}
						/>
					) : (
						<Copy aria-hidden="true" strokeWidth={1.5} />
					)}
					{!iconOnly &&
						(state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy")}
				</Button>
			)}
		</div>
	);
}
