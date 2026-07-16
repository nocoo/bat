// bat-cli asset list — List all registered assets.

import type { AssetItem } from "@bat/shared";
import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, table, truncate, warn } from "../../lib/output.js";

/**
 * Run asset list. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runAssetList(manager: ConfigManager<BatCliConfig>): Promise<number> {
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
		const assets = await client.get<AssetItem[]>("/api/assets");

		if (assets.length === 0) {
			info("No assets registered.");
			return 0;
		}

		info(`${assets.length} asset(s):`);
		table(
			["ID", "TYPE", "NAME", "PROVIDER", "STATUS", "HOST"],
			assets.map((a) => [
				a.id,
				a.type,
				truncate(a.name, 30),
				a.provider ?? "—",
				a.status,
				a.hostname ?? "—",
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
		description: "List all registered assets",
	},
	async run() {
		const manager = createConfigManager();
		process.exitCode = await runAssetList(manager);
	},
});
