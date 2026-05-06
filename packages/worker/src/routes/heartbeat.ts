// Heartbeat route — POST /api/agents/heartbeat
// Accepts a CLI heartbeat report and updates agent statuses.
// Uses source_key as the installation boundary for mark-missing logic.

import {
	AGENT_MATCH_KEY_MAX_LENGTH,
	AGENT_RUNTIME_APP_MAX_LENGTH,
	AGENT_RUNTIME_VERSION_MAX_LENGTH,
	AGENT_SOURCE_KEY_MAX_LENGTH,
	MAX_HEARTBEAT_AGENTS,
} from "@bat/shared";
import type { AgentHeartbeatBody, AgentHeartbeatEntry, AgentStatus } from "@bat/shared";

/**
 * Heartbeat-specific allowed statuses. Clients may only report "running" or "stopped".
 * "missing" is exclusively set by server-side diff logic; "unknown" is initial state only.
 */
const HEARTBEAT_ALLOWED_STATUSES: readonly AgentStatus[] = ["running", "stopped"] as const;
import type { Context } from "hono";
import { processHeartbeat } from "../services/heartbeat.js";
import type { AppEnv } from "../types.js";

export async function agentsHeartbeatRoute(c: Context<AppEnv>) {
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

	// Validate source_key
	if (typeof obj.source_key !== "string" || obj.source_key.length === 0) {
		return c.json({ error: "source_key must be a non-empty string" }, 400);
	}
	if (obj.source_key.length > AGENT_SOURCE_KEY_MAX_LENGTH) {
		return c.json({ error: `source_key exceeds max length (${AGENT_SOURCE_KEY_MAX_LENGTH})` }, 400);
	}

	// Validate agents array
	if (!Array.isArray(obj.agents)) {
		return c.json({ error: "agents must be an array" }, 400);
	}
	if (obj.agents.length > MAX_HEARTBEAT_AGENTS) {
		return c.json({ error: `agents array exceeds max size (${MAX_HEARTBEAT_AGENTS})` }, 400);
	}

	// Validate each agent entry
	const agents: AgentHeartbeatEntry[] = [];
	const seenMatchKeys = new Set<string>();

	for (let i = 0; i < obj.agents.length; i++) {
		const entry = obj.agents[i];
		if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
			return c.json({ error: `agents[${i}]: must be an object` }, 400);
		}
		const e = entry as Record<string, unknown>;

		// match_key: required non-empty string
		if (typeof e.match_key !== "string" || e.match_key.length === 0) {
			return c.json({ error: `agents[${i}].match_key: required non-empty string` }, 400);
		}
		if (e.match_key.length > AGENT_MATCH_KEY_MAX_LENGTH) {
			return c.json(
				{ error: `agents[${i}].match_key: exceeds max length (${AGENT_MATCH_KEY_MAX_LENGTH})` },
				400,
			);
		}
		if (seenMatchKeys.has(e.match_key)) {
			return c.json({ error: `agents[${i}].match_key: duplicate "${e.match_key}"` }, 400);
		}
		seenMatchKeys.add(e.match_key);

		// status: required, must be running or stopped (missing is server-only)
		if (typeof e.status !== "string") {
			return c.json({ error: `agents[${i}].status: required string` }, 400);
		}
		if (!HEARTBEAT_ALLOWED_STATUSES.includes(e.status as AgentStatus)) {
			return c.json(
				{
					error: `agents[${i}].status: must be one of ${HEARTBEAT_ALLOWED_STATUSES.join(", ")}`,
				},
				400,
			);
		}

		// runtime_app: optional string
		if (
			e.runtime_app !== undefined &&
			e.runtime_app !== null &&
			typeof e.runtime_app !== "string"
		) {
			return c.json({ error: `agents[${i}].runtime_app: must be string or null` }, 400);
		}
		if (typeof e.runtime_app === "string" && e.runtime_app.length > AGENT_RUNTIME_APP_MAX_LENGTH) {
			return c.json(
				{
					error: `agents[${i}].runtime_app: exceeds max length (${AGENT_RUNTIME_APP_MAX_LENGTH})`,
				},
				400,
			);
		}

		// runtime_version: optional string
		if (
			e.runtime_version !== undefined &&
			e.runtime_version !== null &&
			typeof e.runtime_version !== "string"
		) {
			return c.json({ error: `agents[${i}].runtime_version: must be string or null` }, 400);
		}
		if (
			typeof e.runtime_version === "string" &&
			e.runtime_version.length > AGENT_RUNTIME_VERSION_MAX_LENGTH
		) {
			return c.json(
				{
					error: `agents[${i}].runtime_version: exceeds max length (${AGENT_RUNTIME_VERSION_MAX_LENGTH})`,
				},
				400,
			);
		}

		const agentEntry: AgentHeartbeatEntry = {
			match_key: e.match_key,
			status: e.status as AgentStatus,
		};
		if (e.runtime_app !== undefined) {
			agentEntry.runtime_app = (e.runtime_app as string) ?? null;
		}
		if (e.runtime_version !== undefined) {
			agentEntry.runtime_version = (e.runtime_version as string) ?? null;
		}
		agents.push(agentEntry);
	}

	const validatedBody: AgentHeartbeatBody = {
		source_key: obj.source_key,
		agents,
	};

	const now = Math.floor(Date.now() / 1000);
	const result = await processHeartbeat(
		c.env.DB,
		validatedBody.source_key,
		validatedBody.agents,
		now,
	);
	return c.json(result);
}
