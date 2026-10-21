import type { Tier2Snapshot } from "@bat/shared";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { Globe, Lock, Package, Unlock } from "lucide-react";
import {
	dedupeAndSortWebsites,
	groupSoftwareByCategory,
	softwareCategoryLabel,
	websiteUrl,
} from "@/lib/tier2-format";

interface Tier2PanelsProps {
	tier2: Tier2Snapshot | undefined;
}

export function WebsitesPanel({ tier2 }: Tier2PanelsProps) {
	const sites = dedupeAndSortWebsites(tier2?.websites?.sites ?? []);
	if (!tier2?.websites || sites.length === 0) {
		return null;
	}

	return (
		<LayerCard>
			<LayerCard.Header>
				<h2 className="flex items-center gap-2">
					<Globe className="h-4 w-4" />
					Websites
					<span className="text-basalt-sm font-normal text-basalt-muted-foreground">
						({sites.length})
					</span>
				</h2>
			</LayerCard.Header>
			<LayerCard.Body>
				<ul className="space-y-1.5">
					{sites.map((s) => (
						<li key={s.domain} className="flex items-center gap-2 text-basalt-base min-w-0">
							{s.ssl ? (
								<Lock className="h-3 w-3 text-emerald-500 shrink-0" />
							) : (
								<Unlock className="h-3 w-3 text-amber-500 shrink-0" />
							)}
							<a
								href={websiteUrl(s)}
								target="_blank"
								rel="noopener noreferrer"
								className="font-mono truncate hover:underline"
								title={s.domain}
							>
								{s.domain}
							</a>
							<span className="ml-auto text-basalt-sm text-basalt-muted-foreground shrink-0 capitalize">
								{s.web_server}
							</span>
						</li>
					))}
				</ul>
			</LayerCard.Body>
		</LayerCard>
	);
}

export function SoftwarePanel({ tier2 }: Tier2PanelsProps) {
	const detected = tier2?.software?.detected ?? [];
	const grouped = groupSoftwareByCategory(detected);
	if (!tier2?.software || grouped.length === 0) {
		return null;
	}

	return (
		<LayerCard>
			<LayerCard.Header>
				<h2 className="flex items-center gap-2">
					<Package className="h-4 w-4" />
					Detected Software
					<span className="text-basalt-sm font-normal text-basalt-muted-foreground">
						({detected.length})
					</span>
				</h2>
			</LayerCard.Header>
			<LayerCard.Body>
				<div className="space-y-3">
					{grouped.map(([category, items]) => (
						<div key={category} className="space-y-1">
							<p className="text-basalt-sm font-medium text-basalt-muted-foreground uppercase tracking-wider">
								{softwareCategoryLabel(category)}
							</p>
							<div className="grid gap-1">
								{items.map((sw) => (
									<div key={sw.id} className="flex items-center gap-2 text-basalt-base min-w-0">
										<span
											className={`h-1.5 w-1.5 rounded-full shrink-0 ${
												sw.running ? "bg-emerald-500" : "bg-basalt-muted-foreground/40"
											}`}
											title={sw.running ? "running" : "not running"}
										/>
										<span className="font-medium truncate">{sw.name}</span>
										{sw.version && (
											<span className="text-basalt-sm text-basalt-muted-foreground font-mono shrink-0">
												{sw.version}
											</span>
										)}
										{sw.listening_ports.length > 0 && (
											<span className="ml-auto text-basalt-sm text-basalt-muted-foreground font-mono shrink-0">
												:{sw.listening_ports.join(", ")}
											</span>
										)}
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</LayerCard.Body>
		</LayerCard>
	);
}
