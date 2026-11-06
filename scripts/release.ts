#!/usr/bin/env bun
/**
 * Automated release script for bat monorepo.
 *
 * Bumps version across all package.json files and source constants,
 * rewrites the Bun workspace version metadata in bun.lock in place (never
 * resolving or rewriting the dependency graph), installs with
 * --frozen-lockfile, generates CHANGELOG entries from conventional commits,
 * verifies no stale version strings remain, commits, tags, pushes,
 * and creates a GitHub release.
 *
 * Usage:
 *   bun run release              # patch bump (default)
 *   bun run release -- minor     # minor bump
 *   bun run release -- major     # major bump
 *   bun run release -- 2.0.0     # explicit version
 *   bun run release -- --dry-run # preview without side effects
 *
 * Env:
 *   Requires `gh` CLI authenticated: the release blocks on CI success for the
 *   exact pushed commit and then creates the GitHub release.
 *   Requires `rg` (ripgrep) for stale version verification.
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve as pathResolve } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = pathResolve(import.meta.dirname as string, "..");
const PACKAGE_JSON = pathResolve(PROJECT_ROOT, "package.json");
const BUN_LOCK = pathResolve(PROJECT_ROOT, "bun.lock");
const CHANGELOG_MD = pathResolve(PROJECT_ROOT, "CHANGELOG.md");

// ---------------------------------------------------------------------------
// Monorepo version targets
// ---------------------------------------------------------------------------

interface VersionTarget {
	/** Relative path from monorepo root */
	path: string;
	/** How to find and replace the version string */
	pattern: "json-version" | "const-version" | "cargo-version";
}

const VERSION_TARGETS: VersionTarget[] = [
	// package.json files
	{ path: "package.json", pattern: "json-version" },
	{ path: "packages/worker/package.json", pattern: "json-version" },
	{ path: "packages/shared/package.json", pattern: "json-version" },
	{ path: "packages/ui/package.json", pattern: "json-version" },
	{ path: "packages/cli/package.json", pattern: "json-version" },
	// Source code version constants
	{ path: "packages/shared/src/version.ts", pattern: "const-version" },
	// Rust probe
	{ path: "probe/Cargo.toml", pattern: "cargo-version" },
	// L2 baseline snapshots embed the worker version; bump them here so
	// pre-push E2E does not fail the release commit on snapshot mismatch.
	{ path: "packages/worker/test/e2e/baseline/__snapshots__/live.json", pattern: "json-version" },
	{
		path: "packages/worker/test/e2e/baseline/__snapshots__/fleet.status.json",
		pattern: "json-version",
	},
];

const BUMP_TYPES = ["patch", "minor", "major"] as const;
type BumpType = (typeof BUMP_TYPES)[number];

interface Commit {
	hash: string;
	subject: string;
}

export interface ChangelogSections {
	added: string[];
	changed: string[];
	fixed: string[];
	removed: string[];
}

const COMMIT_TYPE_MAP: Record<string, keyof ChangelogSections> = {
	feat: "added",
	fix: "fixed",
	refactor: "changed",
	chore: "changed",
	docs: "changed",
	test: "changed",
	perf: "changed",
	style: "changed",
	ci: "changed",
	build: "changed",
};

const REMOVED_KEYWORDS = /\b(remove|delete|drop)\b/i;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const CONVENTIONAL_RE = /^(\w+)(?:\(.+?\))?!?:\s*(.+)$/;
const RELEASE_COMMIT_RE = /^chore: release v\d/;

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

interface RunResult {
	code: number;
	stdout: string;
	stderr: string;
}

function run(
	cmd: string,
	args: string[],
	opts?: { cwd?: string; inherit?: boolean; timeoutMs?: number },
): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			cwd: opts?.cwd ?? PROJECT_ROOT,
			stdio: opts?.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
			timeout: opts?.timeoutMs,
		});

		let stdout = "";
		let stderr = "";

		if (!opts?.inherit) {
			child.stdout?.on("data", (d: Buffer) => {
				stdout += d.toString();
			});
			child.stderr?.on("data", (d: Buffer) => {
				stderr += d.toString();
			});
		}

		child.on("close", (code) => {
			resolve({ code: code ?? 1, stdout, stderr });
		});
	});
}

async function runOrDie(cmd: string, args: string[], errorMsg: string): Promise<string> {
	const result = await run(cmd, args);
	if (result.code !== 0) {
		console.error(`❌ ${errorMsg}`);
		if (result.stderr.trim()) {
			console.error(result.stderr.trim());
		}
		process.exit(1);
	}
	return result.stdout.trim();
}

// ---------------------------------------------------------------------------
// Version helpers
// ---------------------------------------------------------------------------

function parseSemver(version: string): [number, number, number] {
	if (!SEMVER_RE.test(version)) {
		console.error(`❌ Invalid semver: "${version}"`);
		process.exit(1);
	}
	return version.split(".").map(Number) as [number, number, number];
}

function compareSemver(a: string, b: string): number {
	const [a0, a1, a2] = parseSemver(a);
	const [b0, b1, b2] = parseSemver(b);
	if (a0 !== b0) {
		return a0 - b0;
	}
	if (a1 !== b1) {
		return a1 - b1;
	}
	return a2 - b2;
}

function bumpVersion(current: string, bumpArg: string): string {
	if (SEMVER_RE.test(bumpArg)) {
		if (compareSemver(bumpArg, current) <= 0) {
			console.error(`❌ Explicit version ${bumpArg} must be greater than current ${current}`);
			process.exit(1);
		}
		return bumpArg;
	}

	if (!BUMP_TYPES.includes(bumpArg as BumpType)) {
		console.error(`❌ Invalid bump type: "${bumpArg}"`);
		console.error("   Use: patch | minor | major | x.y.z");
		process.exit(1);
	}

	const [major, minor, patch] = parseSemver(current);
	switch (bumpArg as BumpType) {
		case "major":
			return `${major + 1}.0.0`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
		default:
			throw new Error(`Unexpected bump type: ${bumpArg}`);
	}
}

// ---------------------------------------------------------------------------
// Monorepo version update
// ---------------------------------------------------------------------------

function readCurrentVersion(): string {
	const raw = readFileSync(PACKAGE_JSON, "utf-8");
	const pkg = JSON.parse(raw);
	return pkg.version;
}

function updateVersionInFile(
	target: VersionTarget,
	oldVersion: string,
	newVersion: string,
): boolean {
	const abs = pathResolve(PROJECT_ROOT, target.path);
	const content = readFileSync(abs, "utf-8");
	let updated: string;

	if (target.pattern === "json-version") {
		const pattern = `"version": "${oldVersion}"`;
		const replacement = `"version": "${newVersion}"`;
		if (!content.includes(pattern)) {
			console.error(`  ✗ ${target.path} — pattern not found: ${pattern}`);
			return false;
		}
		updated = content.replace(pattern, replacement);
	} else if (target.pattern === "cargo-version") {
		// Cargo.toml: `version = "x.y.z"` (unquoted key, spaces around =)
		const escaped = oldVersion.replace(/\./g, "\\.");
		const re = new RegExp(`^version\\s*=\\s*"${escaped}"`, "m");
		if (!re.test(content)) {
			console.error(`  ✗ ${target.path} — version "${oldVersion}" not found`);
			return false;
		}
		updated = content.replace(re, `version = "${newVersion}"`);
	} else {
		// const-version: replace quoted version strings like "x.y.z"
		const escaped = oldVersion.replace(/\./g, "\\.");
		const re = new RegExp(`"${escaped}"`, "g");
		if (!re.test(content)) {
			console.error(`  ✗ ${target.path} — version "${oldVersion}" not found`);
			return false;
		}
		const re2 = new RegExp(`"${escaped}"`, "g");
		updated = content.replace(re2, `"${newVersion}"`);
	}

	writeFileSync(abs, updated, "utf-8");
	return true;
}

// ---------------------------------------------------------------------------
// Bun lockfile version sync
// ---------------------------------------------------------------------------

// Bun records each workspace version in bun.lock but omits the root one.
const ROOT_WORKSPACE = "";

const VERSION_LINE_RE = /^(\s*)"version"\s*:\s*"([^"]*)"(,?)\s*$/;

/** Workspace directories whose version lives in bun.lock, derived from VERSION_TARGETS. */
export function versionedWorkspaceDirs(targets: VersionTarget[] = VERSION_TARGETS): string[] {
	const dirs: string[] = [];
	for (const target of targets) {
		if (target.pattern !== "json-version" || basename(target.path) !== "package.json") {
			continue;
		}
		const dir = dirname(target.path);
		dirs.push(dir === "." ? ROOT_WORKSPACE : dir);
	}
	return dirs;
}

function braceDepthDelta(line: string): number {
	const withoutStrings = line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
	let delta = 0;
	for (const char of withoutStrings) {
		if (char === "{") {
			delta++;
		} else if (char === "}") {
			delta--;
		}
	}
	return delta;
}

function findWorkspaceBlocks(lines: string[]): Map<string, { start: number; end: number }> {
	const sectionStart = lines.findIndex((line) => /^\s*"workspaces"\s*:\s*\{\s*$/.test(line));
	if (sectionStart === -1) {
		throw new Error('missing "workspaces" section');
	}

	const blocks = new Map<string, { start: number; end: number }>();
	let depth = 0;
	let current: { dir: string; start: number } | undefined;

	for (let i = sectionStart; i < lines.length; i++) {
		const line = lines[i] ?? "";
		if (current === undefined && depth === 1) {
			const open = /^\s*"((?:[^"\\]|\\.)*)"\s*:\s*\{\s*$/.exec(line);
			if (open) {
				current = { dir: open[1] ?? "", start: i };
			}
		}
		depth += braceDepthDelta(line);
		if (current !== undefined && depth === 1 && i > current.start) {
			blocks.set(current.dir, { start: current.start, end: i });
			current = undefined;
		}
		if (depth <= 0) {
			break;
		}
	}

	return blocks;
}

/**
 * Rewrite only the workspace version strings of a bun.lock text. Everything
 * else (dependency graph, integrity hashes, empty registry slots, whitespace) is
 * preserved bytewise, so `bun install --frozen-lockfile` can validate the result
 * without resolving anything. Fails closed on a missing or unexpected version.
 */
export function syncBunLockWorkspaceVersions(
	lockContent: string,
	oldVersion: string,
	newVersion: string,
	workspaceDirs: readonly string[] = versionedWorkspaceDirs(),
): { content: string; updated: string[] } {
	const lines = lockContent.split("\n");
	const blocks = findWorkspaceBlocks(lines);
	const updated: string[] = [];

	for (const dir of workspaceDirs) {
		const block = blocks.get(dir);
		if (!block) {
			throw new Error(`workspace "${dir || "(root)"}" not found`);
		}

		let versionLine: number | undefined;
		let found: RegExpExecArray | undefined;
		// Only direct members of the workspace object count; a dependency named
		// "version" inside devDependencies must never be mistaken for it.
		let depth = 1;
		for (let i = block.start + 1; i < block.end; i++) {
			const line = lines[i] ?? "";
			if (depth === 1) {
				const match = VERSION_LINE_RE.exec(line);
				if (match) {
					versionLine = i;
					found = match;
					break;
				}
			}
			depth += braceDepthDelta(line);
		}

		if (versionLine === undefined || found === undefined) {
			if (dir === ROOT_WORKSPACE) {
				continue;
			}
			throw new Error(`workspace "${dir}" has no "version" entry`);
		}

		const current = found[2] ?? "";
		if (current !== oldVersion) {
			throw new Error(`workspace "${dir}" has version "${current}", expected "${oldVersion}"`);
		}

		lines[versionLine] = `${found[1] ?? ""}"version": "${newVersion}"${found[3] ?? ""}`;
		updated.push(dir || "(root)");
	}

	return { content: lines.join("\n"), updated };
}

function syncBunLockVersions(oldVersion: string, newVersion: string, dryRun: boolean): string[] {
	let synced: { content: string; updated: string[] };
	try {
		synced = syncBunLockWorkspaceVersions(readFileSync(BUN_LOCK, "utf-8"), oldVersion, newVersion);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`❌ bun.lock workspace version sync failed: ${message}`);
		console.error("   Run `git checkout .` to revert any partial version bump.");
		process.exit(1);
	}

	if (!dryRun) {
		writeFileSync(BUN_LOCK, synced.content, "utf-8");
	}
	return synced.updated;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function getLastTag(): Promise<string | undefined> {
	const result = await run("git", ["describe", "--tags", "--abbrev=0"]);
	if (result.code !== 0) {
		return undefined;
	}
	return result.stdout.trim();
}

async function getCommitsSinceTag(tag: string | undefined): Promise<Commit[]> {
	const range = tag ? `${tag}..HEAD` : "HEAD";
	const args = ["log", range, "--format=%H|||%s"];
	const stdout = await runOrDie("git", args, "Failed to read git log");

	if (!stdout) {
		return [];
	}

	return stdout
		.split("\n")
		.filter((line) => line.includes("|||"))
		.map((line) => {
			const sepIdx = line.indexOf("|||");
			return {
				hash: line.slice(0, sepIdx),
				subject: line.slice(sepIdx + 3),
			};
		})
		.filter((c) => !isReleaseCommit(c.subject));
}

/** Release commits are generated noise; keep them out of the next CHANGELOG. */
export function isReleaseCommit(subject: string): boolean {
	return RELEASE_COMMIT_RE.test(subject);
}

/** Conventional commit subject; `release:` is not an allowed type. */
export function releaseCommitMessage(version: string): string {
	return `chore: release v${version}`;
}

// ---------------------------------------------------------------------------
// CHANGELOG helpers
// ---------------------------------------------------------------------------

function classifyCommits(commits: Commit[]): ChangelogSections {
	const sections: ChangelogSections = {
		added: [],
		changed: [],
		fixed: [],
		removed: [],
	};

	for (const commit of commits) {
		const { subject } = commit;

		// Skip merge commits
		if (subject.startsWith("Merge ")) {
			continue;
		}

		let description: string;
		let section: keyof ChangelogSections;

		const match = CONVENTIONAL_RE.exec(subject);
		if (match) {
			const type = (match[1] as string).toLowerCase();
			description = capitalizeFirst((match[2] as string).trim());
			section = COMMIT_TYPE_MAP[type] ?? "changed";
		} else {
			description = capitalizeFirst(subject.trim());
			section = "changed";
		}

		// Override: keywords indicating removal (only when type is ambiguous)
		if (REMOVED_KEYWORDS.test(subject) && section === "changed") {
			section = "removed";
		}

		if (!sections[section].includes(description)) {
			sections[section].push(description);
		}
	}

	return sections;
}

function capitalizeFirst(s: string): string {
	if (!s) {
		return s;
	}
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatChangelogSection(version: string, sections: ChangelogSections): string {
	const lines: string[] = [`## v${version}`];

	const sectionOrder: [keyof ChangelogSections, string][] = [
		["added", "Added"],
		["changed", "Changed"],
		["fixed", "Fixed"],
		["removed", "Removed"],
	];

	for (const [key, heading] of sectionOrder) {
		const items = sections[key];
		if (items.length > 0) {
			lines.push("");
			lines.push(`### ${heading}`);
			lines.push("");
			for (const item of items) {
				lines.push(`- ${item}`);
			}
		}
	}

	return lines.join("\n");
}

function updateChangelog(newSection: string): void {
	const content = readFileSync(CHANGELOG_MD, "utf-8");
	const marker = "## v";
	const idx = content.indexOf(marker);

	let updated: string;
	if (idx === -1) {
		updated = `${content.trimEnd()}\n\n${newSection}\n`;
	} else {
		updated = `${content.slice(0, idx) + newSection}\n\n${content.slice(idx)}`;
	}

	writeFileSync(CHANGELOG_MD, updated);
}

// ---------------------------------------------------------------------------
// Stale version scan
// ---------------------------------------------------------------------------

// Test-only files legitimately keep historical version literals as fixtures;
// runtime sources hard-coding the old version must still fail the release.
const STALE_VERSION_GLOBS = [
	"*.ts",
	"*.tsx",
	"!node_modules/**",
	"!scripts/release.ts",
	"!**/*.test.ts",
	"!**/*.test.tsx",
	"!**/*.spec.ts",
	"!**/*.spec.tsx",
	"!**/test/**",
	"!**/tests/**",
	"!**/__tests__/**",
];

export function buildStaleVersionArgs(version: string): string[] {
	const escaped = version.replace(/\./g, "\\.");
	// Match the version when wrapped in quotes or prefixed with `v`, but never
	// as a substring of an IPv4 literal (e.g. 1.1.1 inside 1.1.1.1).
	const versionPattern = `(?<![.\\d])(?:["']${escaped}["']|v${escaped})(?![.\\d])`;
	return ["-P", versionPattern, ...STALE_VERSION_GLOBS.flatMap((glob) => ["--glob", glob])];
}

// ---------------------------------------------------------------------------
// CI gate before tagging
// ---------------------------------------------------------------------------

const CI_WORKFLOW = ".github/workflows/ci.yml";
const CI_WORKFLOW_NAME = "CI";
const CI_BRANCH = "main";
const CI_RUN_FIELDS = "databaseId,headSha,headBranch,event,workflowName,status,conclusion";
export const CI_REGISTRATION_TIMEOUT_MS = 5 * 60_000;
export const CI_WATCH_TIMEOUT_MS = 60 * 60_000;
export const CI_VIEW_TIMEOUT_MS = 30_000;
const CI_POLL_MS = 10_000;

export interface CiRunMetadata {
	databaseId: number;
	headSha: string;
	headBranch: string;
	event: string;
	workflowName: string;
	status: string;
	conclusion: string;
}

export interface CiWaitDeps {
	run: (args: string[], timeoutMs?: number) => Promise<RunResult>;
	sleep: (ms: number) => Promise<void>;
	now: () => number;
}

function parseCiRun(raw: string, source: string): CiRunMetadata {
	try {
		return JSON.parse(raw) as CiRunMetadata;
	} catch {
		throw new Error(`could not parse \`${source}\` output`);
	}
}

function parseCiRuns(raw: string): CiRunMetadata[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error("could not parse `gh run list` output");
	}
	if (!Array.isArray(parsed)) {
		throw new Error("unexpected `gh run list` output");
	}
	return parsed as CiRunMetadata[];
}

/** Refuse to trust a run that is not the CI workflow push on main for this commit. */
function assertCiRunIdentity(run: CiRunMetadata, sha: string): void {
	if (
		run.headSha !== sha ||
		run.headBranch !== CI_BRANCH ||
		run.event !== "push" ||
		run.workflowName !== CI_WORKFLOW_NAME
	) {
		throw new Error(
			`CI run ${run.databaseId} does not match the pushed commit (sha=${run.headSha}, branch=${run.headBranch}, event=${run.event}, workflow=${run.workflowName})`,
		);
	}
}

/**
 * Block until the CI workflow for the exact pushed commit succeeds. The run is
 * located by commit/event/branch, its metadata is re-verified, and any failed,
 * cancelled, mismatched or timed-out run throws so the caller never tags
 * unproven source.
 */
export async function waitForCiSuccess(
	sha: string,
	deps: CiWaitDeps,
	timeouts: { registrationMs?: number; watchMs?: number; pollMs?: number } = {},
): Promise<CiRunMetadata> {
	const registrationMs = timeouts.registrationMs ?? CI_REGISTRATION_TIMEOUT_MS;
	const watchMs = timeouts.watchMs ?? CI_WATCH_TIMEOUT_MS;
	const pollMs = timeouts.pollMs ?? CI_POLL_MS;
	const deadline = deps.now() + registrationMs;

	let registered: CiRunMetadata | undefined;
	while (registered === undefined) {
		const remainingMs = Math.max(1, deadline - deps.now());
		const listed = await deps.run(
			[
				"run",
				"list",
				"--workflow",
				CI_WORKFLOW,
				"--commit",
				sha,
				"--event",
				"push",
				"--branch",
				CI_BRANCH,
				"--limit",
				"10",
				"--json",
				CI_RUN_FIELDS,
			],
			remainingMs,
		);
		if (listed.code !== 0) {
			throw new Error(`\`gh run list\` failed (exit ${listed.code})`);
		}
		if (deps.now() >= deadline) {
			throw new Error(`no CI run registered for commit ${sha} within ${registrationMs}ms`);
		}
		const [found] = parseCiRuns(listed.stdout);
		if (found !== undefined) {
			assertCiRunIdentity(found, sha);
			registered = found;
			break;
		}
		await deps.sleep(pollMs);
	}

	const id = String(registered.databaseId);
	const watched = await deps.run(["run", "watch", id, "--exit-status"], watchMs);
	if (watched.code !== 0) {
		throw new Error(`CI run ${id} did not succeed (watch exit ${watched.code})`);
	}

	const viewed = await deps.run(["run", "view", id, "--json", CI_RUN_FIELDS], CI_VIEW_TIMEOUT_MS);
	if (viewed.code !== 0) {
		throw new Error(`could not verify CI run ${id} (exit ${viewed.code})`);
	}
	const final = parseCiRun(viewed.stdout, "gh run view");
	assertCiRunIdentity(final, sha);
	if (final.status !== "completed" || final.conclusion !== "success") {
		throw new Error(
			`CI run ${id} is ${final.status} with conclusion \`${final.conclusion}\`, expected success`,
		);
	}
	return final;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	// --- Parse args ---
	const rawArgs = process.argv.slice(2).filter((a) => a !== "--");
	const isDryRun = rawArgs.includes("--dry-run");
	const bumpArg = rawArgs.find((a) => a !== "--dry-run") ?? "patch";

	if (isDryRun) {
		console.info("🏃 Dry-run mode enabled — no changes will be written.");
	}

	// Clean working tree
	const status = await runOrDie("git", ["status", "--porcelain"], "Failed to check git status");
	if (status) {
		console.error("❌ Working tree is not clean. Commit or stash changes first.");
		console.error(status);
		process.exit(1);
	}

	// On a branch
	await runOrDie(
		"git",
		["symbolic-ref", "--short", "HEAD"],
		"Detached HEAD — checkout a branch first",
	);

	// gh auth — required: the CI gate and GitHub release both depend on it
	const ghResult = await run("gh", ["auth", "status"]);
	if (ghResult.code !== 0) {
		console.error("❌ gh CLI is not authenticated — cannot verify CI or create the release.");
		console.error("   Run `gh auth login`, then retry. No tag was created.");
		process.exit(1);
	}

	// Current version & bump
	const currentVersion = readCurrentVersion();
	const newVersion = bumpVersion(currentVersion, bumpArg);
	const lastTag = await getLastTag();

	if (isDryRun) {
		for (const t of VERSION_TARGETS) {
			console.info(`  [dry-run] would update ${t.path}`);
		}
		const preview = syncBunLockVersions(currentVersion, newVersion, true);
		console.info(`  [dry-run] would sync bun.lock workspace versions: ${preview.join(", ")}`);
	} else {
		let failures = 0;
		for (const target of VERSION_TARGETS) {
			const ok = updateVersionInFile(target, currentVersion, newVersion);
			if (!ok) {
				failures++;
			}
		}

		if (failures > 0) {
			console.error(`\n❌ Failed to update ${failures}/${VERSION_TARGETS.length} files. Aborting.`);
			console.error("   Run `git checkout .` to revert partial changes.");
			process.exit(1);
		}
		const syncedWorkspaces = syncBunLockVersions(currentVersion, newVersion, false);
		console.info(`  ✓ bun.lock — synced workspace versions: ${syncedWorkspaces.join(", ")}`);
		// Frozen: the lockfile already carries the new workspace versions, so Bun
		// only validates it and never resolves dependencies (which would rewrite
		// integrity and registry fields).
		const installResult = await run("bun", ["install", "--frozen-lockfile"], { inherit: true });
		if (installResult.code !== 0) {
			console.error("❌ bun install --frozen-lockfile failed");
			process.exit(1);
		}
		// Sync only the probe's version, preserving the tested dependency graph.
		const cargoResult = await run("cargo", ["update", "--offline", "--package", "bat-probe"], {
			cwd: pathResolve(PROJECT_ROOT, "probe"),
			inherit: true,
		});
		if (cargoResult.code !== 0) {
			console.error("❌ cargo lockfile version sync failed");
			process.exit(1);
		}
	}

	const commits = await getCommitsSinceTag(lastTag);
	if (commits.length === 0) {
		console.warn("⚠️  No commits found since last tag.");
	}

	const sections = classifyCommits(commits);
	const changelogSection = formatChangelogSection(newVersion, sections);

	if (isDryRun) {
		console.info("[dry-run] Would update CHANGELOG.md");
	} else {
		updateChangelog(changelogSection);
	}

	const rgResult = await run("rg", buildStaleVersionArgs(currentVersion));

	if (rgResult.code === 0 && rgResult.stdout.trim()) {
		console.error(`❌ Found stale version "${currentVersion}" in source files:`);
		console.error(rgResult.stdout.trim());
		if (isDryRun) {
			console.warn("   [dry-run] Stale versions detected but continuing.");
		} else {
			console.error("   Aborting. Update these files before releasing.");
			process.exit(1);
		}
	} else {
		console.info("✅ No stale version references found.");
	}

	const filesToStage = [
		...VERSION_TARGETS.map((t) => t.path),
		"bun.lock",
		"probe/Cargo.lock",
		"CHANGELOG.md",
	];

	if (isDryRun) {
		console.info("[dry-run] Would commit and stage files.");
	} else {
		await runOrDie("git", ["add", ...filesToStage], "Failed to stage files");
		const commitResult = await run("git", ["commit", "-m", releaseCommitMessage(newVersion)]);
		if (commitResult.code !== 0) {
			console.error("❌ Commit failed (pre-commit hooks?)");
			if (commitResult.stderr.trim()) {
				console.error(commitResult.stderr.trim());
			}
			console.error("   Fix the issues and retry.");
			process.exit(1);
		}
	}
	console.info("✅ GitHub CLI authenticated.");

	if (isDryRun) {
		process.exit(0);
	}
	const pushResult = await run("git", ["push"], { inherit: true });
	if (pushResult.code !== 0) {
		console.error("❌ git push failed");
		console.error("   Recovery commands:");
		console.error("     git push");
		console.error(`     git tag -a v${newVersion} -m "v${newVersion}"`);
		console.error("     git push --tags");
		console.error(`     gh release create v${newVersion} --title "v${newVersion}" --notes "..."`);
		process.exit(1);
	}

	// CI gate: only tag source that CI proved on the exact pushed commit.
	const headSha = await runOrDie("git", ["rev-parse", "HEAD"], "Failed to resolve pushed commit");
	console.info(`⏳ Waiting for CI (${CI_WORKFLOW}) on ${headSha} ...`);
	try {
		await waitForCiSuccess(headSha, {
			run: (args, timeoutMs) => run("gh", args, { timeoutMs }),
			sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
			now: () => Date.now(),
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`❌ CI gate failed for ${headSha}: ${message}`);
		console.error(`   Tag v${newVersion} was NOT created. Fix CI, then rerun the release.`);
		process.exit(1);
	}
	console.info("✅ CI passed for the pushed commit.");

	const tagResult = await run("git", ["tag", "-a", `v${newVersion}`, "-m", `v${newVersion}`]);
	if (tagResult.code !== 0) {
		console.error(`❌ Failed to create tag v${newVersion}`);
		if (tagResult.stderr.includes("already exists")) {
			console.error(`   Tag already exists. Delete with: git tag -d v${newVersion}`);
		}
		process.exit(1);
	}
	const pushTagResult = await run("git", ["push", "--tags"], {
		inherit: true,
	});
	if (pushTagResult.code !== 0) {
		console.error("❌ git push --tags failed");
		console.error("   Recovery: git push --tags");
		process.exit(1);
	}

	// GitHub Release
	const releaseResult = await run("gh", [
		"release",
		"create",
		`v${newVersion}`,
		"--title",
		`v${newVersion}`,
		"--notes",
		changelogSection,
	]);

	if (releaseResult.code !== 0) {
		console.error("⚠️  GitHub release creation failed (tag is pushed)");
		console.error(`   Create manually: gh release create v${newVersion} --title "v${newVersion}"`);
	} else {
		const releaseUrl = releaseResult.stdout.trim();
		if (releaseUrl) {
			console.info(`🔗 Release: ${releaseUrl}`);
		}
	}
	const repoUrl = await run("gh", ["repo", "view", "--json", "url", "-q", ".url"]);
	const repo = repoUrl.stdout.trim();
	if (repo) {
		console.info(`📦 Repository: ${repo}`);
	}
}

if (import.meta.main) {
	main().catch((err: unknown) => {
		console.error("❌ Unexpected error:", err);
		process.exit(1);
	});
}
