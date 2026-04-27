// Pure helpers for the Websites and Software panels (tier2 slow-scan signals).
// Keeping shaping/grouping out of the components so we can unit-test without
// rendering React.

import type { DetectedSoftware, DiscoveredWebsite, SoftwareCategory } from "@bat/shared";

/** Sort detected software by category then by display name. */
export function groupSoftwareByCategory(
	software: DetectedSoftware[],
): [SoftwareCategory, DetectedSoftware[]][] {
	const order: SoftwareCategory[] = [
		"web",
		"proxy",
		"database",
		"cache",
		"queue",
		"runtime",
		"container",
		"infra",
		"monitoring",
		"security",
	];

	const buckets = new Map<SoftwareCategory, DetectedSoftware[]>();
	for (const sw of software) {
		const list = buckets.get(sw.category) ?? [];
		list.push(sw);
		buckets.set(sw.category, list);
	}
	for (const list of buckets.values()) {
		list.sort((a, b) => a.name.localeCompare(b.name));
	}

	return order
		.filter((cat) => buckets.has(cat))
		.map((cat) => [cat, buckets.get(cat) as DetectedSoftware[]]);
}

const CATEGORY_LABELS: Record<SoftwareCategory, string> = {
	web: "Web Servers",
	proxy: "Proxies",
	database: "Databases",
	cache: "Caches",
	queue: "Queues",
	runtime: "Runtimes",
	container: "Containers",
	infra: "Infra",
	monitoring: "Monitoring",
	security: "Security",
};

export function softwareCategoryLabel(c: SoftwareCategory): string {
	return CATEGORY_LABELS[c];
}

/** Sort websites alphabetically and dedupe by domain. */
export function dedupeAndSortWebsites(sites: DiscoveredWebsite[]): DiscoveredWebsite[] {
	const seen = new Map<string, DiscoveredWebsite>();
	for (const s of sites) {
		// First write wins — avoids flicker if probe reports the same domain twice.
		if (!seen.has(s.domain)) {
			seen.set(s.domain, s);
		}
	}
	return Array.from(seen.values()).sort((a, b) => a.domain.localeCompare(b.domain));
}

/** Build the "https://example.com" URL we'll link to in the UI. */
export function websiteUrl(site: DiscoveredWebsite): string {
	return `${site.ssl ? "https" : "http"}://${site.domain}`;
}
