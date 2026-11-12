#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const value = (name: string): string | undefined => {
	const index = args.indexOf(name);
	return index === -1 ? undefined : args[index + 1];
};

const root = resolve(value("--root") ?? process.cwd());
const gitleaksRepo = value("--gitleaks-repo");
const gitleaksRange = value("--gitleaks-log-opts");
const gitleaksStaged = args.includes("--gitleaks-staged");
const skipGitleaks = args.includes("--skip-gitleaks");

const fail = (message: string): never => {
	console.error(`✘ security gate failed: ${message}`);
	process.exit(1);
};

const requireTool = (tool: string): string => {
	const found = Bun.which(tool);
	if (!found) fail(`${tool} is required but was not found`);
	return found;
};

const run = (command: string, commandArgs: string[], cwd: string) => {
	const result = spawnSync(command, commandArgs, {
		cwd,
		encoding: "utf8",
		env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
	});
	if (result.error) fail(`${command} could not run: ${result.error.message}`);
	return result;
};

const packageLocks = new Set([
	"bun.lock",
	"bun.lockb",
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"Cargo.lock",
]);
const lockfiles: string[] = [];

const walk = (dir: string) => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (
			entry.isDirectory() &&
			["node_modules", "target", ".git", ".wrangler", ".cache", "artifacts"].includes(entry.name)
		) {
			continue;
		}
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path);
		else if (packageLocks.has(entry.name)) lockfiles.push(path);
	}
};

walk(root);
lockfiles.sort();
if (lockfiles.length === 0) fail(`no dependency lockfiles found below ${root}`);

const osv = requireTool("osv-scanner");
const config = join(root, "osv-scanner.toml");
for (const lockfile of lockfiles) {
	if (!existsSync(lockfile)) fail(`lockfile disappeared: ${lockfile}`);
	const osvArgs = ["scan", `--lockfile=${lockfile}`];
	if (existsSync(config)) osvArgs.push(`--config=${config}`);
	const result = run(osv, osvArgs, root);
	if (result.status !== 0) {
		process.stderr.write(result.stdout ?? "");
		process.stderr.write(result.stderr ?? "");
		fail(`osv-scanner rejected ${lockfile}`);
	}
	console.log(`✔ osv-scanner: ${lockfile}`);
}

if (!skipGitleaks) {
	if (!gitleaksRepo || (!gitleaksStaged && !gitleaksRange)) {
		fail(
			"G1 requires --gitleaks-repo with --gitleaks-staged or --gitleaks-log-opts; recent-commit fallbacks are unsafe",
		);
	}
	const gitleaks = requireTool("gitleaks");
	const gitleaksArgs = ["git"];
	if (gitleaksStaged) gitleaksArgs.push("--staged");
	else gitleaksArgs.push(`--log-opts=${gitleaksRange}`);
	gitleaksArgs.push(`--config=${join(gitleaksRepo, ".gitleaks.toml")}`, "--no-banner", "--redact");
	const result = run(gitleaks, gitleaksArgs, gitleaksRepo);
	if (result.status !== 0) {
		process.stderr.write(result.stdout ?? "");
		process.stderr.write(result.stderr ?? "");
		fail(
			gitleaksStaged ? "gitleaks rejected staged content" : `gitleaks rejected ${gitleaksRange}`,
		);
	}
	console.log(gitleaksStaged ? "✔ gitleaks: staged content" : `✔ gitleaks: ${gitleaksRange}`);
}

console.log(skipGitleaks ? "✔ G2 dependency scan passed" : "✔ G1/G2 security gate passed");
