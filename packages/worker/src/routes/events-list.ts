// GET /api/events — list events with optional host_id filter
import type { EventItem, EventRow } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function eventsListRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

	const hostId = c.req.query("host_id");
	const limitParam = c.req.query("limit");
	const offsetParam = c.req.query("offset");

	let limit = DEFAULT_LIMIT;
	if (limitParam) {
		const parsed = Number.parseInt(limitParam, 10);
		if (!Number.isNaN(parsed) && parsed > 0) {
			limit = Math.min(parsed, MAX_LIMIT);
		}
	}

	let offset = 0;
	if (offsetParam) {
		const parsed = Number.parseInt(offsetParam, 10);
		if (!Number.isNaN(parsed) && parsed >= 0) {
			offset = parsed;
		}
	}

	let result: D1Result<EventRow>;
	if (hostId) {
		result = await db
			.prepare(
				`SELECT e.id, e.host_id, h.hostname, e.title, e.body, e.tags, e.source_ip, e.created_at
FROM events e
JOIN hosts h ON e.host_id = h.host_id
WHERE e.host_id = ?
ORDER BY e.created_at DESC
LIMIT ? OFFSET ?`,
			)
			.bind(hostId, limit, offset)
			.all<EventRow>();
	} else {
		result = await db
			.prepare(
				`SELECT e.id, e.host_id, h.hostname, e.title, e.body, e.tags, e.source_ip, e.created_at
FROM events e
JOIN hosts h ON e.host_id = h.host_id
ORDER BY e.created_at DESC
LIMIT ? OFFSET ?`,
			)
			.bind(limit, offset)
			.all<EventRow>();
	}

	const items: EventItem[] = result.results.map((row) => ({
		...row,
		tags: parseTags(row.tags),
	}));

	return c.json(items);
}

function parseTags(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
