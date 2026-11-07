// A public address with an explicit copy control and visible feedback. The
// clipboard is optional in embedded browsers, so a refused copy says so instead
// of pretending it worked.

import { Button } from "@nocoo/basalt";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

export function CopyableAddress({ value }: { value: string | null }) {
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
		<div className="flex items-center gap-basalt-space-sm">
			<span
				className="font-mono text-basalt-xl font-semibold tabular-nums"
				data-testid="workstation-public-ip"
			>
				{value ?? "No public IP observed"}
			</span>
			{value !== null && (
				<Button
					type="button"
					variant="ghost"
					size="sm"
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
					{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}
				</Button>
			)}
		</div>
	);
}
