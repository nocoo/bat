// bat-cli agent heartbeat — Send a heartbeat for agents on this installation.
// Reads source_key from config. Marks missing agents (in DB but not in payload).
// Only "running" and "stopped" are valid heartbeat statuses.

import type { AgentHeartbeatBody, AgentHeartbeatResponse } from "@bat/shared";
import type { ConfigManager } from "@nocoo/cli-base";
import { defineCommand } from "@nocoo/cli-base";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, success, warn } from "../../lib/output.js";

/** Heartbeat-allowed statuses (server rejects "missing" and "unknown") */
const HEARTBEAT_STATUSES = new Set(["running", "stopped"]);

/**
 * Parse agents string: "key:status,key:status,..."
 * Each entry is "match_key:status" where status is "running" or "stopped".
 */
function parseAgents(
	raw: string,
): { ok: true; agents: AgentHeartbeatBody["agents"] } | { ok: false; error: string } {
	const entries = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	if (entries.length === 0) {
		return { ok: false, error: "No agents specified" };
	}

	const agents: AgentHeartbeatBody["agents"] = [];
	const seen = new Set<string>();

	for (const entry of entries) {
		const colonIdx = entry.indexOf(":");
		if (colonIdx === -1) {
			return { ok: false, error: `Invalid format "${entry}" — expected "match_key:status"` };
		}
		const matchKey = entry.slice(0, colonIdx).trim();
		const status = entry.slice(colonIdx + 1).trim();

		if (!matchKey) {
			return { ok: false, error: `Empty match_key in "${entry}"` };
		}
		if (!HEARTBEAT_STATUSES.has(status)) {
			return {
				ok: false,
				error: `Invalid status "${status}" in "${entry}" — must be "running" or "stopped"`,
			};
		}
		if (seen.has(matchKey)) {
			return { ok: false, error: `Duplicate match_key "${matchKey}"` };
		}
		seen.add(matchKey);
		agents.push({ match_key: matchKey, status: status as "running" | "stopped" });
	}

	return { ok: true, agents };
}

/**
 * Run agent heartbeat. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runAgentHeartbeat(
	manager: ConfigManager<BatCliConfig>,
	agentsArg: string,
): Promise<number> {
	if (!manager.exists()) {
		error("Not configured — run 'bat-cli login' first.");
		return 1;
	}

	const config = manager.read();
	const validationError = validateConfig(config);
	if (validationError) {
		error(validationError);
		return 1;
	}

	const parsed = parseAgents(agentsArg);
	if (!parsed.ok) {
		error(parsed.error);
		return 1;
	}

	const body: AgentHeartbeatBody = {
		source_key: config.source_key,
		agents: parsed.agents,
	};

	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		const result = await client.post<AgentHeartbeatResponse>("/api/agents/heartbeat", body);
		success("Heartbeat sent.");
		info(`  updated: ${result.updated}`);
		info(`  created: ${result.created}`);
		info(`  missing: ${result.missing}`);
		return 0;
	} catch (err) {
		if (err instanceof AuthError) {
			error(`Authentication failed (${err.status}): ${err.message}`);
			warn("Token may be revoked. Run 'bat-cli login' to re-authenticate.");
			return 1;
		}
		if (err instanceof NetworkError) {
			error(`Cannot connect to Worker: ${err.message}`);
			return 1;
		}
		error(`Heartbeat failed: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "heartbeat",
		description: "Send a heartbeat for agents on this installation",
	},
	args: {
		agents: {
			type: "positional",
			description: 'Agents as "match_key:status,..." (status: running|stopped)',
			required: true,
		},
	},
	async run({ args }) {
		const manager = createConfigManager();
		process.exitCode = await runAgentHeartbeat(manager, args.agents);
	},
});
