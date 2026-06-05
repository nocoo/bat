// Asset CRUD routes
// POST   /api/assets          — create asset
// GET    /api/assets          — list all assets
// GET    /api/assets/:id      — get single asset
// PATCH  /api/assets/:id      — update asset fields
// DELETE /api/assets/:id      — hard delete
// PUT    /api/assets/:id/tags — replace tag list

import {
	ASSET_NAME_MAX_LENGTH,
	ASSET_PROVIDER_MAX_LENGTH,
	ASSET_SUBTYPE_MAX_LENGTH,
	generateId,
	MAX_TAGS_PER_ASSET,
	VALID_ASSET_STATUSES,
	VALID_ASSET_TYPES,
	validateEnum,
	validateMetadata,
	validateOptionalEnum,
	validateOptionalString,
	validateString,
} from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

export async function assetsListRoute(c: Context<AppEnv>) {
	const items = await c.var.repos.assets.list();
	return c.json(items);
}

export async function assetsGetRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";
	const item = await c.var.repos.assets.getById(id);
	if (!item) {
		return c.json({ error: "Asset not found" }, 404);
	}
	return c.json(item);
}

export async function assetsCreateRoute(c: Context<AppEnv>) {
	const raw = await c.req.text();
	if (raw.trim().length === 0) {
		return c.json({ error: "Request body required" }, 400);
	}

	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return c.json({ error: "Request body must be a JSON object" }, 400);
	}
	const obj = body as Record<string, unknown>;

	const typeResult = validateEnum(
		"type",
		obj.type,
		VALID_ASSET_TYPES as unknown as readonly string[],
	);
	if (!typeResult.ok) {
		return c.json({ error: typeResult.error }, 400);
	}
	const nameResult = validateString("name", obj.name, ASSET_NAME_MAX_LENGTH);
	if (!nameResult.ok) {
		return c.json({ error: nameResult.error }, 400);
	}

	const subtypeResult = validateOptionalString("subtype", obj.subtype, ASSET_SUBTYPE_MAX_LENGTH);
	if (!subtypeResult.ok) {
		return c.json({ error: subtypeResult.error }, 400);
	}
	const providerResult = validateOptionalString(
		"provider",
		obj.provider,
		ASSET_PROVIDER_MAX_LENGTH,
	);
	if (!providerResult.ok) {
		return c.json({ error: providerResult.error }, 400);
	}
	const statusResult = validateOptionalEnum(
		"status",
		obj.status,
		VALID_ASSET_STATUSES as unknown as readonly string[],
	);
	if (!statusResult.ok) {
		return c.json({ error: statusResult.error }, 400);
	}

	let metadataJson = "{}";
	if (obj.metadata !== undefined) {
		const metaResult = validateMetadata(obj.metadata);
		if (!metaResult.ok) {
			return c.json({ error: metaResult.error }, 400);
		}
		metadataJson = metaResult.value;
	}

	if (obj.host_id !== undefined && obj.host_id !== null) {
		if (typeof obj.host_id !== "string" || obj.host_id.length === 0) {
			return c.json({ error: "host_id must be a non-empty string or null" }, 400);
		}
		const exists = await c.var.repos.assets.hostExists(obj.host_id);
		if (!exists) {
			return c.json({ error: `host_id "${obj.host_id}" does not exist` }, 400);
		}
	}

	const id = generateId("ast_");
	await c.var.repos.assets.create({
		id,
		host_id: (obj.host_id as string | null) ?? null,
		type: typeResult.value,
		subtype: subtypeResult.value ?? null,
		name: nameResult.value,
		provider: providerResult.value ?? null,
		status: statusResult.value ?? "active",
		metadata: metadataJson,
	});

	const item = await c.var.repos.assets.getById(id);
	return c.json(item, 201);
}

export async function assetsUpdateRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";

	const existing = await c.var.repos.assets.getById(id);
	if (!existing) {
		return c.json({ error: "Asset not found" }, 404);
	}

	const raw = await c.req.text();
	if (raw.trim().length === 0) {
		return c.json({ error: "Request body required" }, 400);
	}

	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return c.json({ error: "Request body must be a JSON object" }, 400);
	}
	const obj = body as Record<string, unknown>;

	const nameResult =
		obj.name !== undefined
			? validateString("name", obj.name, ASSET_NAME_MAX_LENGTH)
			: { ok: true as const, value: undefined };
	if (!nameResult.ok) {
		return c.json({ error: nameResult.error }, 400);
	}
	const subtypeResult = validateOptionalString("subtype", obj.subtype, ASSET_SUBTYPE_MAX_LENGTH);
	if (!subtypeResult.ok) {
		return c.json({ error: subtypeResult.error }, 400);
	}
	const providerResult = validateOptionalString(
		"provider",
		obj.provider,
		ASSET_PROVIDER_MAX_LENGTH,
	);
	if (!providerResult.ok) {
		return c.json({ error: providerResult.error }, 400);
	}
	const statusResult = validateOptionalEnum(
		"status",
		obj.status,
		VALID_ASSET_STATUSES as unknown as readonly string[],
	);
	if (!statusResult.ok) {
		return c.json({ error: statusResult.error }, 400);
	}

	let metadataJson: string | undefined;
	if (obj.metadata !== undefined) {
		const metaResult = validateMetadata(obj.metadata);
		if (!metaResult.ok) {
			return c.json({ error: metaResult.error }, 400);
		}
		metadataJson = metaResult.value;
	}

	if (obj.host_id !== undefined && obj.host_id !== null) {
		if (typeof obj.host_id !== "string" || obj.host_id.length === 0) {
			return c.json({ error: "host_id must be a non-empty string or null" }, 400);
		}
		const exists = await c.var.repos.assets.hostExists(obj.host_id);
		if (!exists) {
			return c.json({ error: `host_id "${obj.host_id}" does not exist` }, 400);
		}
	}

	await c.var.repos.assets.update(id, {
		host_id: obj.host_id !== undefined ? (obj.host_id as string | null) : undefined,
		name: obj.name !== undefined ? nameResult.value : undefined,
		subtype: obj.subtype !== undefined ? subtypeResult.value : undefined,
		provider: obj.provider !== undefined ? providerResult.value : undefined,
		status: obj.status !== undefined ? (statusResult.value ?? undefined) : undefined,
		metadata: metadataJson,
	});

	const item = await c.var.repos.assets.getById(id);
	return c.json(item);
}

export async function assetsDeleteRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";
	const deleted = await c.var.repos.assets.delete(id);
	if (!deleted) {
		return c.json({ error: "Asset not found" }, 404);
	}
	return c.body(null, 204);
}

export async function assetsTagsReplaceRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";

	const existing = await c.var.repos.assets.getById(id);
	if (!existing) {
		return c.json({ error: "Asset not found" }, 404);
	}

	const raw = await c.req.text();
	if (raw.trim().length === 0) {
		return c.json({ error: "Request body required" }, 400);
	}

	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}
	if (typeof body !== "object" || body === null || Array.isArray(body)) {
		return c.json({ error: "Request body must be a JSON object" }, 400);
	}
	const obj = body as Record<string, unknown>;

	if (!Array.isArray(obj.tag_ids)) {
		return c.json({ error: "tag_ids must be an array" }, 400);
	}
	const tagIds = obj.tag_ids as unknown[];
	for (const tid of tagIds) {
		if (typeof tid !== "number" || !Number.isInteger(tid) || tid <= 0) {
			return c.json({ error: "tag_ids must contain positive integers" }, 400);
		}
	}
	const uniqueIds = [...new Set(tagIds as number[])];
	if (uniqueIds.length > MAX_TAGS_PER_ASSET) {
		return c.json({ error: `tag_ids exceeds maximum of ${MAX_TAGS_PER_ASSET}` }, 400);
	}

	const result = await c.var.repos.assets.replaceTags(id, uniqueIds);
	if (result.ok === "tags_not_found") {
		return c.json({ error: `tag_ids not found: ${result.missing.join(", ")}` }, 400);
	}

	const item = await c.var.repos.assets.getById(id);
	return c.json(item);
}
