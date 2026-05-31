// CLI token KV cache + revoke sentinel.
//
// Goal: cut the per-request D1 SELECT + UPDATE that `cliTokens.findByHashAndTouch`
// runs on every authenticated CLI call. With CLI heartbeats at 60s and 6 hosts
// that is ~180 D1 statements / 15min on the auth path alone (2 stmts × 90 calls).
//
// Validation order MUST be:
//   1. revoked sentinel  (`bat:clitoken:revoked:{hash}`)
//   2. positive cache    (`bat:clitoken:{hash}`)
//   3. D1 (`cliTokens.findByHashAndTouch`) on miss; on success populate cache.
//
// All KV failures fall back to D1 — auth must remain available if KV is degraded.

import type { CliTokenRow, CliTokenScope } from "@bat/shared";

const KEY_PREFIX = "bat:clitoken:";
const REVOKED_PREFIX = "bat:clitoken:revoked:";
/** Positive cache TTL — accept up to this delay for `last_used_at` updates. */
export const CLI_TOKEN_CACHE_TTL_SECONDS = 300;
/** Revoke sentinel TTL — must be ≥ positive cache TTL so a stale cache cannot
 *  resurrect a revoked token within the eventual-consistency window. */
export const CLI_TOKEN_REVOKED_TTL_SECONDS = 300;

export function tokenCacheKey(hash: string): string {
	return `${KEY_PREFIX}${hash}`;
}

export function tokenRevokedKey(hash: string): string {
	return `${REVOKED_PREFIX}${hash}`;
}

/** Subset of CliTokenRow stored in KV. We avoid mutating fields that are
 *  cheap to recompute (`last_used_at` is intentionally NOT refreshed from
 *  cache — its precision drops to TTL granularity). */
export interface CachedCliToken {
	id: number;
	token_hash: string;
	label: string;
	scope: CliTokenScope;
	created_at: number;
}

export function toCached(row: CliTokenRow): CachedCliToken {
	return {
		id: row.id,
		token_hash: row.token_hash,
		label: row.label,
		scope: row.scope,
		created_at: row.created_at,
	};
}

export function fromCached(c: CachedCliToken): CliTokenRow {
	return {
		id: c.id,
		token_hash: c.token_hash,
		label: c.label,
		scope: c.scope,
		created_at: c.created_at,
		last_used_at: null,
	};
}

/** Read+validate path. Returns:
 *   - { revoked: true }  when revoke sentinel present (auth must reject)
 *   - { hit: row }       when positive cache hit
 *   - { miss: true }     when neither key is present, or KV failed
 *
 *  Never throws — KV failure is treated identically to a miss. */
export async function lookupToken(
	kv: KVNamespace | undefined,
	hash: string,
): Promise<
	{ revoked: true } | { hit: CliTokenRow; revoked?: false } | { miss: true; revoked?: false }
> {
	if (!kv) {
		return { miss: true };
	}
	try {
		const revoked = await kv.get(tokenRevokedKey(hash));
		if (revoked !== null) {
			return { revoked: true };
		}
		const cached = await kv.get(tokenCacheKey(hash), "json");
		if (cached) {
			return { hit: fromCached(cached as CachedCliToken) };
		}
		return { miss: true };
	} catch {
		return { miss: true };
	}
}

/** Populate positive cache after a successful D1 lookup. Best-effort —
 *  swallow errors so a KV outage cannot break the auth response. */
export async function rememberToken(kv: KVNamespace | undefined, row: CliTokenRow): Promise<void> {
	if (!kv) {
		return;
	}
	try {
		await kv.put(tokenCacheKey(row.token_hash), JSON.stringify(toCached(row)), {
			expirationTtl: CLI_TOKEN_CACHE_TTL_SECONDS,
		});
	} catch {
		// ignore — caller already has the D1-resolved row
	}
}

/** Mark a token as revoked and best-effort delete its positive cache.
 *  Both writes are independent: a failure on one does not skip the other. */
export async function markRevoked(kv: KVNamespace | undefined, hash: string): Promise<void> {
	if (!kv) {
		return;
	}
	try {
		await kv.put(tokenRevokedKey(hash), "1", {
			expirationTtl: CLI_TOKEN_REVOKED_TTL_SECONDS,
		});
	} catch {
		// ignore
	}
	try {
		await kv.delete(tokenCacheKey(hash));
	} catch {
		// ignore
	}
}
