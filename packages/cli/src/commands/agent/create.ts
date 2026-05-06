// bat-cli agent create — Register a new agent (or upsert by source_key + match_key).

import type { AgentCreateBody, AgentItem } from "@bat/shared";
import { defineCommand } from "@nocoo/cli-base";
import type { ConfigManager } from "@nocoo/cli-base";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, success, warn } from "../../lib/output.js";

/**
 * Run agent create. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runAgentCreate(
	manager: ConfigManager<BatCliConfig>,
	opts: {
		matchKey: string;
		nickname?: string;
		role?: string;
		runtimeApp?: string;
		runtimeVersion?: string;
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

	const body: AgentCreateBody = {
		source_key: config.source_key,
		match_key: opts.matchKey,
	};
	if (opts.nickname) {
		body.nickname = opts.nickname;
	}
	if (opts.role) {
		body.role = opts.role;
	}
	if (opts.runtimeApp) {
		body.runtime_app = opts.runtimeApp;
	}
	if (opts.runtimeVersion) {
		body.runtime_version = opts.runtimeVersion;
	}

	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		const agent = await client.post<AgentItem>("/api/agents", body);
		success(`Agent registered: ${agent.id}`);
		info(`  match_key: ${agent.match_key}`);
		info(`  nickname: ${agent.nickname ?? "—"}`);
		info(`  status: ${agent.status}`);
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
		error(`Failed to create agent: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "create",
		description: "Register a new agent (upserts by source_key + match_key)",
	},
	args: {
		matchKey: {
			type: "positional",
			description: "Unique key for this agent within your installation",
			required: true,
		},
		nickname: {
			type: "string",
			description: "Human-readable nickname",
		},
		role: {
			type: "string",
			description: "Agent role (e.g. monitor, backup, deploy)",
		},
		"runtime-app": {
			type: "string",
			description: "Runtime application name",
		},
		"runtime-version": {
			type: "string",
			description: "Runtime version",
		},
	},
	async run({ args }) {
		const manager = createConfigManager();
		const opts: Parameters<typeof runAgentCreate>[1] = { matchKey: args.matchKey };
		if (args.nickname) {
			opts.nickname = args.nickname;
		}
		if (args.role) {
			opts.role = args.role;
		}
		if (args["runtime-app"]) {
			opts.runtimeApp = args["runtime-app"];
		}
		if (args["runtime-version"]) {
			opts.runtimeVersion = args["runtime-version"];
		}
		process.exitCode = await runAgentCreate(manager, opts);
	},
});
