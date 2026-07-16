// bat-cli service run — Foreground heartbeat loop.
// Sends periodic heartbeats at the configured interval.
// Writes a PID file; cleans up on SIGINT/SIGTERM.

import type { AgentHeartbeatBody, AgentHeartbeatResponse } from "@bat/shared";
import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, getHeartbeatInterval, validateConfig } from "../../lib/config.js";
import { AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, success, warn } from "../../lib/output.js";
import {
	getPidFilePath,
	isProcessRunning,
	readPidFile,
	removePidFile,
	writePidFile,
} from "../../lib/pid.js";

/** Heartbeat-allowed statuses */
const HEARTBEAT_STATUSES = new Set(["running", "stopped"]);

/**
 * Parse agents string: "key:status,key:status,..."
 */
export function parseAgentsArg(
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
 * Send a single heartbeat. Returns true on success, false on failure.
 */
export async function sendHeartbeat(
	client: HttpClient,
	body: AgentHeartbeatBody,
): Promise<boolean> {
	try {
		const result = await client.post<AgentHeartbeatResponse>("/api/agents/heartbeat", body);
		success(
			`Heartbeat sent — updated: ${result.updated}, created: ${result.created}, missing: ${result.missing}`,
		);
		return true;
	} catch (err) {
		if (err instanceof AuthError) {
			error(`Authentication failed (${err.status}): ${err.message}`);
			warn("Token may be revoked. Run 'bat-cli login' to re-authenticate.");
			return false;
		}
		if (err instanceof NetworkError) {
			warn(`Heartbeat failed (will retry): ${err.message}`);
			return false;
		}
		warn(`Heartbeat failed (will retry): ${err instanceof Error ? err.message : String(err)}`);
		return false;
	}
}

/** Options for the service loop, allowing test injection */
export interface ServiceLoopOptions {
	/** Override PID file path (for tests) */
	pidFilePath?: string;
	/** Override for process.pid (for tests) */
	pid?: number;
	/** Abort signal to stop the loop (for tests, replaces SIGINT/SIGTERM) */
	signal?: AbortSignal;
}

/**
 * Run the foreground service loop. Exported for testing.
 *
 * @returns 0 on clean shutdown, 1 on failure
 */
export async function runServiceLoop(
	manager: ConfigManager<BatCliConfig>,
	agentsArg: string,
	opts: ServiceLoopOptions = {},
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

	// Parse agents
	const parsed = parseAgentsArg(agentsArg);
	if (!parsed.ok) {
		error(parsed.error);
		return 1;
	}

	const intervalSec = getHeartbeatInterval(config);
	const pidPath = opts.pidFilePath ?? getPidFilePath();
	const pid = opts.pid ?? process.pid;

	// Check for existing PID file
	const existingPid = readPidFile(pidPath);
	if (existingPid !== null && isProcessRunning(existingPid)) {
		error(`Another service is already running (PID ${existingPid})`);
		return 1;
	}

	// Write PID file
	writePidFile(pidPath, pid);

	const client = new HttpClient(config.worker_url, config.api_key);
	const body: AgentHeartbeatBody = {
		source_key: config.source_key,
		agents: parsed.agents,
	};

	const cleanup = () => {
		removePidFile(pidPath);
		info("Service stopped.");
	};

	try {
		info(
			`Service started (PID ${pid}), heartbeat every ${intervalSec}s for ${parsed.agents.length} agent(s)`,
		);

		// Use AbortSignal for testability, or real signals in production
		if (opts.signal) {
			const signal = opts.signal;

			// Handle already-aborted signal
			if (signal.aborted) {
				return 0;
			}

			// Register abort handler before initial heartbeat
			await new Promise<void>((resolve) => {
				let timer: ReturnType<typeof setInterval> | null = null;
				let stopped = false;

				const stop = () => {
					if (stopped) {
						return;
					}
					stopped = true;
					if (timer !== null) {
						clearInterval(timer);
					}
					resolve();
				};

				signal.addEventListener("abort", stop, { once: true });

				// Send initial heartbeat, then start interval
				sendHeartbeat(client, body).then(() => {
					if (!stopped) {
						timer = setInterval(async () => {
							await sendHeartbeat(client, body);
						}, intervalSec * 1000);
					}
				});
			});
		} else {
			// Production mode: register signal handlers before initial heartbeat
			await new Promise<void>((resolve) => {
				let timer: ReturnType<typeof setInterval> | null = null;
				let stopped = false;

				const onSignal = () => {
					if (stopped) {
						return;
					}
					stopped = true;
					if (timer !== null) {
						clearInterval(timer);
					}
					process.removeListener("SIGINT", onSignal);
					process.removeListener("SIGTERM", onSignal);
					resolve();
				};

				process.on("SIGINT", onSignal);
				process.on("SIGTERM", onSignal);

				// Send initial heartbeat, then start interval
				sendHeartbeat(client, body).then(() => {
					if (!stopped) {
						timer = setInterval(async () => {
							await sendHeartbeat(client, body);
						}, intervalSec * 1000);
					}
				});
			});
		}
	} finally {
		cleanup();
	}

	return 0;
}

export default defineCommand({
	meta: {
		name: "run",
		description: "Run the heartbeat service in the foreground",
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
		process.exitCode = await runServiceLoop(manager, args.agents);
	},
});
