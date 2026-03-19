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

function extractBearerToken(header: string | undefined): string | null {
	if (!header) return null;
	const parts = header.split(" ");
	if (parts.length !== 2 || parts[0] !== "Bearer") return null;
	return parts[1];
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
	const sourceIp = c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "";
	const host = await db
		.prepare("SELECT public_ip FROM hosts WHERE host_id = ?")
		.bind(config.host_id)
		.first<{ public_ip: string | null }>();

	if (!host || !host.public_ip) {
		return c.json({ error: "Host has no public IP registered" }, 403);
	}

	if (sourceIp !== host.public_ip) {
		return c.json({ error: "Source IP does not match host" }, 403);
	}

	// 3. Rate limiting
	const nowSeconds = Math.floor(Date.now() / 1000);
	const withinLimit = await checkRateLimit(db, config.id, config.rate_limit, nowSeconds);
	if (!withinLimit) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}

	// 4. Parse and validate payload
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!body || typeof body !== "object") {
		return c.json({ error: "Invalid payload" }, 400);
	}

	const payload = body as Record<string, unknown>;

	// title: required, 1-200 chars
	if (typeof payload.title !== "string" || payload.title.length === 0) {
		return c.json({ error: "title is required" }, 400);
	}
	if (payload.title.length > EVENT_TITLE_MAX_LENGTH) {
		return c.json({ error: `title must be at most ${EVENT_TITLE_MAX_LENGTH} characters` }, 400);
	}

	// body: required, valid JSON object, ≤16KB
	if (!payload.body || typeof payload.body !== "object" || Array.isArray(payload.body)) {
		return c.json({ error: "body must be a JSON object" }, 400);
	}
	const bodyStr = JSON.stringify(payload.body);
	if (new TextEncoder().encode(bodyStr).byteLength > EVENT_BODY_MAX_BYTES) {
		return c.json({ error: `body must be at most ${EVENT_BODY_MAX_BYTES} bytes` }, 400);
	}

	// tags: optional, ≤10 items, each ≤50 chars
	let tags: string[] = [];
	if (payload.tags !== undefined) {
		if (!Array.isArray(payload.tags)) {
			return c.json({ error: "tags must be an array" }, 400);
		}
		if (payload.tags.length > EVENT_TAGS_MAX_COUNT) {
			return c.json({ error: `tags must have at most ${EVENT_TAGS_MAX_COUNT} items` }, 400);
		}
		for (const tag of payload.tags) {
			if (typeof tag !== "string" || tag.length === 0 || tag.length > EVENT_TAG_MAX_LENGTH) {
				return c.json(
					{ error: `each tag must be a non-empty string of at most ${EVENT_TAG_MAX_LENGTH} chars` },
					400,
				);
			}
		}
		tags = payload.tags as string[];
	}

	// 5. Insert event
	await insertEvent(
		db,
		config.host_id,
		config.id,
		payload.title,
		bodyStr,
		tags,
		sourceIp,
		nowSeconds,
	);

	return c.body(null, 204);
}
