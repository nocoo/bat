// bat-cli service — Service management commands.
// Subcommands: run, status, install, uninstall

import { defineCommand } from "@nocoo/cli-base";
import serviceInstall from "./install.js";
import serviceRun from "./run.js";
import serviceStatus from "./status.js";
import serviceUninstall from "./uninstall.js";

export default defineCommand({
	meta: {
		name: "service",
		description: "Manage the heartbeat service (run, status, install, uninstall)",
	},
	subCommands: {
		run: serviceRun,
		status: serviceStatus,
		install: serviceInstall,
		uninstall: serviceUninstall,
	},
});
