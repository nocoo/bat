// bat-cli service uninstall — Remove the macOS launchd plist and bootout the service.
// Tries launchctl bootout first, then removes the plist file.

import { execSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { defineCommand } from "@nocoo/cli-base";
import type { ConfigManager } from "@nocoo/cli-base";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager } from "../../lib/config.js";
import { error, info, success, warn } from "../../lib/output.js";
import { getPlistPath } from "./install.js";

/** Command runner type — injectable for testing */
export type CommandRunner = (cmd: string) => void;

/** Default command runner using execSync */
const defaultRunner: CommandRunner = (cmd: string) => {
	execSync(cmd, { stdio: "pipe" });
};

/**
 * Run service uninstall. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runServiceUninstall(
	_manager: ConfigManager<BatCliConfig>,
	opts: { plistDir?: string; runCommand?: CommandRunner } = {},
): Promise<number> {
	const plistPath = getPlistPath(opts.plistDir);
	const run = opts.runCommand ?? defaultRunner;

	if (!existsSync(plistPath)) {
		error("No plist found — service is not installed.");
		return 1;
	}

	// Try launchctl bootout — tolerate "not loaded" errors
	try {
		run(`launchctl bootout gui/$(id -u) ${plistPath}`);
		info("Service unloaded from launchd.");
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes("Could not find specified service") || msg.includes("No such process")) {
			info("Service was not loaded in launchd (already stopped).");
		} else {
			warn(`launchctl bootout warning: ${msg}`);
		}
	}

	// Remove plist file
	try {
		unlinkSync(plistPath);
		success(`Plist removed: ${plistPath}`);
		return 0;
	} catch (err) {
		error(`Failed to remove plist: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "uninstall",
		description: "Remove the macOS launchd plist and stop the service",
	},
	async run() {
		const manager = createConfigManager();
		process.exitCode = await runServiceUninstall(manager);
	},
});
