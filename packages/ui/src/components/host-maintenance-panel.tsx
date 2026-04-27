import { deleteAPI, putAPI } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHostMaintenance } from "@/hooks";
import {
	currentTzOffsetMinutes,
	describeLocalAsUtc,
	localHHMMToUtc,
	utcHHMMToLocal,
	validateWindow,
} from "@/lib/maintenance";
import { Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSWRConfig } from "swr";

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
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Wrench className="h-4 w-4" />
					Maintenance Window
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					<p className="text-xs text-muted-foreground">
						Daily window during which alerts are suppressed. Times below are local; the backend
						stores UTC.
					</p>
					<div className="grid grid-cols-2 gap-2">
						<label className="space-y-1">
							<span className="text-xs font-medium text-muted-foreground">Start</span>
							<input
								type="time"
								value={start}
								onChange={(e) => setStart(e.target.value)}
								disabled={busy}
								className="h-8 w-full rounded-md border border-border bg-secondary hover:border-foreground/20 px-2 text-sm font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
							/>
							{start && (
								<span className="block text-[10px] text-muted-foreground font-mono">
									{describeLocalAsUtc(start, tzOffset)}
								</span>
							)}
						</label>
						<label className="space-y-1">
							<span className="text-xs font-medium text-muted-foreground">End</span>
							<input
								type="time"
								value={end}
								onChange={(e) => setEnd(e.target.value)}
								disabled={busy}
								className="h-8 w-full rounded-md border border-border bg-secondary hover:border-foreground/20 px-2 text-sm font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
							/>
							{end && (
								<span className="block text-[10px] text-muted-foreground font-mono">
									{describeLocalAsUtc(end, tzOffset)}
								</span>
							)}
						</label>
					</div>
					<input
						type="text"
						placeholder="Reason (optional)"
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						disabled={busy}
						maxLength={200}
						className="h-8 w-full rounded-md border border-border bg-secondary hover:border-foreground/20 px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					/>
					{error && <p className="text-xs text-destructive">{error}</p>}
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={handleSave}
							disabled={busy || !dirty || !start || !end}
							className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
						>
							{window ? "Update" : "Save"}
						</button>
						{window && (
							<button
								type="button"
								onClick={handleClear}
								disabled={busy}
								className="h-8 rounded-md border border-border px-3 text-sm hover:bg-secondary disabled:opacity-50 transition-colors"
							>
								Clear
							</button>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
