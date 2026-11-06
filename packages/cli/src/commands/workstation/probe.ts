// bat workstation probe — run one collection cycle and upload one report.

import { defineCommand } from "@nocoo/base-cli";
import { error } from "../../lib/output.js";
import { type ProbeOutcome, runWorkstationProbe } from "../../workstation/probe/run.js";
import { getWorkstationPaths, type WorkstationPaths } from "../../workstation/store.js";

export interface ProbeCommandDeps {
	paths?: WorkstationPaths;
}

export async function runProbeCommand(deps: ProbeCommandDeps = {}): Promise<number> {
	try {
		const outcome: ProbeOutcome = await runWorkstationProbe({
			paths: deps.paths ?? getWorkstationPaths(),
		});
		return outcome.exitCode;
	} catch (err) {
		error((err as Error).message);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "probe",
		description: "Collect and upload one workstation report",
	},
	async run() {
		process.exitCode = await runProbeCommand();
	},
});
