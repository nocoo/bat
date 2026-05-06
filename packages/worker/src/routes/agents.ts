// Agent CRUD routes
// POST   /api/agents     — create or upsert agent
// GET    /api/agents     — list all agents
// GET    /api/agents/:id — get single agent
// PATCH  /api/agents/:id — update agent fields
// DELETE /api/agents/:id — hard delete

import {
	VALID_AGENT_STATUSES,
	generateId,
	validateMetadata,
	validateOptionalEnum,
	validateOptionalString,
	validateString,
} from "@bat/shared";
import type { Context } from "hono";
import {
	createAgent,
	deleteAgent,
	findAgentBySourceMatch,
	getAgent,
	hostExists,
	listAgents,
	updateAgent,
} from "../services/agents.js";
import type { AppEnv } from "../types.js";

export async function agentsListRoute(c: Context<AppEnv>) {
	const items = await listAgents(c.env.DB);
	return c.json(items);
}

export async function agentsGetRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";
	const item = await getAgent(c.env.DB, id);
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

	// Validate required fields
	const sourceKeyResult = validateString("source_key", obj.source_key, 64);
	if (!sourceKeyResult.ok) {
		return c.json({ error: sourceKeyResult.error }, 400);
	}
	const matchKeyResult = validateString("match_key", obj.match_key, 128);
	if (!matchKeyResult.ok) {
		return c.json({ error: matchKeyResult.error }, 400);
	}

	// Validate optional fields
	const nicknameResult = validateOptionalString("nickname", obj.nickname, 64);
	if (!nicknameResult.ok) {
		return c.json({ error: nicknameResult.error }, 400);
	}
	const roleResult = validateOptionalString("role", obj.role, 64);
	if (!roleResult.ok) {
		return c.json({ error: roleResult.error }, 400);
	}
	const runtimeAppResult = validateOptionalString("runtime_app", obj.runtime_app, 64);
	if (!runtimeAppResult.ok) {
		return c.json({ error: runtimeAppResult.error }, 400);
	}
	const runtimeVersionResult = validateOptionalString("runtime_version", obj.runtime_version, 32);
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

	// Check for existing agent with same source_key + match_key (upsert)
	const existing = await findAgentBySourceMatch(
		c.env.DB,
		sourceKeyResult.value,
		matchKeyResult.value,
	);

	if (existing) {
		// Upsert: update existing agent
		await updateAgent(c.env.DB, existing.id, {
			host_id: obj.host_id !== undefined ? (obj.host_id as string | null) : undefined,
			nickname: nicknameResult.value ?? undefined,
			role: roleResult.value ?? undefined,
			runtime_app: runtimeAppResult.value ?? undefined,
			runtime_version: runtimeVersionResult.value ?? undefined,
			status: statusResult.value ?? undefined,
			metadata: obj.metadata !== undefined ? metadataJson : undefined,
		});
		const item = await getAgent(c.env.DB, existing.id);
		return c.json(item, 200);
	}

	// Create new agent
	const id = generateId("agt_");
	await createAgent(c.env.DB, {
		id,
		source_key: sourceKeyResult.value,
		match_key: matchKeyResult.value,
		host_id: (obj.host_id as string | null) ?? null,
		nickname: nicknameResult.value ?? null,
		role: roleResult.value ?? null,
		runtime_app: runtimeAppResult.value ?? null,
		runtime_version: runtimeVersionResult.value ?? null,
		status: statusResult.value ?? "unknown",
		metadata: metadataJson,
	});

	const item = await getAgent(c.env.DB, id);
	return c.json(item, 201);
}

export async function agentsUpdateRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";

	// Verify agent exists
	const existing = await getAgent(c.env.DB, id);
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

	// Validate optional fields
	const nicknameResult = validateOptionalString("nickname", obj.nickname, 64);
	if (!nicknameResult.ok) {
		return c.json({ error: nicknameResult.error }, 400);
	}
	const roleResult = validateOptionalString("role", obj.role, 64);
	if (!roleResult.ok) {
		return c.json({ error: roleResult.error }, 400);
	}
	const runtimeAppResult = validateOptionalString("runtime_app", obj.runtime_app, 64);
	if (!runtimeAppResult.ok) {
		return c.json({ error: runtimeAppResult.error }, 400);
	}
	const runtimeVersionResult = validateOptionalString("runtime_version", obj.runtime_version, 32);
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

	await updateAgent(c.env.DB, id, {
		host_id: obj.host_id !== undefined ? (obj.host_id as string | null) : undefined,
		nickname: nicknameResult.value ?? undefined,
		role: roleResult.value ?? undefined,
		runtime_app: runtimeAppResult.value ?? undefined,
		runtime_version: runtimeVersionResult.value ?? undefined,
		status: statusResult.value ?? undefined,
		metadata: metadataJson,
	});

	const item = await getAgent(c.env.DB, id);
	return c.json(item);
}

export async function agentsDeleteRoute(c: Context<AppEnv>) {
	const id = c.req.param("id") ?? "";
	const deleted = await deleteAgent(c.env.DB, id);
	if (!deleted) {
		return c.json({ error: "Agent not found" }, 404);
	}
	return c.body(null, 204);
}
