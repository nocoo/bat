import { Check, Copy, TriangleAlert } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { abbreviateAddress } from "../lib/ip-abbreviation";

type CopyState = "idle" | "copied" | "failed";

const FEEDBACK_MS = 1400;

export function IpAddressRow({
	label,
	value,
}: {
	label?: string;
	value: string | null | undefined;
}) {
	const [state, setState] = useState<CopyState>("idle");
	const [announcement, setAnnouncement] = useState("");
	const [request, setRequest] = useState<{ id: number; message: string } | null>(null);
	const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		return () => {
			if (feedbackTimer.current !== null) {
				clearTimeout(feedbackTimer.current);
				feedbackTimer.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!request) {
			return;
		}
		setAnnouncement("");
		const id = setTimeout(() => setAnnouncement(request.message), 0);
		return () => clearTimeout(id);
	}, [request]);

	if (!value) {
		return null;
	}
	const address = value;

	function restartFeedback(next: CopyState) {
		if (feedbackTimer.current !== null) {
			clearTimeout(feedbackTimer.current);
		}
		setState(next);
		feedbackTimer.current = setTimeout(() => {
			setState("idle");
			feedbackTimer.current = null;
		}, FEEDBACK_MS);
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(address);
			restartFeedback("copied");
			setRequest((previous) => ({
				id: (previous?.id ?? 0) + 1,
				message: `Address copied: ${address}`,
			}));
		} catch {
			restartFeedback("failed");
			setRequest((previous) => ({
				id: (previous?.id ?? 0) + 1,
				message: `Could not copy address: ${address}`,
			}));
		}
	}

	return (
		<Fragment>
			<div
				className="group relative flex w-fit min-h-basalt-6 max-w-full items-center gap-basalt-space-md"
				data-testid="ip-address-row"
				data-state={state}
			>
				{label ? (
					<span className="shrink-0 font-mono text-basalt-xs text-basalt-muted-foreground">
						{label}
					</span>
				) : null}
				<span
					className="min-w-0 shrink overflow-hidden whitespace-nowrap pr-basalt-control-sm font-mono text-basalt-base text-basalt-foreground tabular-nums"
					data-testid="ip-address-row-value"
					title={address}
				>
					{abbreviateAddress(address)}
				</span>
				<button
					type="button"
					onClick={() => void copy()}
					title={address}
					aria-label={`Copy address ${address}`}
					data-testid="ip-address-row-copy"
					data-state={state}
					className={`absolute right-0 top-1/2 flex size-basalt-control-sm -translate-y-1/2 items-center justify-center rounded-basalt-sm text-basalt-muted-foreground transition-opacity duration-basalt-normal ease-basalt group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none ${
						state === "idle" ? "opacity-0" : "opacity-100"
					}`}
				>
					{state === "copied" ? (
						<Check
							aria-hidden="true"
							className="size-basalt-icon text-basalt-success animate-in fade-in zoom-in-50 duration-basalt-normal motion-reduce:animate-none"
							strokeWidth={2}
						/>
					) : state === "failed" ? (
						<TriangleAlert
							aria-hidden="true"
							className="size-basalt-icon text-basalt-warning animate-in fade-in zoom-in-50 duration-basalt-normal motion-reduce:animate-none"
							strokeWidth={2}
						/>
					) : (
						<Copy aria-hidden="true" className="size-basalt-icon" strokeWidth={1.5} />
					)}
				</button>
			</div>
			<span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
				{announcement}
			</span>
		</Fragment>
	);
}
