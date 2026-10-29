import type { HostOverviewItem } from "@bat/shared";
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
import { AlertTriangle, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router";
import { useDeleteHost } from "@/hooks";
import { formatLastSeen } from "@/lib/host-card-format";
import { hasRecentUpload } from "@/lib/host-detail-format";

export function HostDeleteDialog({ host, routeId }: { host: HostOverviewItem; routeId: string }) {
	const [open, setOpen] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const [confirmation, setConfirmation] = useState("");
	const { deleteHost, deleting, error, clearError } = useDeleteHost(host.host_id, routeId);
	const navigate = useNavigate();
	const inputId = useId();
	const hintId = useId();
	const recent = hasRecentUpload(host.last_seen);

	function changeOpen(next: boolean) {
		if (deleting) return;
		setOpen(next);
		setConfirming(false);
		setConfirmation("");
		clearError();
	}

	return (
		<AlertDialog open={open} onOpenChange={changeOpen}>
			<AlertDialogTrigger asChild>
				<Button
					variant="destructive"
					size="icon"
					className="h-basalt-control-sm min-h-0 w-basalt-control-sm min-w-0"
					aria-label="Delete host"
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
						{confirming ? "Permanently delete this host?" : `Delete ${host.hostname}?`}
					</AlertDialogTitle>
					<AlertDialogDescription>
						{confirming
							? "Step 2 of 2 — verify the exact host ID. This cannot be undone."
							: "Step 1 of 2 — review what will be permanently removed."}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="space-y-basalt-layout text-basalt-base">
					{recent && (
						<div
							role="alert"
							className="flex gap-basalt-space-lg rounded-basalt-md bg-basalt-destructive/10 p-basalt-layout-sm text-basalt-destructive"
						>
							<AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
							<div className="space-y-basalt-space-sm">
								<p className="font-semibold">Warning: this probe may still be uploading.</p>
								<p>
									Last seen {formatLastSeen(host.last_seen)}. Stop or uninstall the probe first.
									Deleting now immediately rejects further uploads for this host ID, even after
									restarting or reinstalling the probe.
								</p>
							</div>
						</div>
					)}
					<p>
						This permanently deletes <strong>{host.hostname}</strong>, its metrics, inventory,
						alerts, events, tag assignments, port rules, maintenance and Connect grants. The host
						disappears from the dashboard.
					</p>
					<p>
						Webhook credentials and host-assigned agents/assets are also deleted, including their
						bindings to other hosts. Shared tags and the immutable security audit are retained.
					</p>
					<p className="text-basalt-muted-foreground">
						Uploads remain blocked until an administrator explicitly re-registers this exact host ID
						through the browser API. Re-registration only clears the block; the next probe upload
						creates a fresh host. Deleted history and old grants are never restored.
					</p>
					{confirming && (
						<div className="space-y-basalt-space-lg">
							<Label htmlFor={inputId}>Type the exact host ID to confirm</Label>
							<p id={hintId} className="break-all font-mono text-basalt-sm select-all">
								{host.host_id}
							</p>
							<Input
								id={inputId}
								aria-describedby={hintId}
								autoComplete="off"
								spellCheck={false}
								value={confirmation}
								onChange={(event) => setConfirmation(event.target.value)}
								disabled={deleting}
								className="font-mono"
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
							disabled={deleting || confirmation !== host.host_id}
							onClick={async () => {
								if (await deleteHost(confirmation)) navigate("/hosts", { replace: true });
							}}
						>
							{deleting ? "Deleting…" : "Permanently delete host"}
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
