import { hashHostId } from "@bat/shared";
import type { BreadcrumbItem } from "@nocoo/basalt/components/breadcrumbs";
import { useLocation, useMatch } from "react-router";
import { useHosts, useWorkstations } from "@/hooks";

const home = { label: "Home", href: "/" };
const routes: Record<string, BreadcrumbItem[]> = {
	"/hosts": [{ label: "Hosts" }],
	"/workstations": [{ label: "Workstations" }],
	"/alerts": [{ label: "Alerts" }],
	"/events": [{ label: "Events" }],
	"/tags": [{ label: "Tags" }],
	"/settings/webhooks": [{ label: "Settings" }, { label: "Webhooks" }],
	"/settings/data": [{ label: "Settings" }, { label: "Data Retention" }],
	"/setup": [{ label: "Setup" }],
	"/connect": [{ label: "Connect" }],
};

export function useRouteBreadcrumbs(): BreadcrumbItem[] {
	const { pathname } = useLocation();
	const hostMatch = useMatch("/hosts/:id");
	const workstationMatch = useMatch("/workstations/:id");
	const { data: hosts } = useHosts();
	const { data: workstations } = useWorkstations();
	const hostId = hostMatch?.params.id;
	const host = hosts?.find((candidate) => hashHostId(candidate.host_id) === hostId);
	if (hostId) {
		return [home, { label: "Hosts", href: "/hosts" }, { label: host?.hostname ?? hostId }];
	}
	const workstationId = workstationMatch?.params.id;
	if (workstationId) {
		return [
			home,
			{ label: "Workstations", href: "/workstations" },
			{
				label:
					workstations?.find((candidate) => candidate.id === workstationId)?.name ?? workstationId,
			},
		];
	}
	return [home, ...(routes[pathname] ?? [])];
}
