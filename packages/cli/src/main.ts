// bat — CLI command tree.
// Server commands manage agents, assets and bindings; workstation commands are added later.

import { BAT_VERSION } from "@bat/shared";
import { defineCommand } from "@nocoo/base-cli";
import agent from "./commands/agent/index.js";
import asset from "./commands/asset/index.js";
import binding from "./commands/binding/index.js";
import doctor from "./commands/doctor.js";
import login from "./commands/login.js";
import service from "./commands/service/index.js";
import status from "./commands/status.js";
import update from "./commands/update.js";

export const main = defineCommand({
	meta: {
		name: "bat",
		version: BAT_VERSION,
		description: "bat CLI — agent & asset management for bat.hexly.ai",
	},
	subCommands: {
		login,
		status,
		doctor,
		update,
		agent,
		asset,
		binding,
		service,
		workstation: () => import("./commands/workstation/index.js").then((module) => module.default),
	},
});
