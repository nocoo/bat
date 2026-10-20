import { hashHostId } from "@bat/shared";
import { useLocation, useMatch } from "react-router";
import { useHosts } from "@/hooks";
import { type BreadcrumbItem, Breadcrumbs } from "./breadcrumbs";

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

function HostBreadcrumbs({ id }: { id: string }) {
	const { data: hosts } = useHosts();
	const host = hosts?.find((candidate) => hashHostId(candidate.host_id) === id);
	return (
		<Breadcrumbs
			items={[home, { label: "Hosts", href: "/hosts" }, { label: host?.hostname ?? id }]}
			className="min-w-0"
		/>
	);
}

export function RouteBreadcrumbs() {
	const { pathname } = useLocation();
	const match = useMatch("/hosts/:id");
	return match?.params.id ? (
		<HostBreadcrumbs id={match.params.id} />
	) : (
		<Breadcrumbs items={[home, ...(routes[pathname] ?? [])]} className="min-w-0" />
	);
}
