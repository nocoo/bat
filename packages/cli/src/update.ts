// `bat update` — upgrade the published CLI, preferring the official registry.
//
// The check and the install both walk REGISTRIES in order: npmjs first, then
// the Tencent mirror. Nothing is installed when the local build is already
// current, and a failed install reports every attempt.

import { fetchLatestVersion, PACKAGE_NAME, REGISTRIES, type Registry } from "./lib/registry.js";

export type CommandRunner = (
	command: string,
	args: string[],
) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface UpdatePlan {
	currentVersion: string;
	latestVersion: string;
	registry: Registry;
	upToDate: boolean;
}

export interface UpdateDeps {
	currentVersion: string;
	fetchImpl?: typeof fetch;
	run?: CommandRunner;
	/** npm executable; defaults to `npm` from PATH. */
	npmCommand?: string;
	registries?: readonly Registry[];
	announce?: (message: string) => void;
}

export async function planUpdate(deps: UpdateDeps): Promise<UpdatePlan> {
	const { compareVersions } = await import("./lib/registry.js");
	const lookup = await fetchLatestVersion(
		deps.fetchImpl ?? fetch,
		deps.registries ?? REGISTRIES,
		PACKAGE_NAME,
	);
	return {
		currentVersion: deps.currentVersion,
		latestVersion: lookup.version,
		registry: lookup.registry,
		upToDate: compareVersions(deps.currentVersion, lookup.version) >= 0,
	};
}

/**
 * Install the requested version, trying each registry until one succeeds.
 * Returns the registry that worked, or every failure when none did.
 */
export async function installUpdate(
	plan: UpdatePlan,
	deps: Pick<UpdateDeps, "run" | "npmCommand" | "announce"> & { registries?: readonly Registry[] },
): Promise<{ ok: true; registry: Registry } | { ok: false; failures: string[] }> {
	const run: CommandRunner =
		deps.run ??
		(async (command, args) => {
			const { spawn } = await import("node:child_process");
			return await new Promise((resolve) => {
				const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
				let stdout = "";
				let stderr = "";
				child.stdout?.on("data", (chunk) => {
					stdout += String(chunk);
				});
				child.stderr?.on("data", (chunk) => {
					stderr += String(chunk);
				});
				child.once("error", (error) => {
					resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
				});
				child.once("close", (code) => {
					resolve({ code: code ?? 1, stdout, stderr });
				});
			});
		});
	const npm = deps.npmCommand ?? "npm";
	const failures: string[] = [];
	for (const registry of deps.registries ?? REGISTRIES) {
		deps.announce?.(`Installing ${PACKAGE_NAME}@${plan.latestVersion} from ${registry.label}...`);
		const result = await run(npm, [
			"install",
			"--global",
			`${PACKAGE_NAME}@${plan.latestVersion}`,
			`--registry=${registry.base}`,
			"--no-fund",
			"--no-audit",
		]);
		if (result.code === 0) {
			return { ok: true, registry };
		}
		const reason = (result.stderr || result.stdout).trim().split("\n").slice(-1)[0] ?? "failed";
		failures.push(`${registry.label}: ${reason}`);
		if (deps.announce !== undefined) {
			deps.announce(`  ${registry.label} failed, trying the next registry.`);
		}
	}
	return { ok: false, failures };
}
