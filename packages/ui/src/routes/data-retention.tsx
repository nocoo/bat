import { RETENTION_OPTIONS, type RetentionDays } from "@bat/shared";
import { SegmentControl } from "@nocoo/basalt";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { AlertTriangle, Check } from "lucide-react";
import { useCallback, useState } from "react";
import { putAPI } from "@/api";
import { INLINE_SEGMENT } from "@/components/layout/segment";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/hooks";

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

	return isLoading && !settings ? (
		<LayerCard>
			<LayerCard.Body className="py-6 space-y-4">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-20 w-full" />
			</LayerCard.Body>
		</LayerCard>
	) : error && !settings ? (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<AlertTriangle className="h-12 w-12 mb-4 text-basalt-destructive" strokeWidth={1} />
			<h2 className="text-basalt-lg font-semibold text-basalt-foreground">
				Failed to load settings
			</h2>
			<p className="mt-2 text-basalt-base">{error.message}</p>
		</div>
	) : (
		<div className="space-y-basalt-layout max-w-4xl">
			<PageHeader
				title="Data Retention"
				description="Data outside this window is permanently deleted hourly."
			/>

			{/* Action error banner */}
			{actionError && (
				<div className="rounded-md border border-basalt-destructive/50 bg-basalt-destructive/10 px-4 py-3 text-basalt-base text-basalt-destructive">
					{actionError}
				</div>
			)}

			<LayerCard>
				<LayerCard.Body>
					<SegmentControl
						legend="Retention window"
						className={INLINE_SEGMENT}
						value={String(settings?.retention_days ?? "")}
						onValueChange={(value) => handleChange(Number(value) as RetentionDays)}
						disabled={saving}
						options={RETENTION_OPTIONS.map((days) => ({
							value: String(days),
							label: retentionLabel(days),
						}))}
					/>
					<div className="mt-3 h-5">
						{saving && <p className="text-basalt-sm text-basalt-muted-foreground">Saving...</p>}
						{saved && (
							<p className="text-basalt-sm text-basalt-success flex items-center gap-1">
								<Check className="h-3 w-3" strokeWidth={2} />
								Saved
							</p>
						)}
					</div>
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}
