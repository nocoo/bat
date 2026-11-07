// bat update — upgrade the published CLI, npmjs first and the mirror second.

import { BAT_VERSION } from "@bat/shared";
import { defineCommand } from "@nocoo/base-cli";
import { error, info, success, warn } from "../lib/output.js";
import { installUpdate, planUpdate, type UpdateDeps } from "../update.js";

export interface UpdateCommandDeps extends Partial<UpdateDeps> {
	check?: boolean;
}

export async function runUpdateCommand(deps: UpdateCommandDeps = {}): Promise<number> {
	const announce = deps.announce ?? info;
	let plan: Awaited<ReturnType<typeof planUpdate>>;
	try {
		plan = await planUpdate({
			...deps,
			currentVersion: deps.currentVersion ?? BAT_VERSION,
			announce,
		} as UpdateDeps);
	} catch (err) {
		error(`Could not resolve the latest version: ${(err as Error).message}`);
		return 1;
	}

	if (plan.upToDate) {
		success(`bat ${plan.currentVersion} is already the latest published version.`);
		return 0;
	}
	info(`Current: ${plan.currentVersion}`);
	info(`Latest:  ${plan.latestVersion} (${plan.registry.label})`);
	if (deps.check === true) {
		warn("Run 'bat update' to install it.");
		return 0;
	}

	const result = await installUpdate(plan, {
		...(deps.run ? { run: deps.run } : {}),
		...(deps.npmCommand ? { npmCommand: deps.npmCommand } : {}),
		announce,
	});
	if (!result.ok) {
		error("Update failed on every registry:");
		for (const failure of result.failures) {
			error(`  ${failure}`);
		}
		return 1;
	}
	success(`Installed bat ${plan.latestVersion} from ${result.registry.label}.`);
	info("Reopen the shell if 'bat --version' still reports the old build.");
	return 0;
}

export default defineCommand({
	meta: {
		name: "update",
		description: "Upgrade this CLI from npm, falling back to the mirror",
	},
	args: {
		check: {
			type: "boolean",
			description: "Only report the latest published version",
		},
	},
	async run({ args }) {
		process.exitCode = await runUpdateCommand({ ...(args.check ? { check: true } : {}) });
	},
});
