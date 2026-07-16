// bat-cli binding delete — Delete a binding between an agent and an asset.

import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { ApiError, AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, success, warn } from "../../lib/output.js";

/**
 * Run binding delete. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runBindingDelete(
	manager: ConfigManager<BatCliConfig>,
	opts: { agentId: string; assetId: string },
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
		await client.delete(`/api/bindings/${opts.agentId}/${opts.assetId}`);
		success(`Binding deleted: ${opts.agentId} ↔ ${opts.assetId}`);
		return 0;
	} catch (err) {
		if (err instanceof AuthError) {
			error(`Authentication failed (${err.status}): ${err.message}`);
			warn("Token may be revoked. Run 'bat-cli login' to re-authenticate.");
			return 1;
		}
		if (err instanceof ApiError && err.status === 404) {
			error(`Binding not found: ${opts.agentId} ↔ ${opts.assetId}`);
			return 1;
		}
		if (err instanceof NetworkError) {
			error(`Cannot connect to Worker: ${err.message}`);
			return 1;
		}
		error(`Failed to delete binding: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "delete",
		description: "Delete a binding between an agent and an asset",
	},
	args: {
		agentId: {
			type: "positional",
			description: "Agent ID (e.g. agt_abc123)",
			required: true,
		},
		assetId: {
			type: "positional",
			description: "Asset ID (e.g. ast_abc123)",
			required: true,
		},
	},
	async run({ args }) {
		const manager = createConfigManager();
		process.exitCode = await runBindingDelete(manager, {
			agentId: args.agentId,
			assetId: args.assetId,
		});
	},
});
