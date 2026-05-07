// bat-cli asset — Asset management commands.
// Subcommands: list, create, update, delete, tags

import { defineCommand } from "@nocoo/cli-base";
import assetCreate from "./create.js";
import assetDelete from "./delete.js";
import assetList from "./list.js";
import assetTags from "./tags.js";
import assetUpdate from "./update.js";

export default defineCommand({
	meta: {
		name: "asset",
		description: "Manage assets (list, create, update, delete, tags)",
	},
	subCommands: {
		list: assetList,
		create: assetCreate,
		update: assetUpdate,
		delete: assetDelete,
		tags: assetTags,
	},
});
