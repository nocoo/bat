// Rename a workstation without touching its credential or history.

import type { WorkstationRecord } from "@bat/shared";
import { WORKSTATION_NAME_MAX_LENGTH } from "@bat/shared";
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
import { Pencil } from "lucide-react";
import { useState } from "react";
import { ApiError, renameWorkstationAPI } from "@/api";
import { useWorkstations } from "@/hooks";

export function WorkstationRenameDialog({ workstation }: { workstation: WorkstationRecord }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState(workstation.name);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { mutate } = useWorkstations();

	function changeOpen(next: boolean) {
		if (pending) {
			return;
		}
		setOpen(next);
		if (next) {
			setName(workstation.name);
			setError(null);
		}
	}

	async function save() {
		const trimmed = name.trim();
		if (pending || trimmed === "" || trimmed === workstation.name) {
			setOpen(false);
			return;
		}
		setPending(true);
		setError(null);
		try {
			await renameWorkstationAPI(workstation.id, trimmed);
			await mutate();
			setPending(false);
			setOpen(false);
		} catch (err) {
			setError(
				err instanceof ApiError && err.status === 403
					? "Only the owner or a global manager may rename this workstation."
					: "Rename failed. Retry, or reload the page.",
			);
			setPending(false);
		}
	}

	return (
		<Dialog open={open} onOpenChange={changeOpen}>
			<DialogTrigger asChild={true}>
				<Button variant="ghost" size="sm" aria-label={`Rename ${workstation.name}`}>
					<Pencil aria-hidden="true" />
					Rename
				</Button>
			</DialogTrigger>
			<DialogContent size="base">
				<DialogHeader>
					<DialogTitle>Rename workstation</DialogTitle>
					<DialogDescription>
						The display name shown here and in the fleet table. The enrollment, key and history stay
						unchanged.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-basalt-layout"
					onSubmit={(event) => {
						event.preventDefault();
						void save();
					}}
				>
					<Input
						aria-label="Workstation name"
						value={name}
						maxLength={WORKSTATION_NAME_MAX_LENGTH}
						onChange={(event) => setName(event.target.value)}
						disabled={pending}
						autoFocus={true}
					/>
					{error !== null && (
						<p role="alert" className="text-basalt-sm text-basalt-destructive">
							{error}
						</p>
					)}
				</form>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => changeOpen(false)}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => void save()}
						loading={pending}
						disabled={name.trim() === ""}
					>
						Save name
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
