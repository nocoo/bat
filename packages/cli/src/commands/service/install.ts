// bat service install — Install a macOS launchd plist for the heartbeat service.
// Creates ~/Library/LaunchAgents/ai.hexly.bat.plist

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, getHeartbeatInterval, validateConfig } from "../../lib/config.js";
import { error, info, success, warn } from "../../lib/output.js";
import { escapeXml } from "../../lib/xml.js";
import { parseAgentsArg } from "./run.js";

const PLIST_LABEL = "ai.hexly.bat";

/**
 * Get the per-user launchd directory. Resolved lazily so tests can isolate HOME.
 */
export function getLaunchAgentsDir(): string {
	return join(homedir(), "Library", "LaunchAgents");
}

export { escapeXml } from "../../lib/xml.js";

/**
 * Get the plist file path.
 */
export function getPlistPath(dir?: string): string {
	return join(dir ?? getLaunchAgentsDir(), `${PLIST_LABEL}.plist`);
}

/**
 * Generate the launchd plist XML content.
 * All interpolated strings are XML-escaped.
 */
export function generatePlist(opts: {
	label: string;
	batPath: string;
	agents: string;
	intervalSec: number;
	logPath: string;
}): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>${escapeXml(opts.label)}</string>
	<key>ProgramArguments</key>
	<array>
		<string>${escapeXml(opts.batPath)}</string>
		<string>service</string>
		<string>run</string>
		<string>${escapeXml(opts.agents)}</string>
	</array>
	<key>StartInterval</key>
	<integer>${opts.intervalSec}</integer>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>${escapeXml(opts.logPath)}</string>
	<key>StandardErrorPath</key>
	<string>${escapeXml(opts.logPath)}</string>
</dict>
</plist>
`;
}

/**
 * Run service install. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runServiceInstall(
	manager: ConfigManager<BatCliConfig>,
	agentsArg: string,
	opts: { plistDir?: string; batPath?: string } = {},
): Promise<number> {
	if (!manager.exists()) {
		error("Not configured — run 'bat login' first.");
		return 1;
	}

	const config = manager.read();
	const validationError = validateConfig(config);
	if (validationError) {
		error(validationError);
		return 1;
	}

	// Validate agents arg before writing plist
	const parsed = parseAgentsArg(agentsArg);
	if (!parsed.ok) {
		error(parsed.error);
		return 1;
	}

	const plistPath = getPlistPath(opts.plistDir);
	const plistDir = opts.plistDir ?? getLaunchAgentsDir();

	if (existsSync(plistPath)) {
		warn(`Plist already exists: ${plistPath}`);
		warn("Run 'bat service uninstall' first to replace it.");
		return 1;
	}

	// Ensure LaunchAgents directory exists
	if (!existsSync(plistDir)) {
		mkdirSync(plistDir, { recursive: true });
	}

	const batPath = opts.batPath ?? process.argv[1] ?? "bat";
	const logPath = join(homedir(), ".config", "bat", "service.log");
	const intervalSec = getHeartbeatInterval(config);

	const plist = generatePlist({
		label: PLIST_LABEL,
		batPath,
		agents: agentsArg,
		intervalSec,
		logPath,
	});

	writeFileSync(plistPath, plist, { mode: 0o644 });
	success(`Plist installed: ${plistPath}`);
	info(`  interval: ${intervalSec}s`);
	info(`  log: ${logPath}`);
	info(`Load with: launchctl bootstrap gui/$(id -u) ${plistPath}`);

	return 0;
}

export default defineCommand({
	meta: {
		name: "install",
		description: "Install a macOS launchd plist for the heartbeat service",
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
		process.exitCode = await runServiceInstall(manager, args.agents);
	},
});
