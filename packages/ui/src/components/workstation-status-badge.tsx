import type { WorkstationStatus } from "@bat/shared";
import { TagBadge, type TagColor } from "@nocoo/basalt/components/tag-badge";
import { workstationStatusLabel } from "@/lib/workstation-format";

const TONE: Record<WorkstationStatus, TagColor> = {
	recent: "success",
	stale: "info",
	disabled: "slate",
};

const DETAIL: Record<WorkstationStatus, string> = {
	recent: "Reported within the last 30 minutes.",
	stale: "No report for more than 30 minutes. Informational only; this is not a fleet alert.",
	disabled: "Enrollment is disabled. This workstation cannot report until it is re-enrolled.",
};

export function WorkstationStatusBadge({
	status,
	size = "sm",
}: {
	status: WorkstationStatus;
	size?: "sm" | "md";
}) {
	return (
		<TagBadge
			name={workstationStatusLabel(status)}
			color={TONE[status]}
			size={size}
			title={DETAIL[status]}
			data-testid="workstation-status"
			data-status={status}
		/>
	);
}
