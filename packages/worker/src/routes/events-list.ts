// GET /api/events — list events with optional host_id filter and pagination
import type { EventItem, EventsListResponse } from "@bat/shared";
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
	const hostId = c.req.query("host_id");
	const { limit, offset } = parsePagination(c.req.query("limit"), c.req.query("offset"));

	const total = await c.var.repos.events.count(hostId);
	const rows = await c.var.repos.events.list(hostId, limit, offset);

	const items: EventItem[] = rows.map((row) => ({
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
