import { Button, Field, Input } from "@nocoo/basalt";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { deleteAPI, putAPI } from "@/api";
import { useHostMaintenance } from "@/hooks";
import {
	currentTzOffsetMinutes,
	describeLocalAsUtc,
	localHHMMToUtc,
	utcHHMMToLocal,
	validateWindow,
} from "@/lib/maintenance";

interface MaintenancePanelProps {
	hostId: string;
}

export function MaintenancePanel({ hostId }: MaintenancePanelProps) {
	const { data: window, mutate } = useHostMaintenance(hostId);
	const { mutate: globalMutate } = useSWRConfig();
	const tzOffset = useMemo(() => currentTzOffsetMinutes(), []);

	const [start, setStart] = useState("");
	const [end, setEnd] = useState("");
	const [reason, setReason] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Sync form state from server when window changes (e.g. after save).
	useEffect(() => {
		if (window) {
			setStart(utcHHMMToLocal(window.start, tzOffset));
			setEnd(utcHHMMToLocal(window.end, tzOffset));
			setReason(window.reason ?? "");
		} else {
			setStart("");
			setEnd("");
			setReason("");
		}
		setError(null);
	}, [window, tzOffset]);

	const dirty = useMemo(() => {
		if (!window) {
			return Boolean(start || end || reason);
		}
		return (
			start !== utcHHMMToLocal(window.start, tzOffset) ||
			end !== utcHHMMToLocal(window.end, tzOffset) ||
			reason !== (window.reason ?? "")
		);
	}, [window, start, end, reason, tzOffset]);

	const handleSave = async () => {
		const v = validateWindow(start, end, reason);
		if (!v.ok) {
			setError(v.message);
			return;
		}
		setBusy(true);
		setError(null);
		try {
			await putAPI(`/api/hosts/${hostId}/maintenance`, {
				start: localHHMMToUtc(start, tzOffset),
				end: localHHMMToUtc(end, tzOffset),
				reason: reason.trim(),
			});
			await mutate();
			globalMutate("hosts");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Save failed");
		} finally {
			setBusy(false);
		}
	};

	const handleClear = async () => {
		setBusy(true);
		setError(null);
		try {
			await deleteAPI(`/api/hosts/${hostId}/maintenance`);
			await mutate();
			globalMutate("hosts");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Clear failed");
		} finally {
			setBusy(false);
		}
	};

	return (
		<LayerCard>
			<LayerCard.Header>
				<h2 className="flex items-center gap-2">
					<Wrench className="h-4 w-4" />
					Maintenance Window
				</h2>
			</LayerCard.Header>
			<LayerCard.Body>
				<div className="space-y-3">
					<p className="text-basalt-sm text-basalt-muted-foreground">
						Daily window during which alerts are suppressed. Times below are local; the backend
						stores UTC.
					</p>
					<div className="grid grid-cols-2 gap-2">
						<Field label="Start" hint={start ? describeLocalAsUtc(start, tzOffset) : undefined}>
							<Input
								type="time"
								value={start}
								onChange={(e) => setStart(e.target.value)}
								disabled={busy}
							/>
						</Field>
						<Field label="End" hint={end ? describeLocalAsUtc(end, tzOffset) : undefined}>
							<Input
								type="time"
								value={end}
								onChange={(e) => setEnd(e.target.value)}
								disabled={busy}
							/>
						</Field>
					</div>
					<Input
						type="text"
						aria-label="Maintenance reason"
						placeholder="Reason (optional)"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						disabled={busy}
						maxLength={200}
					/>
					{error && <p className="text-basalt-sm text-basalt-destructive">{error}</p>}
					<div className="flex items-center gap-2">
						<Button type="button" onClick={handleSave} disabled={busy || !dirty || !start || !end}>
							{window ? "Update" : "Save"}
						</Button>
						{window && (
							<Button type="button" variant="outline" onClick={handleClear} disabled={busy}>
								Clear
							</Button>
						)}
					</div>
				</div>
			</LayerCard.Body>
		</LayerCard>
	);
}
