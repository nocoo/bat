// bat workstation login — PKCE browser authorization plus machine exchange.

import { defineCommand } from "@nocoo/base-cli";
import { error } from "../../lib/output.js";
import { runWorkstationLogin } from "../../workstation/login.js";
import { resolveOrigins } from "../../workstation/origins.js";
import { type CommandExecutor, runCommand } from "../../workstation/scheduler/exec.js";
import {
	getWorkstationPaths,
	restrictWindowsAcl,
	type StoreDeps,
} from "../../workstation/store.js";

export interface LoginCommandDeps {
	loopbackUrl?: string;
	/** Headless mode: claim the name here, then approve the printed code in the UI. */
	headless?: boolean;
	name?: string;
}

/** Windows ACL restriction runs only for an explicit login, never in tests. */
export function storeDepsFor(
	platform: NodeJS.Platform,
	exec: CommandExecutor = runCommand,
): StoreDeps | undefined {
	if (platform !== "win32") {
		return undefined;
	}
	return { acl: (dir: string) => restrictWindowsAcl(dir, exec) };
}

export async function runLoginCommand(deps: LoginCommandDeps = {}): Promise<number> {
	try {
		const paths = getWorkstationPaths();
		const origins = resolveOrigins(deps.loopbackUrl);
		const store = storeDepsFor(process.platform);
		if (deps.headless === true && (deps.name ?? "").trim() === "") {
			error("Headless login needs --name so the workstation is identifiable before approval.");
			return 1;
		}
		const { exitCode, report } = await runWorkstationLogin({
			paths,
			origins,
			...(store ? { store } : {}),
			...(deps.headless === true ? { headless: { name: (deps.name ?? "").trim() } } : {}),
		});
		if (exitCode !== 0 || !report) {
			return exitCode;
		}
		return 0;
	} catch (err) {
		error((err as Error).message);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "login",
		description: "Authorize this workstation with a browser PKCE login",
	},
	args: {
		"loopback-url": {
			type: "string",
			description: "Loopback Worker origin for local acceptance (never production)",
		},
		headless: {
			type: "boolean",
			description: "Print a five minute pairing code instead of opening a browser",
		},
		name: {
			type: "string",
			description: "Display name claimed by a headless pairing",
		},
	},
	async run({ args }) {
		process.exitCode = await runLoginCommand({
			...(args["loopback-url"] ? { loopbackUrl: args["loopback-url"] } : {}),
			...(args.headless ? { headless: true } : {}),
			...(typeof args.name === "string" ? { name: args.name } : {}),
		});
	},
});
