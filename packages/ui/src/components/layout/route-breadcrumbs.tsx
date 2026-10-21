import { hashHostId } from "@bat/shared";
import type { BreadcrumbItem } from "@nocoo/basalt/components/breadcrumbs";
import { useLocation, useMatch } from "react-router";
import { useHosts } from "@/hooks";

const home = { label: "Home", href: "/" };
const routes: Record<string, BreadcrumbItem[]> = {
	"/hosts": [{ label: "Hosts" }],
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
	const match = useMatch("/hosts/:id");
	const { data: hosts } = useHosts();
	const id = match?.params.id;
	const host = hosts?.find((candidate) => hashHostId(candidate.host_id) === id);
	return id
		? [home, { label: "Hosts", href: "/hosts" }, { label: host?.hostname ?? id }]
		: [home, ...(routes[pathname] ?? [])];
}
