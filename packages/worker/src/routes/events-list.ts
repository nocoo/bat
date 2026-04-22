// GET /api/events — list events with optional host_id filter and pagination
import type { EventItem, EventRow, EventsListResponse } from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 500;

/**
 * Parse optional `limit` / `offset` query-string numbers into a safe
 * pagination window. Invalid / negative inputs fall back to defaults.
 * Pure — unit-tested directly.
 */
export function parsePagination(
	limitParam: string | undefined,
	offsetParam: string | undefined,
): { limit: number; offset: number } {
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
	return { limit, offset };
}

export async function eventsListRoute(c: Context<AppEnv>) {
	const db = c.env.DB;

	const hostId = c.req.query("host_id");
	const { limit, offset } = parsePagination(c.req.query("limit"), c.req.query("offset"));

	// Query total count
	let totalResult: D1Result<{ count: number }>;
	if (hostId) {
		totalResult = await db
			.prepare("SELECT COUNT(*) as count FROM events WHERE host_id = ?")
			.bind(hostId)
			.all<{ count: number }>();
	} else {
		totalResult = await db.prepare("SELECT COUNT(*) as count FROM events").all<{ count: number }>();
	}
	const total = totalResult.results[0]?.count ?? 0;

	// Query events
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

	const response: EventsListResponse = { items, total, limit, offset };
	return c.json(response);
}

export function parseTags(raw: string): string[] {
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed : [];
	} catch {
		return [];
	}
}
