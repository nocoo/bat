#!/usr/bin/env bun
/**
 * Automated release script for bat monorepo.
 *
 * Bumps version across all package.json files and source constants,
 * syncs lockfile, generates CHANGELOG entries from conventional commits,
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
 *   Requires `gh` CLI authenticated for GitHub release creation.
 *   Requires `rg` (ripgrep) for stale version verification.
 */

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = pathResolve(import.meta.dirname as string, "..");
const PACKAGE_JSON = pathResolve(PROJECT_ROOT, "package.json");
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
	// Source code version constants
	{ path: "packages/shared/src/version.ts", pattern: "const-version" },
	// Rust probe
	{ path: "probe/Cargo.toml", pattern: "cargo-version" },
];

const BUMP_TYPES = ["patch", "minor", "major"] as const;
type BumpType = (typeof BUMP_TYPES)[number];

interface Commit {
	hash: string;
	subject: string;
}

interface ChangelogSections {
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
	opts?: { cwd?: string; inherit?: boolean },
): Promise<RunResult> {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			cwd: opts?.cwd ?? PROJECT_ROOT,
			stdio: opts?.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
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
		.filter((c) => !c.subject.startsWith("release: v"));
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

function formatChangelogSection(version: string, sections: ChangelogSections): string {
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

	// gh auth
	const ghResult = await run("gh", ["auth", "status"]);
	const ghAuthed = ghResult.code === 0;
	if (!ghAuthed) {
		console.warn("⚠️  gh CLI is not authenticated — GitHub release will be skipped.");
	}

	// Current version & bump
	const currentVersion = readCurrentVersion();
	const newVersion = bumpVersion(currentVersion, bumpArg);
	const lastTag = await getLastTag();

	if (isDryRun) {
		for (const t of VERSION_TARGETS) {
			console.info(`  [dry-run] would update ${t.path}`);
		}
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
		const installResult = await run("bun", ["install"], { inherit: true });
		if (installResult.code !== 0) {
			console.error("❌ bun install failed");
			process.exit(1);
		}
		// Sync Rust lockfile so probe/Cargo.lock matches new probe/Cargo.toml version.
		const cargoResult = await run("cargo", ["generate-lockfile"], {
			cwd: pathResolve(PROJECT_ROOT, "probe"),
			inherit: true,
		});
		if (cargoResult.code !== 0) {
			console.error("❌ cargo generate-lockfile failed");
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

	const versionPattern = `["']${currentVersion.replace(/\./g, "\\.")}["']|\\b${currentVersion.replace(/\./g, "\\.")}\\b`;
	const rgResult = await run("rg", [
		versionPattern,
		"--glob",
		"*.ts",
		"--glob",
		"*.tsx",
		"--glob",
		"!node_modules/**",
		"--glob",
		"!scripts/release.ts",
		"--glob",
		"!**/__tests__/**",
	]);

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
		const commitResult = await run("git", ["commit", "-m", `release: v${newVersion}`]);
		if (commitResult.code !== 0) {
			console.error("❌ Commit failed (pre-commit hooks?)");
			if (commitResult.stderr.trim()) {
				console.error(commitResult.stderr.trim());
			}
			console.error("   Fix the issues and retry.");
			process.exit(1);
		}
	}
	if (ghAuthed) {
		console.info("✅ GitHub CLI authenticated.");
	}

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
	if (ghAuthed) {
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
			console.error(
				`   Create manually: gh release create v${newVersion} --title "v${newVersion}"`,
			);
		} else {
			const releaseUrl = releaseResult.stdout.trim();
			if (releaseUrl) {
				console.info(`🔗 Release: ${releaseUrl}`);
			}
		}
	}
	if (ghAuthed) {
		const repoUrl = await run("gh", ["repo", "view", "--json", "url", "-q", ".url"]);
		const repo = repoUrl.stdout.trim();
		if (repo) {
			console.info(`📦 Repository: ${repo}`);
		}
	}
}

main().catch((err: unknown) => {
	console.error("❌ Unexpected error:", err);
	process.exit(1);
});
