// Package registry fallbacks for version discovery and self-update.
//
// The official registry is authoritative; the Tencent mirror is the documented
// fallback on a machine whose network blocks npmjs. Order matters and every
// failure is reported, never silently swallowed.

export const PACKAGE_NAME = "@nocoo/bat";

export interface Registry {
	/** Human label used in messages. */
	label: string;
	base: string;
}

export const REGISTRIES: readonly Registry[] = [
	{ label: "npmjs", base: "https://registry.npmjs.org" },
	{ label: "tencent mirror", base: "https://mirrors.cloud.tencent.com/npm" },
];

export interface LatestLookup {
	version: string;
	registry: Registry;
}

export function metadataUrl(registry: Registry, packageName = PACKAGE_NAME): string {
	return `${registry.base}/${packageName.replace("/", "%2F")}`;
}

/**
 * Try each registry in order and return the first usable `dist-tags.latest`.
 * A registry that answers with a non-2xx status or an unusable body is skipped.
 */
export async function fetchLatestVersion(
	fetchImpl: typeof fetch,
	registries: readonly Registry[] = REGISTRIES,
	packageName = PACKAGE_NAME,
	timeoutMs = 10_000,
): Promise<LatestLookup> {
	const failures: string[] = [];
	for (const registry of registries) {
		let response: Response;
		try {
			response = await fetchImpl(metadataUrl(registry, packageName), {
				headers: { Accept: "application/vnd.npm.install-v1+json, application/json" },
				signal: AbortSignal.timeout(timeoutMs),
			});
		} catch (err) {
			failures.push(`${registry.label}: ${(err as Error).message}`);
			continue;
		}
		if (!response.ok) {
			failures.push(`${registry.label}: HTTP ${response.status}`);
			continue;
		}
		let body: unknown;
		try {
			body = await response.json();
		} catch {
			failures.push(`${registry.label}: unreadable metadata`);
			continue;
		}
		const tags = (body as { "dist-tags"?: Record<string, unknown> })["dist-tags"];
		const latest = tags?.latest;
		if (typeof latest !== "string" || latest.trim() === "") {
			failures.push(`${registry.label}: no latest tag`);
			continue;
		}
		return { version: latest.trim(), registry };
	}
	throw new Error(`no registry answered (${failures.join("; ")})`);
}

/** `1.2.3` style comparison, ignoring pre-release detail. Negative when a < b. */
export function compareVersions(a: string, b: string): number {
	const parse = (value: string): number[] =>
		value
			.replace(/^v/, "")
			.replace(/-.*$/, "")
			.split(".")
			.map((part) => Number.parseInt(part, 10))
			.map((part) => (Number.isFinite(part) ? part : 0));
	const left = parse(a);
	const right = parse(b);
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		const delta = (left[index] ?? 0) - (right[index] ?? 0);
		if (delta !== 0) {
			return delta;
		}
	}
	return 0;
}
