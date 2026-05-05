import { putAPI } from "@/api";
import { AppShell } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/hooks";
import { RETENTION_OPTIONS, type RetentionDays } from "@bat/shared";
import { AlertTriangle, Check, Database } from "lucide-react";
import { useCallback, useState } from "react";

function retentionLabel(days: RetentionDays): string {
	if (days === 1) {
		return "1 day";
	}
	return `${days} days`;
}

export function DataRetentionPage() {
	const { data: settings, error, isLoading, mutate } = useSettings();
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	const handleChange = useCallback(
		async (days: RetentionDays) => {
			if (days === settings?.retention_days) {
				return;
			}
			setSaving(true);
			setSaved(false);
			setActionError(null);
			try {
				await putAPI("/api/settings", { retention_days: days });
				await mutate();
				setSaved(true);
				setTimeout(() => setSaved(false), 2000);
			} catch (err) {
				setActionError(err instanceof Error ? err.message : "Failed to update settings");
			} finally {
				setSaving(false);
			}
		},
		[settings?.retention_days, mutate],
	);

	return (
		<AppShell breadcrumbs={[{ label: "Settings" }, { label: "Data Retention" }]}>
			{isLoading && !settings ? (
				<Card>
					<CardContent className="py-6 space-y-4">
						<Skeleton className="h-8 w-48" />
						<Skeleton className="h-20 w-full" />
					</CardContent>
				</Card>
			) : error && !settings ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<AlertTriangle className="h-12 w-12 mb-4 text-destructive" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">Failed to load settings</h2>
					<p className="mt-2 text-sm">{error.message}</p>
				</div>
			) : (
				<div className="space-y-4 max-w-4xl">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">Data Retention</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Configure how long monitoring data is stored. All metrics, snapshots, and events older
							than the selected window are automatically purged every hour.
						</p>
					</div>

					{/* Action error banner */}
					{actionError && (
						<div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
							{actionError}
						</div>
					)}

					<Card>
						<CardContent className="py-5">
							<div className="flex items-start gap-3 mb-4">
								<Database
									className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0"
									strokeWidth={1.5}
								/>
								<div>
									<p className="text-sm font-medium">Retention Window</p>
									<p className="text-xs text-muted-foreground mt-0.5">
										Data older than this period will be permanently deleted.
									</p>
								</div>
							</div>

							<fieldset className="flex gap-2" aria-label="Retention window">
								<legend className="sr-only">Retention window</legend>
								{RETENTION_OPTIONS.map((days) => {
									const isSelected = settings?.retention_days === days;
									const id = `retention-${days}`;
									return (
										<label
											key={days}
											htmlFor={id}
											className={`relative h-9 px-4 text-sm font-medium rounded-md border transition-colors flex items-center cursor-pointer ${
												saving ? "opacity-50 pointer-events-none" : ""
											} ${
												isSelected
													? "border-primary bg-primary text-primary-foreground"
													: "border-border bg-background text-foreground hover:bg-accent"
											}`}
										>
											<input
												type="radio"
												id={id}
												name="retention_days"
												value={days}
												checked={isSelected}
												disabled={saving}
												onChange={() => handleChange(days)}
												className="sr-only"
											/>
											{retentionLabel(days)}
										</label>
									);
								})}
							</fieldset>
							<div className="mt-3 h-5">
								{saving && <p className="text-xs text-muted-foreground">Saving...</p>}
								{saved && (
									<p className="text-xs text-success flex items-center gap-1">
										<Check className="h-3 w-3" strokeWidth={2} />
										Saved
									</p>
								)}
							</div>
						</CardContent>
					</Card>
				</div>
			)}
		</AppShell>
	);
}
