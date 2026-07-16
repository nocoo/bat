// bat-cli binding — Binding management commands.
// Subcommands: list, create, delete

import { defineCommand } from "@nocoo/base-cli";
import bindingCreate from "./create.js";
import bindingDelete from "./delete.js";
import bindingList from "./list.js";

export default defineCommand({
	meta: {
		name: "binding",
		description: "Manage agent-asset bindings (list, create, delete)",
	},
	subCommands: {
		list: bindingList,
		create: bindingCreate,
		delete: bindingDelete,
	},
});
