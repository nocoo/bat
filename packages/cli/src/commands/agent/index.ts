// bat-cli agent — Agent management commands.
// Subcommands: list, create, update, delete, heartbeat, tags

import { defineCommand } from "@nocoo/cli-base";
import agentCreate from "./create.js";
import agentDelete from "./delete.js";
import agentHeartbeat from "./heartbeat.js";
import agentList from "./list.js";
import agentTags from "./tags.js";
import agentUpdate from "./update.js";

export default defineCommand({
	meta: {
		name: "agent",
		description: "Manage agents (list, create, update, delete, heartbeat, tags)",
	},
	subCommands: {
		list: agentList,
		create: agentCreate,
		update: agentUpdate,
		delete: agentDelete,
		heartbeat: agentHeartbeat,
		tags: agentTags,
	},
});
