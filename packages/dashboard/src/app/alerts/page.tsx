import { AppShell } from "@/components/layout";
import { Bell } from "lucide-react";

export default function AlertsPage() {
	return (
		<AppShell breadcrumbs={[{ label: "Alerts" }]}>
			<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
				<Bell className="h-12 w-12 mb-4" strokeWidth={1} />
				<h1 className="text-xl font-semibold text-foreground">Alerts</h1>
				<p className="mt-2 text-sm">Alert management will appear here.</p>
			</div>
		</AppShell>
	);
}
