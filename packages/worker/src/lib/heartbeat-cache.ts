// Heartbeat 5min D1 write throttle (conservative).
//
// The agents `SELECT` keeps the (id, match_key, status) columns we already had.
// Runtime fields (`runtime_app`, `runtime_version`) and the last D1 write time
// are tracked in KV per `(source_key, match_key)` so we can skip UPDATE
// statements when nothing changed AND the last D1 flush is <5min old.
//
// Throttle decision:
//   skip iff
//     entry.status === existing.status                                     (D1)
//     && entry.runtime_app missing OR matches snapshot.runtime_app         (KV)
//     && entry.runtime_version missing OR matches snapshot.runtime_version (KV)
//     && now - snapshot.last_flush_at < THROTTLE_SECONDS                   (KV)
//
// Otherwise the original D1 UPDATE goes into the batch and we record a fresh
// snapshot (last_flush_at = now). KV failure is treated as "no snapshot
// available" → we always flush, preserving correctness when KV is degraded.

import type { AgentStatus } from "@bat/shared";

const KEY_PREFIX = "bat:agent:state:";
/** Maximum interval between D1 writes for an unchanging agent. */
export const HEARTBEAT_THROTTLE_SECONDS = 300;
/** KV TTL — must comfortably exceed THROTTLE_SECONDS so a snapshot does not
 *  expire mid-window and force an unnecessary flush. */
export const HEARTBEAT_SNAPSHOT_TTL_SECONDS = 600;

export interface HeartbeatSnapshot {
	status: AgentStatus;
	runtime_app: string | null;
	runtime_version: string | null;
	last_flush_at: number;
}

export function snapshotKey(sourceKey: string, matchKey: string): string {
	return `${KEY_PREFIX}${sourceKey}:${matchKey}`;
}

export async function loadSnapshot(
	kv: KVNamespace | undefined,
	sourceKey: string,
	matchKey: string,
): Promise<HeartbeatSnapshot | null> {
	if (!kv) {
		return null;
	}
	try {
		const raw = await kv.get(snapshotKey(sourceKey, matchKey), "json");
		return (raw as HeartbeatSnapshot | null) ?? null;
	} catch {
		return null;
	}
}

export async function writeSnapshot(
	kv: KVNamespace | undefined,
	sourceKey: string,
	matchKey: string,
	snapshot: HeartbeatSnapshot,
): Promise<void> {
	if (!kv) {
		return;
	}
	try {
		await kv.put(snapshotKey(sourceKey, matchKey), JSON.stringify(snapshot), {
			expirationTtl: HEARTBEAT_SNAPSHOT_TTL_SECONDS,
		});
	} catch {
		// best-effort — caller treats failure as "no snapshot next time"
	}
}

/** Pure decision helper. Exported for unit testing — no IO. */
export function shouldFlush(args: {
	now: number;
	existingStatus: AgentStatus;
	entryStatus: AgentStatus;
	entryRuntimeAppProvided: boolean;
	entryRuntimeApp: string | null | undefined;
	entryRuntimeVersionProvided: boolean;
	entryRuntimeVersion: string | null | undefined;
	snapshot: HeartbeatSnapshot | null;
	throttleSeconds?: number;
}): boolean {
	const throttle = args.throttleSeconds ?? HEARTBEAT_THROTTLE_SECONDS;

	if (args.entryStatus !== args.existingStatus) {
		return true;
	}
	if (!args.snapshot) {
		// No prior knowledge of when D1 was last written → flush to refresh.
		return true;
	}
	if (args.now - args.snapshot.last_flush_at >= throttle) {
		return true;
	}
	if (args.entryRuntimeAppProvided) {
		const next = args.entryRuntimeApp ?? null;
		if (next !== args.snapshot.runtime_app) {
			return true;
		}
	}
	if (args.entryRuntimeVersionProvided) {
		const next = args.entryRuntimeVersion ?? null;
		if (next !== args.snapshot.runtime_version) {
			return true;
		}
	}
	return false;
}
