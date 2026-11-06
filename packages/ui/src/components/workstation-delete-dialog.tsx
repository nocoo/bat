import type { WorkstationRecord } from "@bat/shared";
import { Button, Input, Label } from "@nocoo/basalt";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@nocoo/basalt/components/alert-dialog";
import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { useDeleteWorkstation } from "@/hooks";

export function WorkstationDeleteDialog({ workstation }: { workstation: WorkstationRecord }) {
	const [open, setOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const { deleteWorkstation, deleting, error, clearError } = useDeleteWorkstation(workstation.id);
	const navigate = useNavigate();
	const inputId = useId();
	const hintId = useId();

	function changeOpen(next: boolean) {
		if (deleting) return;
		setOpen(next);
		setConfirming(false);
		setConfirmation("");
		clearError();
	}

	return (
		<AlertDialog open={open} onOpenChange={changeOpen}>
			<AlertDialogTrigger asChild={true}>
				<Button
					variant="destructive"
					size="icon"
					className="h-basalt-control-sm min-h-0 w-basalt-control-sm min-w-0"
					aria-label="Delete workstation"
				>
					<Trash2 aria-hidden="true" />
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent
				data-bat-dirty="true"
				onEscapeKeyDown={(event) => {
					if (deleting) event.preventDefault();
				}}
			>
				<AlertDialogHeader>
					<AlertDialogTitle>
						{confirming ? "Permanently delete this workstation?" : `Delete ${workstation.name}?`}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{confirming
							? "Step 2 of 2 — type the workstation name exactly. This cannot be undone."
							: "Step 1 of 2 — review what will be permanently removed."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-basalt-layout text-basalt-base">
					<p>
						This permanently deletes <strong>{workstation.name}</strong>, its report history and
						connectivity samples. The machine's <code>batw_</code> key stops working immediately.
					</p>
					<p className="text-basalt-muted-foreground">
						The machine keeps its installation identity. Running <code>bat workstation login</code>{" "}
						again would enroll it as a new workstation; the old history is never restored.
					</p>
					{confirming && (
						<div className="space-y-basalt-space-lg">
							<Label htmlFor={inputId}>Type the exact workstation name to confirm</Label>
							<p id={hintId} className="select-all font-mono text-basalt-sm">
								{workstation.name}
							</p>
							<Input
								id={inputId}
								aria-describedby={hintId}
								autoComplete="off"
								spellCheck={false}
								value={confirmation}
								onChange={(event) => setConfirmation(event.target.value)}
								disabled={deleting}
							/>
						</div>
					)}
					{error && (
						<p role="alert" className="text-basalt-destructive">
							{error}
						</p>
					)}
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
					{confirming ? (
						<Button
							variant="destructive"
							disabled={deleting || confirmation !== workstation.name}
							onClick={async () => {
								if (await deleteWorkstation()) navigate("/workstations", { replace: true });
							}}
						>
							{deleting ? "Deleting…" : "Permanently delete workstation"}
						</Button>
					) : (
						<Button variant="destructive" onClick={() => setConfirming(true)}>
							Continue to confirmation
						</Button>
					)}
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
