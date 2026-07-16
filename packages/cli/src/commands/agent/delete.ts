// bat-cli agent delete — Delete an agent by ID.

import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { ApiError, AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, success, warn } from "../../lib/output.js";

/**
 * Run agent delete. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runAgentDelete(
	manager: ConfigManager<BatCliConfig>,
	agentId: string,
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

	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		await client.delete(`/api/agents/${agentId}`);
		success(`Agent deleted: ${agentId}`);
		return 0;
	} catch (err) {
		if (err instanceof AuthError) {
			error(`Authentication failed (${err.status}): ${err.message}`);
			warn("Token may be revoked. Run 'bat-cli login' to re-authenticate.");
			return 1;
		}
		if (err instanceof ApiError && err.status === 404) {
			error(`Agent not found: ${agentId}`);
			return 1;
		}
		if (err instanceof NetworkError) {
			error(`Cannot connect to Worker: ${err.message}`);
			return 1;
		}
		error(`Failed to delete agent: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "delete",
		description: "Delete an agent by ID",
	},
	args: {
		id: {
			type: "positional",
			description: "Agent ID (e.g. agt_abc123)",
			required: true,
		},
	},
	async run({ args }) {
		const manager = createConfigManager();
		process.exitCode = await runAgentDelete(manager, args.id);
	},
});
