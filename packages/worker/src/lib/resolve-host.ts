// Shared host-id resolution for route handlers.
//
// Route params may arrive as either a raw `host_id` or as an 8-char
// opaque hex `hid` (FNV-1a hash of host_id). This helper normalizes to
// the real host_id so every route can work uniformly.

import { hashHostId } from "@bat/shared";
import type { HostsRepository } from "../repos/types.js";

const HID_RE = /^[0-9a-f]{8}$/;

/** `true` when `id` matches the opaque-hid format (8 lowercase hex chars). */
export function isOpaqueHid(id: string): boolean {
	return HID_RE.test(id);
}

/**
 * Resolve a route param to a real `host_id` via a `HostsRepository`.
 *
 * - If `id` is not a hid, it's returned as-is (caller still needs to
 *   verify the host exists if that matters).
 * - If `id` is a hid, scan active hosts and match by `hashHostId`.
 *   Returns `null` when no active host matches.
 */
export async function resolveHostIdByHash(
	repo: HostsRepository,
	id: string,
): Promise<string | null> {
	if (!isOpaqueHid(id)) {
		return id;
	}
	const rows = await repo.listActiveHostIds();
	for (const row of rows) {
		if (hashHostId(row.host_id) === id) {
			return row.host_id;
		}
	}
	return null;
}

/**
 * Resolve a route param to a `{ host_id, is_active }` record.
 * Unlike `resolveHostIdByHash`, this scans both active and retired hosts
 * (used by maintenance routes that need to 403 on retired hosts).
 */
export async function resolveHostRecord(
	repo: HostsRepository,
	id: string,
): Promise<{ host_id: string; is_active: number } | null> {
	if (!isOpaqueHid(id)) {
		return repo.getActiveFlag(id);
	}
	const rows = await repo.listAllHostIdsWithActive();
	for (const row of rows) {
		if (hashHostId(row.host_id) === id) {
			return row;
		}
	}
	return null;
}
