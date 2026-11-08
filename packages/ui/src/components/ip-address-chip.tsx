// One IP address, as a single-line chip with an in-place copy affordance.
//
// The chip is one button: hovering or focusing replaces the static address with
// a copy overlay, and clicking anywhere copies the untouched literal. Every chip
// is `w-full`, so chips inside one surface share the same width and height; the
// value never wraps — IPv4 is shown complete and a long IPv6 is abbreviated in
// the middle by `abbreviateAddress`.

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { abbreviateAddress } from "@/lib/ip-abbreviation";

type CopyState = "idle" | "copied" | "failed";

const FEEDBACK_MS = 1400;

export function IpAddressChip({ value }: { value: string | null }) {
	const [state, setState] = useState<CopyState>("idle");
	const empty = value === null;

	useEffect(() => {
		if (state === "idle") {
			return;
		}
		const timer = setTimeout(() => setState("idle"), FEEDBACK_MS);
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

	const overlayVisible = state !== "idle";

	return (
		<button
			type="button"
			disabled={empty}
			onClick={() => void copy()}
			title={value ?? undefined}
			aria-label={empty ? "No address observed" : `Copy address ${value}`}
			data-testid="ip-address-chip"
			data-state={empty ? "empty" : state}
			className="basalt-focus group relative flex h-basalt-control w-full min-w-0 items-center gap-basalt-space-sm overflow-hidden rounded-basalt-sm border border-basalt-border bg-basalt-card px-basalt-control-x text-left font-mono text-basalt-base tabular-nums transition-colors duration-basalt-normal ease-basalt hover:border-basalt-ring disabled:cursor-default disabled:border-basalt-border disabled:hover:border-basalt-border motion-reduce:transition-none"
		>
			<span
				className={
					empty
						? "min-w-0 flex-1 truncate text-basalt-muted-foreground"
						: "min-w-0 flex-1 truncate text-basalt-foreground"
				}
				data-testid="ip-address-chip-value"
			>
				{empty ? "—" : abbreviateAddress(value)}
			</span>

			{!empty && (
				<span
					data-testid="ip-address-chip-overlay"
					className={`absolute inset-0 flex items-center justify-center gap-basalt-space-xs bg-basalt-card text-basalt-muted-foreground transition-opacity duration-basalt-normal ease-basalt motion-reduce:transition-none ${
						overlayVisible
							? "opacity-100"
							: "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
					}`}
				>
					{state === "copied" ? (
						<>
							<Check
								aria-hidden="true"
								className="size-basalt-icon-sm text-basalt-success animate-in fade-in zoom-in-50 duration-basalt-normal motion-reduce:animate-none"
								strokeWidth={2}
							/>
							<span className="text-basalt-success">Copied</span>
						</>
					) : state === "failed" ? (
						<>
							<TriangleAlert
								aria-hidden="true"
								className="size-basalt-icon-sm text-basalt-warning animate-in fade-in zoom-in-50 duration-basalt-normal motion-reduce:animate-none"
								strokeWidth={2}
							/>
							<span className="text-basalt-warning">Copy failed</span>
						</>
					) : (
						<>
							<Copy aria-hidden="true" className="size-basalt-icon-sm" strokeWidth={2} />
							<span>Copy</span>
						</>
					)}
				</span>
			)}
		</button>
	);
}
