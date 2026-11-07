// Pairing dialog: approve a headless enrollment from the dashboard.
//
// The machine prints an eight character code; an operator with an Access session
// approves it here. Approval only stamps the code, the machine's own exchange
// still creates the key.

import { Button, Input } from "@nocoo/basalt";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@nocoo/basalt/components/dialog";
import { Check, Link2 } from "lucide-react";
import { useState } from "react";
import { ApiError, approveWorkstationPairAPI } from "@/api";
import { useWorkstations } from "@/hooks";

function messageFor(error: unknown): string {
	if (error instanceof ApiError) {
		if (error.status === 404) return "That pairing code is unknown. Check the terminal output.";
		if (error.status === 409) return "That pairing code was already approved or used.";
		if (error.status === 410) return "That pairing code has expired. Run login again.";
		if (error.status === 403) return "Approval needs a signed-in Access session.";
	}
	return "Approval failed. Retry, or mint a fresh code in the terminal.";
}

export function WorkstationPairDialog() {
	const [open, setOpen] = useState(false);
	const [code, setCode] = useState("");
	const [pending, setPending] = useState(false);
	const [approved, setApproved] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const { mutate } = useWorkstations();

	function changeOpen(next: boolean) {
		if (pending) {
			return;
		}
		setOpen(next);
		if (!next) {
			setCode("");
			setApproved(null);
			setError(null);
		}
	}

	async function approve() {
		if (pending || code.trim() === "") {
			return;
		}
		setPending(true);
		setError(null);
		try {
			const result = await approveWorkstationPairAPI(code.trim());
			setApproved(result.name);
			await mutate();
		} catch (err) {
			setError(messageFor(err));
		} finally {
			setPending(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogTrigger asChild={true}>
				<Button variant="outline" size="sm">
					<Link2 aria-hidden="true" />
					Pair
				</Button>
			</DialogTrigger>
			<DialogContent size="lg">
				<DialogHeader>
					<DialogTitle>Pair a workstation</DialogTitle>
					<DialogDescription>
						Enter the code printed by{" "}
						<code className="font-mono">bat workstation login --headless</code>. The code is valid
						for five minutes and works once.
					</DialogDescription>
				</DialogHeader>

				{approved === null ? (
					<form
						className="mt-basalt-layout space-y-basalt-layout"
						onSubmit={(event) => {
							event.preventDefault();
							void approve();
						}}
					>
						<Input
							aria-label="Pairing code"
							placeholder="ABCD-2345"
							value={code}
							onChange={(event) => setCode(event.target.value.toUpperCase())}
							autoComplete="off"
							spellCheck={false}
							className="font-mono tracking-widest"
							maxLength={9}
							disabled={pending}
						/>
						{error !== null && (
							<p role="alert" className="text-basalt-sm text-basalt-destructive">
								{error}
							</p>
						)}
						<p className="text-basalt-sm text-basalt-muted-foreground">
							The terminal keeps waiting and stores the workstation key as soon as this is approved.
							Nothing is sent to the machine from here.
						</p>
					</form>
				) : (
					<div className="mt-basalt-layout flex items-start gap-basalt-space-md">
						<Check aria-hidden="true" className="mt-basalt-space-xs size-4 text-basalt-success" />
						<div className="space-y-basalt-space-xs">
							<p className="font-medium">Approved {approved}</p>
							<p className="text-basalt-sm text-basalt-muted-foreground">
								Return to the terminal: it exchanges the code, stores the key and exits.
							</p>
						</div>
					</div>
				)}

				<DialogFooter>
					{approved === null ? (
						<>
							<Button type="button" variant="outline" onClick={() => changeOpen(false)}>
								Cancel
							</Button>
							<Button
								type="button"
								onClick={() => void approve()}
								loading={pending}
								disabled={code.trim() === ""}
							>
								Approve
							</Button>
						</>
					) : (
						<Button type="button" onClick={() => changeOpen(false)}>
							Done
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
