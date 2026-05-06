#!/usr/bin/env node
// bat-cli — CLI entry point
// Usage: bat-cli <command> [options]

import { BAT_VERSION } from "@bat/shared";
import { defineCommand, runMain } from "@nocoo/cli-base";
import agent from "../commands/agent/index.js";
import login from "../commands/login.js";
import status from "../commands/status.js";

const main = defineCommand({
	meta: {
		name: "bat-cli",
		version: BAT_VERSION,
		description: "bat CLI — Agent & asset management for bat.hexly.ai",
	},
	subCommands: {
		login,
		status,
		agent,
		// Phase 2D: asset, binding
		// Phase 2E: service
	},
});

runMain(main);
