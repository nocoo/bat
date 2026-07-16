// bat-cli agent list — List all registered agents.

import type { AgentItem } from "@bat/shared";
import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, table, truncate, warn } from "../../lib/output.js";

/** Format unix timestamp for display */
function formatTime(ts: number | null): string {
	if (ts === null) {
		return "—";
	}
	return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Run agent list. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runAgentList(manager: ConfigManager<BatCliConfig>): Promise<number> {
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

	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		const agents = await client.get<AgentItem[]>("/api/agents");

		if (agents.length === 0) {
			info("No agents registered.");
			return 0;
		}

		info(`${agents.length} agent(s):`);
		table(
			["ID", "MATCH_KEY", "NICKNAME", "STATUS", "LAST SEEN", "SRC_KEY"],
			agents.map((a) => [
				a.id,
				truncate(a.match_key, 30),
				a.nickname ?? "—",
				a.status,
				formatTime(a.last_seen_at),
				a.source_key_short,
			]),
		);

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
		error(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "list",
		description: "List all registered agents",
	},
	async run() {
		const manager = createConfigManager();
		process.exitCode = await runAgentList(manager);
	},
});
