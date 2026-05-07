// bat-cli service uninstall — Remove the macOS launchd plist for the heartbeat service.

import { existsSync, unlinkSync } from "node:fs";
import { defineCommand } from "@nocoo/cli-base";
import type { ConfigManager } from "@nocoo/cli-base";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager } from "../../lib/config.js";
import { error, info, success } from "../../lib/output.js";
import { getPlistPath } from "./install.js";

/**
 * Run service uninstall. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runServiceUninstall(
	_manager: ConfigManager<BatCliConfig>,
	opts: { plistDir?: string } = {},
): Promise<number> {
	const plistPath = getPlistPath(opts.plistDir);

	if (!existsSync(plistPath)) {
		error("No plist found — service is not installed.");
		return 1;
	}

	try {
		unlinkSync(plistPath);
		success(`Plist removed: ${plistPath}`);
		info("Run 'launchctl bootout gui/$(id -u) ai.hexly.bat-cli' if the service is loaded.");
		return 0;
	} catch (err) {
		error(`Failed to remove plist: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "uninstall",
		description: "Remove the macOS launchd plist for the heartbeat service",
	},
	async run() {
		const manager = createConfigManager();
		process.exitCode = await runServiceUninstall(manager);
	},
});
