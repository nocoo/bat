// bat workstation detail — read back this machine's newest probe results.

import { defineCommand } from "@nocoo/base-cli";
import { runWorkstationDetail } from "../../workstation/detail.js";
import { getWorkstationPaths, type WorkstationPaths } from "../../workstation/store.js";

export interface DetailCommandDeps {
	limit?: number;
	json?: boolean;
	/** Injected for tests that must stay off the network. */
	paths?: WorkstationPaths;
}

/** Flag parsing lives here so the command body stays one call. */
export function parseDetailArgs(args: { limit?: unknown; json?: unknown }): DetailCommandDeps {
	return {
		...(args.limit ? { limit: Number(args.limit) } : {}),
		...(args.json === true ? { json: true } : {}),
	};
}

export async function runDetailCommand(deps: DetailCommandDeps = {}): Promise<number> {
	return await runWorkstationDetail({
		paths: deps.paths ?? getWorkstationPaths(),
		...(deps.limit !== undefined ? { limit: deps.limit } : {}),
		...(deps.json ? { json: true } : {}),
	});
}

export default defineCommand({
	meta: {
		name: "detail",
		description: "Show the newest reports and per-target probe results",
	},
	args: {
		limit: {
			type: "string",
			description: "How many recent reports to read (1-20, default 3)",
		},
		json: {
			type: "boolean",
			description: "Print the raw report payload",
		},
	},
	async run({ args }) {
		process.exitCode = await runDetailCommand({
			...(typeof args.limit === "string" && args.limit !== "" ? { limit: Number(args.limit) } : {}),
			...(args.json ? { json: true } : {}),
		});
	},
});
