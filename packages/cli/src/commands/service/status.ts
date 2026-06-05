// bat-cli service status — Check if the heartbeat service is running.

import type { ConfigManager } from "@nocoo/cli-base";
import { defineCommand } from "@nocoo/cli-base";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager } from "../../lib/config.js";
import { error, info, success } from "../../lib/output.js";
import { getPidFilePath, isProcessRunning, readPidFile } from "../../lib/pid.js";

/**
 * Run service status check. Exported for testing.
 *
 * @returns 0 always (informational command)
 */
export async function runServiceStatus(
	_manager: ConfigManager<BatCliConfig>,
	opts: { pidFilePath?: string } = {},
): Promise<number> {
	const pidPath = opts.pidFilePath ?? getPidFilePath();
	const pid = readPidFile(pidPath);

	if (pid === null) {
		info("Service is not running (no PID file).");
		return 0;
	}

	if (isProcessRunning(pid)) {
		success(`Service is running (PID ${pid}).`);
	} else {
		error(`Stale PID file (PID ${pid} is not running).`);
		info("Remove the PID file or start the service to fix.");
	}

	return 0;
}

export default defineCommand({
	meta: {
		name: "status",
		description: "Check if the heartbeat service is running",
	},
	async run() {
		const manager = createConfigManager();
		process.exitCode = await runServiceStatus(manager);
	},
});
