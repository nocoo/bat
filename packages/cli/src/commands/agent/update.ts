// bat-cli agent update — Update an existing agent's fields.
// Only fields explicitly provided are sent; absent fields are left unchanged.
// Null semantics: --clear-* flags send null to clear a field; --field sets a value.
// Mutual exclusion: --field and --clear-field for the same field is an error.

import type { AgentItem, AgentStatus, AgentUpdateBody } from "@bat/shared";
import { VALID_AGENT_STATUSES } from "@bat/shared";
import type { ConfigManager } from "@nocoo/cli-base";
import { defineCommand } from "@nocoo/cli-base";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { ApiError, AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, success, warn } from "../../lib/output.js";

/**
 * Run agent update. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runAgentUpdate(
	manager: ConfigManager<BatCliConfig>,
	agentId: string,
	opts: {
		nickname?: string;
		clearNickname?: boolean;
		role?: string;
		clearRole?: boolean;
		runtimeApp?: string;
		clearRuntimeApp?: boolean;
		runtimeVersion?: string;
		clearRuntimeVersion?: boolean;
		status?: string;
	},
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

	// Mutual exclusion: set and clear for the same field
	if (opts.nickname && opts.clearNickname) {
		error("Cannot use --nickname and --clear-nickname together");
		return 1;
	}
	if (opts.role && opts.clearRole) {
		error("Cannot use --role and --clear-role together");
		return 1;
	}
	if (opts.runtimeApp && opts.clearRuntimeApp) {
		error("Cannot use --runtime-app and --clear-runtime-app together");
		return 1;
	}
	if (opts.runtimeVersion && opts.clearRuntimeVersion) {
		error("Cannot use --runtime-version and --clear-runtime-version together");
		return 1;
	}

	// Validate status against VALID_AGENT_STATUSES
	if (opts.status) {
		if (!(VALID_AGENT_STATUSES as readonly string[]).includes(opts.status)) {
			error(`Invalid status "${opts.status}" — must be one of: ${VALID_AGENT_STATUSES.join(", ")}`);
			return 1;
		}
	}

	// Build update body — only include fields explicitly provided
	const body: AgentUpdateBody = {};
	if (opts.clearNickname) {
		body.nickname = null;
	} else if (opts.nickname) {
		body.nickname = opts.nickname;
	}
	if (opts.clearRole) {
		body.role = null;
	} else if (opts.role) {
		body.role = opts.role;
	}
	if (opts.clearRuntimeApp) {
		body.runtime_app = null;
	} else if (opts.runtimeApp) {
		body.runtime_app = opts.runtimeApp;
	}
	if (opts.clearRuntimeVersion) {
		body.runtime_version = null;
	} else if (opts.runtimeVersion) {
		body.runtime_version = opts.runtimeVersion;
	}
	if (opts.status) {
		body.status = opts.status as AgentStatus;
	}

	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		const agent = await client.patch<AgentItem>(`/api/agents/${agentId}`, body);
		success(`Agent updated: ${agent.id}`);
		info(`  nickname: ${agent.nickname ?? "—"}`);
		info(`  status: ${agent.status}`);
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
		error(`Failed to update agent: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "update",
		description: "Update an existing agent",
	},
	args: {
		id: {
			type: "positional",
			description: "Agent ID (e.g. agt_abc123)",
			required: true,
		},
		nickname: {
			type: "string",
			description: "Set nickname",
		},
		"clear-nickname": {
			type: "boolean",
			description: "Clear nickname (set to null)",
		},
		role: {
			type: "string",
			description: "Set role",
		},
		"clear-role": {
			type: "boolean",
			description: "Clear role (set to null)",
		},
		"runtime-app": {
			type: "string",
			description: "Runtime application name",
		},
		"clear-runtime-app": {
			type: "boolean",
			description: "Clear runtime app (set to null)",
		},
		"runtime-version": {
			type: "string",
			description: "Runtime version",
		},
		"clear-runtime-version": {
			type: "boolean",
			description: "Clear runtime version (set to null)",
		},
		status: {
			type: "string",
			description: "Agent status (running, stopped, missing, unknown)",
		},
	},
	async run({ args }) {
		const manager = createConfigManager();
		const opts: Parameters<typeof runAgentUpdate>[2] = {};
		if (args.nickname) {
			opts.nickname = args.nickname;
		}
		if (args["clear-nickname"]) {
			opts.clearNickname = true;
		}
		if (args.role) {
			opts.role = args.role;
		}
		if (args["clear-role"]) {
			opts.clearRole = true;
		}
		if (args["runtime-app"]) {
			opts.runtimeApp = args["runtime-app"];
		}
		if (args["clear-runtime-app"]) {
			opts.clearRuntimeApp = true;
		}
		if (args["runtime-version"]) {
			opts.runtimeVersion = args["runtime-version"];
		}
		if (args["clear-runtime-version"]) {
			opts.clearRuntimeVersion = true;
		}
		if (args.status) {
			opts.status = args.status;
		}
		process.exitCode = await runAgentUpdate(manager, args.id, opts);
	},
});
