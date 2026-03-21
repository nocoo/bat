"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHostMaintenance } from "@/lib/hooks";
import type { MaintenanceWindow } from "@bat/shared";
import { Clock, Pencil, Trash2, Wrench } from "lucide-react";
import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";

async function apiRequest(url: string, options?: RequestInit) {
	const res = await fetch(url, {
		headers: { "Content-Type": "application/json" },
		...options,
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
	}
	if (res.status === 204) return null;
	return res.json();
}

/** Convert a UTC "HH:MM" string to the browser's local timezone "HH:MM". */
function utcToLocal(utcHHMM: string): string {
	const [h = 0, m = 0] = utcHHMM.split(":").map(Number);
	const d = new Date();
	d.setUTCHours(h, m, 0, 0);
	return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

/** Convert a local "HH:MM" to UTC "HH:MM". */
function localToUtc(localHHMM: string): string {
	const [h = 0, m = 0] = localHHMM.split(":").map(Number);
	const d = new Date();
	d.setHours(h, m, 0, 0);
	return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}

interface MaintenancePanelProps {
	hid: string; // 8-char hashed host ID for API calls
}

export function MaintenancePanel({ hid }: MaintenancePanelProps) {
	const { data: mw, mutate } = useHostMaintenance(hid);
	const { mutate: globalMutate } = useSWRConfig();
	const [editing, setEditing] = useState(false);
	const [startInput, setStartInput] = useState("03:00");
	const [endInput, setEndInput] = useState("05:00");
	const [reasonInput, setReasonInput] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);

	const startEdit = useCallback((existing?: MaintenanceWindow | null) => {
		if (existing) {
			setStartInput(utcToLocal(existing.start));
			setEndInput(utcToLocal(existing.end));
			setReasonInput(existing.reason);
		} else {
			setStartInput("03:00");
			setEndInput("05:00");
			setReasonInput("");
		}
		setError("");
		setEditing(true);
	}, []);

	const handleSave = useCallback(async () => {
		setSaving(true);
		setError("");
		try {
			const startUtc = localToUtc(startInput);
			const endUtc = localToUtc(endInput);
			if (startUtc === endUtc) {
				setError("Start and end times must be different");
				setSaving(false);
				return;
			}
			await apiRequest(`/api/hosts/${hid}/maintenance`, {
				method: "PUT",
				body: JSON.stringify({
					start: startUtc,
					end: endUtc,
					reason: reasonInput || undefined,
				}),
			});
			await mutate();
			await globalMutate("hosts");
			setEditing(false);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setSaving(false);
		}
	}, [hid, startInput, endInput, reasonInput, mutate, globalMutate]);

	const handleRemove = useCallback(async () => {
		try {
			await apiRequest(`/api/hosts/${hid}/maintenance`, {
				method: "DELETE",
			});
			await mutate();
			await globalMutate("hosts");
		} catch (e) {
			setError((e as Error).message);
		}
	}, [hid, mutate, globalMutate]);

	return (
		<Card>
			<CardHeader className="flex flex-row items-center gap-2 pb-2">
				<Wrench className="size-4 text-muted-foreground" />
				<CardTitle className="text-sm font-medium">Maintenance Window</CardTitle>
			</CardHeader>
			<CardContent>
				{editing ? (
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<div className="flex-1">
								<label className="text-xs text-muted-foreground mb-1 block">
									Start (local)
									<input
										type="time"
										value={startInput}
										onChange={(e) => setStartInput(e.target.value)}
										className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm mt-1"
									/>
								</label>
							</div>
							<span className="mt-5 text-muted-foreground">→</span>
							<div className="flex-1">
								<label className="text-xs text-muted-foreground mb-1 block">
									End (local)
									<input
										type="time"
										value={endInput}
										onChange={(e) => setEndInput(e.target.value)}
										className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm mt-1"
									/>
								</label>
							</div>
						</div>
						<p className="text-[11px] text-muted-foreground">
							UTC: {localToUtc(startInput)} → {localToUtc(endInput)}
						</p>
						<div>
							<label className="text-xs text-muted-foreground mb-1 block">
								Reason (optional)
								<input
									type="text"
									value={reasonInput}
									onChange={(e) => setReasonInput(e.target.value)}
									maxLength={200}
									placeholder="e.g. Nightly backup"
									className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm mt-1"
								/>
							</label>
						</div>
						{error && <p className="text-xs text-destructive">{error}</p>}
						<div className="flex gap-2">
							<button
								type="button"
								onClick={handleSave}
								disabled={saving}
								className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
							>
								{saving ? "Saving..." : "Save"}
							</button>
							<button
								type="button"
								onClick={() => setEditing(false)}
								className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
							>
								Cancel
							</button>
						</div>
					</div>
				) : mw ? (
					<div className="space-y-2">
						<div className="flex items-center gap-2 text-sm">
							<Clock className="size-3.5 text-muted-foreground" />
							<span>
								{utcToLocal(mw.start)} → {utcToLocal(mw.end)}
							</span>
							<span className="text-xs text-muted-foreground">
								(UTC: {mw.start} → {mw.end})
							</span>
						</div>
						{mw.reason && <p className="text-xs text-muted-foreground">{mw.reason}</p>}
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => startEdit(mw)}
								className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs hover:bg-accent"
							>
								<Pencil className="size-3" />
								Edit
							</button>
							<button
								type="button"
								onClick={handleRemove}
								className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10"
							>
								<Trash2 className="size-3" />
								Remove
							</button>
						</div>
					</div>
				) : (
					<div className="space-y-2">
						<p className="text-xs text-muted-foreground">No maintenance window configured</p>
						<button
							type="button"
							onClick={() => startEdit(null)}
							className="rounded border border-border px-3 py-1 text-xs hover:bg-accent"
						>
							Set Schedule
						</button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
