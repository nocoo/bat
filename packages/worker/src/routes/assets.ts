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
	MAX_TAGS_PER_ASSET,
	VALID_ASSET_STATUSES,
	VALID_ASSET_TYPES,
	validateEnum,
	validateMetadata,
	validateOptionalEnum,
	validateOptionalString,
	validateString,
} from "@bat/shared";
import { generateId } from "@bat/shared";
import type { Context } from "hono";
import {
	createAsset,
	deleteAsset,
	getAsset,
	hostExists,
	listAssets,
	replaceAssetTags,
	updateAsset,
} from "../services/assets.js";
import type { AppEnv } from "../types.js";

export async function assetsListRoute(c: Context<AppEnv>) {
	const items = await listAssets(c.env.DB);
	return c.json(items);
}

export async function assetsGetRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";
	const item = await getAsset(c.env.DB, id);
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

	// Validate required fields
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

	// Validate optional fields
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

	// Validate metadata
	let metadataJson = "{}";
	if (obj.metadata !== undefined) {
		const metaResult = validateMetadata(obj.metadata);
		if (!metaResult.ok) {
			return c.json({ error: metaResult.error }, 400);
		}
		metadataJson = metaResult.value;
	}

	// Validate host_id FK if provided
	if (obj.host_id !== undefined && obj.host_id !== null) {
		if (typeof obj.host_id !== "string" || obj.host_id.length === 0) {
			return c.json({ error: "host_id must be a non-empty string or null" }, 400);
		}
		const exists = await hostExists(c.env.DB, obj.host_id);
		if (!exists) {
			return c.json({ error: `host_id "${obj.host_id}" does not exist` }, 400);
		}
	}

	const id = generateId("ast_");
	await createAsset(c.env.DB, {
		id,
		host_id: (obj.host_id as string | null) ?? null,
		type: typeResult.value,
		subtype: subtypeResult.value ?? null,
		name: nameResult.value,
		provider: providerResult.value ?? null,
		status: statusResult.value ?? "active",
		metadata: metadataJson,
	});

	const item = await getAsset(c.env.DB, id);
	return c.json(item, 201);
}

export async function assetsUpdateRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";

	// Verify asset exists
	const existing = await getAsset(c.env.DB, id);
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

	// Validate optional fields
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

	// Validate metadata
	let metadataJson: string | undefined;
	if (obj.metadata !== undefined) {
		const metaResult = validateMetadata(obj.metadata);
		if (!metaResult.ok) {
			return c.json({ error: metaResult.error }, 400);
		}
		metadataJson = metaResult.value;
	}

	// Validate host_id FK if provided
	if (obj.host_id !== undefined && obj.host_id !== null) {
		if (typeof obj.host_id !== "string" || obj.host_id.length === 0) {
			return c.json({ error: "host_id must be a non-empty string or null" }, 400);
		}
		const exists = await hostExists(c.env.DB, obj.host_id);
		if (!exists) {
			return c.json({ error: `host_id "${obj.host_id}" does not exist` }, 400);
		}
	}

	await updateAsset(c.env.DB, id, {
		host_id: obj.host_id !== undefined ? (obj.host_id as string | null) : undefined,
		name: obj.name !== undefined ? nameResult.value : undefined,
		subtype: obj.subtype !== undefined ? subtypeResult.value : undefined,
		provider: obj.provider !== undefined ? providerResult.value : undefined,
		status: obj.status !== undefined ? (statusResult.value ?? undefined) : undefined,
		metadata: metadataJson,
	});

	const item = await getAsset(c.env.DB, id);
	return c.json(item);
}

export async function assetsDeleteRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";
	const deleted = await deleteAsset(c.env.DB, id);
	if (!deleted) {
		return c.json({ error: "Asset not found" }, 404);
	}
	return c.body(null, 204);
}

export async function assetsTagsReplaceRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";

	// Verify asset exists
	const existing = await getAsset(c.env.DB, id);
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

	// Validate tag_ids: must be an array of numbers
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
	// Replace tags (validates all tag IDs exist)
	const result = await replaceAssetTags(c.env.DB, id, uniqueIds);
	if (!result.ok) {
		return c.json({ error: result.error }, 400);
	}

	const item = await getAsset(c.env.DB, id);
	return c.json(item);
}
