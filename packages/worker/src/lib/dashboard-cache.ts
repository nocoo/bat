// Dashboard short-TTL cache backed by BAT_KV.
//
// Why KV instead of `caches.default`:
//   - The browser endpoint sits behind Cloudflare Access; Workers fronted
//     by Access do NOT have a usable Cache API.
//   - Cache API also strips URL fragments during request matching, so
//     putting auth-variant digests in `#...` is unsafe as an isolation
//     dimension.
//
// Design:
//   - One KV entry per (method, path, query, verified-auth-identity).
//   - The auth digest is part of the KV key (a flat string), so two
//     clients with different keys never collide.
//   - Stored value is the JSON response body string. Re-served as a
//     `Response` with `Content-Type: application/json` and a short
//     `Cache-Control: max-age=...` so dashboards can keep their own
//     SWR cadence honest.
//   - 30s TTL; stale up to TTL is acceptable for the dashboard.
//   - KV failure (read or write) → never throws; caller falls back to
//     the underlying handler.
//   - No write-path invalidation: TTL bounds staleness; KV cannot be
//     range-purged for auth-keyed variants.

const KEY_PREFIX = "bat:dash:";

export interface DashboardCacheOptions {
	/** Logical route name — segment in the KV key (e.g. "hosts", "alerts"). */
	route: string;
	ttlSeconds: number;
}

async function sha256Hex(input: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
	const bytes = new Uint8Array(buf);
	let hex = "";
	for (const b of bytes) {
		hex += b.toString(16).padStart(2, "0");
	}
	return hex;
}

/** Compose a stable KV key for `req`. Two requests with the same method,
 *  path, query, and verified auth identity collapse onto the same key.
 *  The auth credential is hashed; nothing recoverable goes into the key. */
export async function buildCacheKey(req: Request, route: string): Promise<string> {
	const url = new URL(req.url);
	const auth = req.headers.get("Authorization") ?? req.headers.get("Cf-Access-Jwt-Assertion") ?? "";
	const authPart = auth.length > 0 ? await sha256Hex(auth) : "anon";
	const reqPart = await sha256Hex(`${req.method}\n${url.pathname}\n${url.search}`);
	return `${KEY_PREFIX}${route}:${authPart}:${reqPart}`;
}

/** Try to serve a cached JSON response for `req`. Returns null on miss,
 *  on KV failure, or when no KV binding is wired. Never throws. */
export async function tryReadCache(
	kv: KVNamespace | undefined,
	req: Request,
	opts: DashboardCacheOptions,
): Promise<Response | null> {
	if (!kv) {
		return null;
	}
	try {
		const key = await buildCacheKey(req, opts.route);
		const body = await kv.get(key);
		if (body == null) {
			return null;
		}
		return new Response(body, {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": `max-age=${opts.ttlSeconds}`,
				"X-Bat-Cache": "hit",
			},
		});
	} catch {
		return null;
	}
}

/** Persist a 200 JSON response under the request's cache key. The original
 *  response body is consumed via `clone()` so the caller can still return
 *  the source response. Best-effort — failures are swallowed. */
export async function writeCache(
	kv: KVNamespace | undefined,
	req: Request,
	response: Response,
	opts: DashboardCacheOptions,
): Promise<void> {
	if (response.status !== 200) {
		return;
	}
	if (!kv) {
		return;
	}
	try {
		const key = await buildCacheKey(req, opts.route);
		const body = await response.clone().text();
		await kv.put(key, body, { expirationTtl: opts.ttlSeconds });
	} catch {
		// best-effort
	}
}
