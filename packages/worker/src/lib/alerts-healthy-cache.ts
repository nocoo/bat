// Ingest alert healthy sentinel.
//
// `evaluateAlerts` reads alert_states + alert_pending for a host on every
// metrics ingest. When a host has been healthy for a while the rule evaluator
// returns an empty `results` array and both tables are also empty — that's 2
// D1 reads / ingest with no writes / 90 calls per 15min for 6 hosts = 180
// stmts that contribute nothing.
//
// Optimisation: keep a short-lived KV sentinel `bat:host:alerts:empty:{host}`.
// When the worker has just observed (active=0, pending=0) AND the new payload
// is itself rule-healthy, the next ingest can skip both reads.
//
// Sentinel write happens AFTER `evaluateAlerts` returns — i.e. after we have
// observed an empty state AND made no writes. Any state mutation
// (planAlertWrites pushed statements, or a clearPendingForHost / promotion /
// demotion path) MUST invalidate the sentinel before returning, otherwise the
// next ingest could falsely skip the D1 reads and miss a recovery.
//
// KV failure on read: treat as miss → fall through to D1.
// KV failure on write: best-effort — if we cannot persist the sentinel the
//   next ingest just runs the same 2 reads, which is the pre-T3 behaviour.

const KEY_PREFIX = "bat:host:alerts:empty:";
export const ALERTS_HEALTHY_SENTINEL_TTL_SECONDS = 120;

export function alertsHealthySentinelKey(hostId: string): string {
	return `${KEY_PREFIX}${hostId}`;
}

export async function isMarkedHealthy(
	kv: KVNamespace | undefined,
	hostId: string,
): Promise<boolean> {
	if (!kv) {
		return false;
	}
	try {
		return (await kv.get(alertsHealthySentinelKey(hostId))) !== null;
	} catch {
		return false;
	}
}

export async function markHealthy(kv: KVNamespace | undefined, hostId: string): Promise<void> {
	if (!kv) {
		return;
	}
	try {
		await kv.put(alertsHealthySentinelKey(hostId), "1", {
			expirationTtl: ALERTS_HEALTHY_SENTINEL_TTL_SECONDS,
		});
	} catch {
		// best-effort
	}
}

export async function invalidateHealthy(
	kv: KVNamespace | undefined,
	hostId: string,
): Promise<void> {
	if (!kv) {
		return;
	}
	try {
		await kv.delete(alertsHealthySentinelKey(hostId));
	} catch {
		// best-effort — a stale sentinel only delays alerts up to TTL
	}
}
