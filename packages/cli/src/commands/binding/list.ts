// bat-cli binding list — List all agent-asset bindings.

import type { BindingItem } from "@bat/shared";
import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, table, warn } from "../../lib/output.js";

/**
 * Run binding list. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runBindingList(manager: ConfigManager<BatCliConfig>): Promise<number> {
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
		const bindings = await client.get<BindingItem[]>("/api/bindings");

		if (bindings.length === 0) {
			info("No bindings registered.");
			return 0;
		}

		info(`${bindings.length} binding(s):`);
		table(
			["AGENT_ID", "AGENT", "ASSET_ID", "ASSET", "TYPE"],
			bindings.map((b) => [
				b.agent_id,
				b.agent_nickname ?? "—",
				b.asset_id,
				b.asset_name,
				b.asset_type,
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
		description: "List all agent-asset bindings",
	},
	async run() {
		const manager = createConfigManager();
		process.exitCode = await runBindingList(manager);
	},
});
