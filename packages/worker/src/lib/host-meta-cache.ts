// Host meta projection KV cache for ingest/tier2/identity hot paths.
//
// `/api/ingest` calls `getActiveAndMaintenance` and `/api/tier2`/`/api/identity`
// call `getActiveFlag` on every request just to check retired-flag + (for
// ingest) maintenance window. With 6 hosts × ~30 ingests/15min that is ~180
// D1 reads / 15min that almost never change.
//
// Cache the projection per-host with a short TTL. Validation is end-to-end:
//   - KV miss / throw  → fall through to D1, then populate.
//   - KV hit           → skip the D1 SELECT.
//   - D1 returned null (first-seen host)  → do NOT cache; a new host upsert
//     should land in D1 the moment it appears, not be masked for 120s by a
//     negative cache.
//   - retire / maintenance write paths SHOULD `invalidate(...)` so the
//     change takes effect on the next ingest; absent that the worst case is
//     the TTL ceiling (120s).
//
// KV failures never throw — the caller falls back to the existing D1 path.

export interface HostMetaProjection {
	is_active: number;
	maintenance_start: string | null;
	maintenance_end: string | null;
}

const KEY_PREFIX = "bat:host:meta:";
/** Worst-case staleness for retired/maintenance changes when the write path
 *  forgets to invalidate. Conservative — same order of magnitude as the
 *  alert sentinel TTL. */
export const HOST_META_TTL_SECONDS = 120;

export function hostMetaKey(hostId: string): string {
	return `${KEY_PREFIX}${hostId}`;
}

/** Read the projection from KV. Returns null on miss, on KV failure, or
 *  when no KV binding is wired. Never throws. */
export async function loadHostMeta(
	kv: KVNamespace | undefined,
	hostId: string,
): Promise<HostMetaProjection | null> {
	if (!kv) {
		return null;
	}
	try {
		const raw = await kv.get(hostMetaKey(hostId), "json");
		return (raw as HostMetaProjection | null) ?? null;
	} catch {
		return null;
	}
}

/** Best-effort populate after a successful D1 hit. Pass the projection that
 *  D1 returned; pass `null` to skip caching (used for first-seen hosts). */
export async function storeHostMeta(
	kv: KVNamespace | undefined,
	hostId: string,
	row: HostMetaProjection | null,
): Promise<void> {
	if (!kv || row === null) {
		return;
	}
	try {
		await kv.put(hostMetaKey(hostId), JSON.stringify(row), {
			expirationTtl: HOST_META_TTL_SECONDS,
		});
	} catch {
		// best-effort
	}
}

/** Best-effort invalidate. Used by retire/maintenance write paths so the
 *  next ingest sees the new state without waiting for TTL. KV failure is
 *  swallowed — worst case the change is delayed up to TTL. */
export async function invalidateHostMeta(
	kv: KVNamespace | undefined,
	hostId: string,
): Promise<void> {
	if (!kv) {
		return;
	}
	try {
		await kv.delete(hostMetaKey(hostId));
	} catch {
		// best-effort
	}
}
