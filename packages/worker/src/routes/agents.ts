// Agent CRUD routes
// POST   /api/agents          — create or upsert agent
// GET    /api/agents          — list all agents
// GET    /api/agents/:id      — get single agent
// PATCH  /api/agents/:id      — update agent fields
// DELETE /api/agents/:id      — hard delete
// PUT    /api/agents/:id/tags — replace tag list

import {
	AGENT_MATCH_KEY_MAX_LENGTH,
	AGENT_NICKNAME_MAX_LENGTH,
	AGENT_ROLE_MAX_LENGTH,
	AGENT_RUNTIME_APP_MAX_LENGTH,
	AGENT_RUNTIME_VERSION_MAX_LENGTH,
	AGENT_SOURCE_KEY_MAX_LENGTH,
	MAX_TAGS_PER_AGENT,
	VALID_AGENT_STATUSES,
	validateMetadata,
	validateOptionalEnum,
	validateOptionalString,
	validateString,
} from "@bat/shared";
import type { Context } from "hono";
import type { AppEnv } from "../types.js";

export async function agentsListRoute(c: Context<AppEnv>) {
	const items = await c.var.repos.agents.list();
	return c.json(items);
}

export async function agentsGetRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";
	const item = await c.var.repos.agents.getById(id);
	if (!item) {
		return c.json({ error: "Agent not found" }, 404);
	}
	return c.json(item);
}

export async function agentsCreateRoute(c: Context<AppEnv>) {
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

	const sourceKeyResult = validateString("source_key", obj.source_key, AGENT_SOURCE_KEY_MAX_LENGTH);
	if (!sourceKeyResult.ok) {
		return c.json({ error: sourceKeyResult.error }, 400);
	}
	const matchKeyResult = validateString("match_key", obj.match_key, AGENT_MATCH_KEY_MAX_LENGTH);
	if (!matchKeyResult.ok) {
		return c.json({ error: matchKeyResult.error }, 400);
	}

	const nicknameResult = validateOptionalString(
		"nickname",
		obj.nickname,
		AGENT_NICKNAME_MAX_LENGTH,
	);
	if (!nicknameResult.ok) {
		return c.json({ error: nicknameResult.error }, 400);
	}
	const roleResult = validateOptionalString("role", obj.role, AGENT_ROLE_MAX_LENGTH);
	if (!roleResult.ok) {
		return c.json({ error: roleResult.error }, 400);
	}
	const runtimeAppResult = validateOptionalString(
		"runtime_app",
		obj.runtime_app,
		AGENT_RUNTIME_APP_MAX_LENGTH,
	);
	if (!runtimeAppResult.ok) {
		return c.json({ error: runtimeAppResult.error }, 400);
	}
	const runtimeVersionResult = validateOptionalString(
		"runtime_version",
		obj.runtime_version,
		AGENT_RUNTIME_VERSION_MAX_LENGTH,
	);
	if (!runtimeVersionResult.ok) {
		return c.json({ error: runtimeVersionResult.error }, 400);
	}
	const statusResult = validateOptionalEnum(
		"status",
		obj.status,
		VALID_AGENT_STATUSES as unknown as readonly string[],
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
		const exists = await c.var.repos.agents.hostExists(obj.host_id);
		if (!exists) {
			return c.json({ error: `host_id "${obj.host_id}" does not exist` }, 400);
		}
	}

	const updateFields = {
		host_id: obj.host_id !== undefined ? (obj.host_id as string | null) : undefined,
		nickname: obj.nickname !== undefined ? nicknameResult.value : undefined,
		role: obj.role !== undefined ? roleResult.value : undefined,
		runtime_app: obj.runtime_app !== undefined ? runtimeAppResult.value : undefined,
		runtime_version: obj.runtime_version !== undefined ? runtimeVersionResult.value : undefined,
		status: obj.status !== undefined ? (statusResult.value ?? undefined) : undefined,
		metadata: obj.metadata !== undefined ? metadataJson : undefined,
	};

	const result = await c.var.repos.agents.upsertBy(
		{
			source_key: sourceKeyResult.value,
			match_key: matchKeyResult.value,
			host_id: (obj.host_id as string | null) ?? null,
			nickname: nicknameResult.value ?? null,
			role: roleResult.value ?? null,
			runtime_app: runtimeAppResult.value ?? null,
			runtime_version: runtimeVersionResult.value ?? null,
			status: statusResult.value ?? "unknown",
			metadata: metadataJson,
		},
		updateFields,
	);

	const item = await c.var.repos.agents.getById(result.id);
	return c.json(item, result.created ? 201 : 200);
}

export async function agentsUpdateRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";

	const existing = await c.var.repos.agents.getById(id);
	if (!existing) {
		return c.json({ error: "Agent not found" }, 404);
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

	const nicknameResult = validateOptionalString(
		"nickname",
		obj.nickname,
		AGENT_NICKNAME_MAX_LENGTH,
	);
	if (!nicknameResult.ok) {
		return c.json({ error: nicknameResult.error }, 400);
	}
	const roleResult = validateOptionalString("role", obj.role, AGENT_ROLE_MAX_LENGTH);
	if (!roleResult.ok) {
		return c.json({ error: roleResult.error }, 400);
	}
	const runtimeAppResult = validateOptionalString(
		"runtime_app",
		obj.runtime_app,
		AGENT_RUNTIME_APP_MAX_LENGTH,
	);
	if (!runtimeAppResult.ok) {
		return c.json({ error: runtimeAppResult.error }, 400);
	}
	const runtimeVersionResult = validateOptionalString(
		"runtime_version",
		obj.runtime_version,
		AGENT_RUNTIME_VERSION_MAX_LENGTH,
	);
	if (!runtimeVersionResult.ok) {
		return c.json({ error: runtimeVersionResult.error }, 400);
	}
	const statusResult = validateOptionalEnum(
		"status",
		obj.status,
		VALID_AGENT_STATUSES as unknown as readonly string[],
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
		const exists = await c.var.repos.agents.hostExists(obj.host_id);
		if (!exists) {
			return c.json({ error: `host_id "${obj.host_id}" does not exist` }, 400);
		}
	}

	await c.var.repos.agents.update(id, {
		host_id: obj.host_id !== undefined ? (obj.host_id as string | null) : undefined,
		nickname: obj.nickname !== undefined ? nicknameResult.value : undefined,
		role: obj.role !== undefined ? roleResult.value : undefined,
		runtime_app: obj.runtime_app !== undefined ? runtimeAppResult.value : undefined,
		runtime_version: obj.runtime_version !== undefined ? runtimeVersionResult.value : undefined,
		status: obj.status !== undefined ? (statusResult.value ?? undefined) : undefined,
		metadata: metadataJson,
	});

	const item = await c.var.repos.agents.getById(id);
	return c.json(item);
}

export async function agentsDeleteRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";
	const deleted = await c.var.repos.agents.delete(id);
	if (!deleted) {
		return c.json({ error: "Agent not found" }, 404);
	}
	return c.body(null, 204);
}

export async function agentsTagsReplaceRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";

	const existing = await c.var.repos.agents.getById(id);
	if (!existing) {
		return c.json({ error: "Agent not found" }, 404);
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
	if (uniqueIds.length > MAX_TAGS_PER_AGENT) {
		return c.json({ error: `tag_ids exceeds maximum of ${MAX_TAGS_PER_AGENT}` }, 400);
	}

	const result = await c.var.repos.agents.replaceTags(id, uniqueIds);
	if (result.ok === "tags_not_found") {
		return c.json({ error: `tag_ids not found: ${result.missing.join(", ")}` }, 400);
	}

	const item = await c.var.repos.agents.getById(id);
	return c.json(item);
}
