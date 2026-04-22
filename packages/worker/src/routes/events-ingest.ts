// POST /api/events — receive events from external webhooks
// Auth: Bearer <webhook_token> (not BAT_WRITE_KEY)
// IP validation: CF-Connecting-IP must match host's public_ip
import {
	EVENT_BODY_MAX_BYTES,
	EVENT_TAGS_MAX_COUNT,
	EVENT_TAG_MAX_LENGTH,
	EVENT_TITLE_MAX_LENGTH,
} from "@bat/shared";
import type { Context } from "hono";
import { checkRateLimit, findWebhookByToken, insertEvent } from "../services/events.js";
import type { AppEnv } from "../types.js";

export function extractBearerToken(header: string | undefined): string | null {
	if (!header) {
		return null;
	}
	const parts = header.split(" ");
	if (parts.length !== 2 || parts[0] !== "Bearer") {
		return null;
	}
	return parts[1] ?? null;
}

export type EventPayloadResult =
	| { ok: true; title: string; bodyStr: string; tags: string[] }
	| { ok: false; error: string };

/**
 * Validate POST /api/events payload (title / body / tags) and return the
 * serialised body string + normalised tags. Pure function — does not touch
 * the DB or check rate limits. Mirrors the error messages the route emits.
 */
export function validateEventPayload(body: unknown): EventPayloadResult {
	if (!body || typeof body !== "object") {
		return { ok: false, error: "Invalid payload" };
	}
	const payload = body as Record<string, unknown>;

	if (typeof payload.title !== "string" || payload.title.length === 0) {
		return { ok: false, error: "title is required" };
	}
	if (payload.title.length > EVENT_TITLE_MAX_LENGTH) {
		return { ok: false, error: `title must be at most ${EVENT_TITLE_MAX_LENGTH} characters` };
	}

	if (!payload.body || typeof payload.body !== "object" || Array.isArray(payload.body)) {
		return { ok: false, error: "body must be a JSON object" };
	}
	const bodyStr = JSON.stringify(payload.body);
	if (new TextEncoder().encode(bodyStr).byteLength > EVENT_BODY_MAX_BYTES) {
		return { ok: false, error: `body must be at most ${EVENT_BODY_MAX_BYTES} bytes` };
	}

	let tags: string[] = [];
	if (payload.tags !== undefined) {
		if (!Array.isArray(payload.tags)) {
			return { ok: false, error: "tags must be an array" };
		}
		if (payload.tags.length > EVENT_TAGS_MAX_COUNT) {
			return { ok: false, error: `tags must have at most ${EVENT_TAGS_MAX_COUNT} items` };
		}
		for (const tag of payload.tags) {
			if (typeof tag !== "string" || tag.length === 0 || tag.length > EVENT_TAG_MAX_LENGTH) {
				return {
					ok: false,
					error: `each tag must be a non-empty string of at most ${EVENT_TAG_MAX_LENGTH} chars`,
				};
			}
		}
		tags = payload.tags as string[];
	}

	return { ok: true, title: payload.title, bodyStr, tags };
}

export async function eventsIngestRoute(c: Context<AppEnv>) {
	// 1. Extract and validate webhook token
	const token = extractBearerToken(c.req.header("Authorization"));
	if (!token) {
		return c.json({ error: "Missing or invalid Authorization header" }, 401);
	}

	const db = c.env.DB;
	const config = await findWebhookByToken(db, token);
	if (!config) {
		return c.json({ error: "Invalid webhook token" }, 403);
	}

	// 2. IP validation: CF-Connecting-IP must match host's public_ip
	// Only trust CF-Connecting-IP (injected by Cloudflare, cannot be spoofed).
	// X-Forwarded-For is client-controlled and must NOT be used as fallback.
	const sourceIp = c.req.header("CF-Connecting-IP");
	if (!sourceIp) {
		return c.json({ error: "Missing CF-Connecting-IP header" }, 400);
	}
	const host = await db
		.prepare("SELECT public_ip FROM hosts WHERE host_id = ?")
		.bind(config.host_id)
		.first<{ public_ip: string | null }>();

	if (!host?.public_ip) {
		return c.json({ error: "Host has no public IP registered" }, 403);
	}

	if (sourceIp !== host.public_ip) {
		return c.json({ error: "Source IP does not match host" }, 403);
	}

	// 3. Parse and validate payload BEFORE rate limiting,
	//    so malformed requests don't consume rate-limit quota.
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	const result = validateEventPayload(body);
	if (!result.ok) {
		return c.json({ error: result.error }, 400);
	}
	const { title, bodyStr, tags } = result;

	// 4. Rate limiting — after payload validation so bad requests don't consume quota
	const nowSeconds = Math.floor(Date.now() / 1000);
	const withinLimit = await checkRateLimit(db, config.id, config.rate_limit, nowSeconds);
	if (!withinLimit) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}

	// 5. Insert event
	await insertEvent(
		db,
		config.host_id,
		config.id,
		title,
		bodyStr,
		tags,
		sourceIp,
		nowSeconds,
	);

	return c.body(null, 204);
}
