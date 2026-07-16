// bat-cli binding create — Create a binding between an agent and an asset.
// Idempotent: returns success whether the binding is new or already exists.

import type { BindingCreateBody } from "@bat/shared";
import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { ApiError, AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, success, warn } from "../../lib/output.js";

/**
 * Run binding create. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runBindingCreate(
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

	const body: BindingCreateBody = {
		agent_id: opts.agentId,
		asset_id: opts.assetId,
	};

	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		await client.post("/api/bindings", body);
		success(`Binding created: ${opts.agentId} ↔ ${opts.assetId}`);
		return 0;
	} catch (err) {
		if (err instanceof AuthError) {
			error(`Authentication failed (${err.status}): ${err.message}`);
			warn("Token may be revoked. Run 'bat-cli login' to re-authenticate.");
			return 1;
		}
		if (err instanceof ApiError && err.status === 400) {
			error(`Invalid binding: ${err.message}`);
			return 1;
		}
		if (err instanceof NetworkError) {
			error(`Cannot connect to Worker: ${err.message}`);
			return 1;
		}
		error(`Failed to create binding: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "create",
		description: "Create a binding between an agent and an asset",
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
		process.exitCode = await runBindingCreate(manager, {
			agentId: args.agentId,
			assetId: args.assetId,
		});
	},
});
