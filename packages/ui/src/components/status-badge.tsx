import type { HostStatus } from "@bat/shared";
import { Badge } from "@nocoo/basalt";
import {
	CircleAlert,
	CircleCheckBig,
	CircleOff,
	type LucideIcon,
	TriangleAlert,
} from "@nocoo/basalt/icons";

const STATUS_CONFIG: Record<
	HostStatus,
	{
		label: string;
		tone: "success" | "warning" | "danger" | "neutral";
		icon: LucideIcon;
	}
> = {
	healthy: { label: "Healthy", tone: "success", icon: CircleCheckBig },
	warning: { label: "Warning", tone: "warning", icon: TriangleAlert },
	critical: { label: "Critical", tone: "danger", icon: CircleAlert },
	offline: { label: "Offline", tone: "neutral", icon: CircleOff },
};

/** The state's accessible name — also carried by the list's status dot. */
export function hostStatusLabel(status: HostStatus): string {
	return STATUS_CONFIG[status].label;
}

export function StatusBadge({ status }: { status: HostStatus }) {
	const config = STATUS_CONFIG[status];
	const Icon = config.icon;
	return (
		<Badge
			tone={config.tone}
			className="h-basalt-control-sm shrink-0 gap-basalt-space-sm whitespace-nowrap"
			data-testid="status-badge"
			title={config.label}
			aria-label={config.label}
		>
			<Icon className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
			{config.label}
		</Badge>
	);
}
