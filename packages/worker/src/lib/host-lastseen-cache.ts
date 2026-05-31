// Host last_seen 5min flush cache for ingest.
//
// `/api/ingest` currently calls `insertRawWithHostUpsert` with mode='existing'
// which runs a `UPDATE hosts SET last_seen = ?` next to the `metrics_raw`
// INSERT in the same D1 batch. With 6 hosts × ~30 ingests/15min that is
// ~180 D1 writes / 15min just to bump a column that nobody reads with
// sub-minute precision.
//
// Throttle: record per-host snapshot in KV with two timestamps:
//   - `last_observed_at`: bumped on EVERY ingest (cheap KV write)
//   - `last_flush_at`:   bumped only when we actually wrote to D1
// While `now - last_flush_at < THROTTLE` skip the host UPDATE; otherwise
// flush to D1 and record both timestamps.
//
// Read consumers (`/api/hosts`, `/api/host-detail`, `/api/fleet/status`,
// `/api/monitoring/*`) MUST overlay `last_observed_at` over D1's
// `hosts.last_seen` before deriving offline status — otherwise an actively
// reporting probe would flip to `offline` between flush windows. Use
// `loadObservedSeenBatch` to fetch overlays for a batch of hosts.
//
// First-seen hosts MUST never be skipped — only `existing` ingest path
// can opt in. KV failure semantics are best-effort: load() miss/throw →
// flush (safe default); record() throw → swallowed (next ingest re-records).

const KEY_PREFIX = "bat:host:lastseen:";
export const HOST_LAST_SEEN_FLUSH_SECONDS = 300;
/** TTL ≥ throttle so a snapshot does not expire mid-window. */
export const HOST_LAST_SEEN_TTL_SECONDS = 600;

export interface HostLastSeenSnapshot {
	/** Most recent ingest observed (used by read paths). */
	last_observed_at: number;
	/** Most recent D1 `hosts.last_seen` write (used by the throttle). */
	last_flush_at: number;
}

export function hostLastSeenKey(hostId: string): string {
	return `${KEY_PREFIX}${hostId}`;
}

export async function loadLastSeen(
	kv: KVNamespace | undefined,
	hostId: string,
): Promise<HostLastSeenSnapshot | null> {
	if (!kv) {
		return null;
	}
	try {
		const raw = await kv.get(hostLastSeenKey(hostId), "json");
		return (raw as HostLastSeenSnapshot | null) ?? null;
	} catch {
		return null;
	}
}

/** Persist both timestamps. Called after every ingest:
 *  - on flush:        observed = flush = now
 *  - on skip-touch:   observed = now; flush = previous snapshot's flush */
export async function recordSnapshot(
	kv: KVNamespace | undefined,
	hostId: string,
	snapshot: HostLastSeenSnapshot,
): Promise<void> {
	if (!kv) {
		return;
	}
	try {
		await kv.put(hostLastSeenKey(hostId), JSON.stringify(snapshot), {
			expirationTtl: HOST_LAST_SEEN_TTL_SECONDS,
		});
	} catch {
		// best-effort
	}
}

/** Pure decision: should this ingest write `last_seen` to D1? Exported for
 *  unit tests. */
export function shouldFlushLastSeen(args: {
	now: number;
	snapshot: HostLastSeenSnapshot | null;
	throttleSeconds?: number;
}): boolean {
	if (!args.snapshot) {
		return true;
	}
	const throttle = args.throttleSeconds ?? HOST_LAST_SEEN_FLUSH_SECONDS;
	return args.now - args.snapshot.last_flush_at >= throttle;
}

/** Read overlay map for a batch of hosts. Returns
 *  Map<host_id, last_observed_at>. Missing entries / KV failure → empty
 *  map (caller falls back to D1 `hosts.last_seen`). */
export async function loadObservedSeenBatch(
	kv: KVNamespace | undefined,
	hostIds: string[],
): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	if (!kv || hostIds.length === 0) {
		return out;
	}
	await Promise.all(
		hostIds.map(async (id) => {
			const snap = await loadLastSeen(kv, id);
			if (snap) {
				out.set(id, snap.last_observed_at);
			}
		}),
	);
	return out;
}

/** Pure helper: pick the freshest of D1 `last_seen` and the optional KV
 *  overlay. Exported for unit tests. */
export function freshestLastSeen(d1LastSeen: number, overlay: number | undefined): number {
	if (overlay == null) {
		return d1LastSeen;
	}
	return overlay > d1LastSeen ? overlay : d1LastSeen;
}
