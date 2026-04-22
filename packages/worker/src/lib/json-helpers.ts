// Shared parsing helpers for worker route/service modules.
//
// These were duplicated across at least three files
// (host-detail.ts, hosts.ts, tier2-metrics.ts). Centralising them removes
// drift risk and lets the parsing rules be unit-tested in one place.

/**
 * Parse a JSON string defensively. Returns `null` on empty input or invalid
 * JSON instead of throwing — callers always treated parse failures the same.
 */
export function safeParse<T>(json: string | null): T | null {
	if (!json) {
		return null;
	}
	try {
		return JSON.parse(json) as T;
	} catch {
		return null;
	}
}

interface DiskJsonEntry {
	mount: string;
	used_pct: number;
}

/**
 * Parse `disk_json` and return the `used_pct` of the root mount (`/`),
 * or `null` if the JSON is missing/invalid or no root mount is present.
 */
export function extractRootDiskPct(diskJson: string | null): number | null {
	const disks = safeParse<DiskJsonEntry[]>(diskJson);
	if (!disks) {
		return null;
	}
	const root = disks.find((d) => d.mount === "/");
	return root?.used_pct ?? null;
}

interface NetJsonEntry {
	rx_bytes: number;
	tx_bytes: number;
}

/**
 * Sum `rx_bytes` / `tx_bytes` across all interfaces in `net_json`.
 * Returns `{ rx: null, tx: null }` on empty/invalid input so callers can
 * preserve the "unknown" tri-state in their DTOs.
 */
export function extractNetRates(netJson: string | null): { rx: number | null; tx: number | null } {
	const ifaces = safeParse<NetJsonEntry[]>(netJson);
	if (!ifaces) {
		return { rx: null, tx: null };
	}
	let rx = 0;
	let tx = 0;
	for (const iface of ifaces) {
		rx += iface.rx_bytes ?? 0;
		tx += iface.tx_bytes ?? 0;
	}
	return { rx, tx };
}
