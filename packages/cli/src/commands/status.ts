// bat-cli status — Display connection status and config summary.
// Reads local config, verifies token by calling the Worker API.

import { defineCommand } from "@nocoo/cli-base";
import type { ConfigManager } from "@nocoo/cli-base";
import type { BatCliConfig } from "../lib/config.js";
import { createConfigManager, getHeartbeatInterval, validateConfig } from "../lib/config.js";
import { AuthError, HttpClient, NetworkError } from "../lib/http.js";
import { error, info, success, truncate, warn } from "../lib/output.js";

/**
 * Run the status check. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runStatus(manager: ConfigManager<BatCliConfig>): Promise<number> {
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

	info(`Config: ${manager.configPath}`);
	info(`Worker: ${config.worker_url}`);
	info(`Source key: ${truncate(config.source_key, 36)}`);
	info(`Heartbeat interval: ${getHeartbeatInterval(config)}s`);

	// Verify connectivity + token
	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		// Use GET /api/agents as a lightweight authenticated endpoint
		await client.get("/api/agents");
		success("Connection OK — token valid");
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
		name: "status",
		description: "Show connection status and config summary",
	},
	async run() {
		const manager = createConfigManager();
		process.exitCode = await runStatus(manager);
	},
});
