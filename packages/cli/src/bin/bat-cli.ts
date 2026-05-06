#!/usr/bin/env node
// bat-cli — CLI entry point
// Usage: bat-cli <command> [options]

import { defineCommand, runMain } from "@nocoo/cli-base";

const main = defineCommand({
	meta: {
		name: "bat-cli",
		version: "2.0.1",
		description: "bat CLI — Agent & asset management for bat.hexly.ai",
	},
	subCommands: {
		// Commands will be added in subsequent phases:
		// Phase 2B: login, status
		// Phase 2C: agent
		// Phase 2D: asset, binding
		// Phase 2E: service
	},
});

runMain(main);
