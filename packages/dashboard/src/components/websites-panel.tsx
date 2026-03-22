import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DiscoveredWebsite } from "@bat/shared";
import { Globe, Lock, Unlock } from "lucide-react";

function WebsiteRow({ site }: { site: DiscoveredWebsite }) {
	return (
		<div className="flex items-center gap-2 text-sm">
			{site.ssl ? (
				<Lock className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
			) : (
				<Unlock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
			)}
			<span className="font-medium truncate">{site.domain}</span>
			<span className="text-xs text-muted-foreground ml-auto shrink-0">{site.web_server}</span>
		</div>
	);
}

export function WebsitesPanel({ sites }: { sites: DiscoveredWebsite[] }) {
	if (sites.length === 0) {
		return null;
	}

	const sorted = [...sites].sort((a, b) => a.domain.localeCompare(b.domain));

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Globe className="h-4 w-4" />
					Websites ({sites.length})
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid gap-1">
					{sorted.map((site) => (
						<WebsiteRow key={site.domain} site={site} />
					))}
				</div>
				<p className="text-xs text-muted-foreground mt-3">
					Discovered from standard Nginx/Apache config paths
				</p>
			</CardContent>
		</Card>
	);
}
