#!/usr/bin/env bun
/**
 * Isolated probes for `.husky/pre-commit` (index-snapshot L1).
 * Every probe runs in a temporary clone so the real index and worktree stay untouched.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const repo = join(import.meta.dirname, "..");
let failed = 0;

function check(name, ok, detail = "") {
	const text = detail.trim().replace(/\s+/g, " ").slice(0, 480);
	console.log(`${ok ? "ok" : "FAIL"} ${name}${text ? `: ${text}` : ""}`);
	if (!ok) failed = 1;
}

function runHook(cwd, { env = {}, timeout } = {}) {
	const scratch = join(cwd, ".tmp-l1-gate");
	mkdirSync(scratch, { recursive: true });
	const result = spawnSync("bash", ["scripts/hooks/pre-commit-l1.sh"], {
		cwd,
		env: { ...process.env, TMPDIR: scratch, ...env },
		encoding: "utf8",
		timeout,
	});
	return {
		status: result.status,
		signal: result.signal,
		output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
		scratch,
		leftovers: existsSync(scratch) ? readdirSync(scratch) : [],
	};
}

function snapshotGone(leftovers) {
	return leftovers.every(
		(name) => !name.startsWith("bat-index-") && !name.startsWith("bat-precommit-"),
	);
}

function git(args, cwd) {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

function linkDependencies(sourceRepo, targetRepo) {
	const nodeModules = join(targetRepo, "node_modules");
	mkdirSync(nodeModules, { recursive: true });
	for (const name of readdirSync(join(sourceRepo, "node_modules"))) {
		symlinkSync(join(sourceRepo, "node_modules", name), join(nodeModules, name));
	}

	for (const name of readdirSync(join(targetRepo, "packages"))) {
		const packageDir = join(targetRepo, "packages", name);
		if (!statSync(packageDir).isDirectory()) continue;
		const source = join(sourceRepo, "packages", name, "node_modules");
		if (!existsSync(source)) continue;
		const target = join(packageDir, "node_modules");
		mkdirSync(target, { recursive: true });
		for (const entry of readdirSync(source)) {
			if (entry === "@bat") continue;
			symlinkSync(join(source, entry), join(target, entry));
		}
		mkdirSync(join(target, "@bat"), { recursive: true });
		if (name !== "shared") {
			symlinkSync("../../../shared", join(target, "@bat", "shared"));
		}
	}

	mkdirSync(join(targetRepo, ".cache"), { recursive: true });
	const qualityCache = join(sourceRepo, ".cache", "quality");
	mkdirSync(qualityCache, { recursive: true });
	symlinkSync(qualityCache, join(targetRepo, ".cache", "quality"));
}

const indexBefore = git(["diff", "--cached", "--name-only"], repo).trim();
const tempRoot = mkdtempSync(join(tmpdir(), "bat-l1-gate-"));
const clone = join(tempRoot, "repo");

try {
	git(["clone", "--local", "--quiet", repo, clone], tmpdir());
	linkDependencies(repo, clone);
	execFileSync(process.execPath, ["scripts/quality/install-state.mjs", "--write"], {
		cwd: clone,
		stdio: "pipe",
	});

	const versionPath = "packages/shared/src/version.ts";
	const versionGood = readFileSync(join(clone, versionPath), "utf8");
	const versionBad =
		'// l1-gate probe: staged index type error\nexport const BAT_VERSION: number = "4.0.1";\n';
	const workflowPath = ".github/workflows/quality-slots.yml";
	const workflowGood = readFileSync(join(clone, workflowPath), "utf8");
	const releasePath = ".github/workflows/release.yml";
	const reset = () => git(["reset", "--hard", "HEAD"], clone);

	const healthy = runHook(clone, { timeout: 600_000 });
	check("healthy index snapshot exits 0", healthy.status === 0, healthy.output.slice(0, 200));
	check(
		"healthy removes snapshot temp dir",
		snapshotGone(healthy.leftovers),
		healthy.leftovers.join(","),
	);

	writeFileSync(join(clone, versionPath), versionBad);
	git(["add", "--", versionPath], clone);
	writeFileSync(join(clone, versionPath), versionGood);
	const mismatch = runHook(clone, { timeout: 600_000 });
	check("staged bad / worktree good rejects", mismatch.status !== 0, mismatch.output);
	check(
		"worktree remains good after rejected commit",
		readFileSync(join(clone, versionPath), "utf8") === versionGood,
	);
	reset();

	const noticePath = "Retrospective.md";
	const noticeGood = readFileSync(join(clone, noticePath), "utf8");
	const probeLine = `\n<!-- l1-gate-probe:${Date.now()} -->\n`;
	writeFileSync(join(clone, noticePath), `${noticeGood.trimEnd()}${probeLine}`);
	git(["add", "--", noticePath], clone);
	const docOnly = runHook(clone, { timeout: 600_000 });
	check(
		"non-code-only staged change still runs full L1",
		/━━━ coverage_ts/.test(docOnly.output) &&
			/━━━ rust_s1_s2/.test(docOnly.output) &&
			/✔ pre-commit passed/.test(docOnly.output),
		docOnly.output.slice(0, 320),
	);
	reset();

	const workflowBad = workflowGood.replace(
		"actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
		"actions/checkout@main",
	);
	writeFileSync(join(clone, workflowPath), workflowBad);
	git(["add", "--", workflowPath], clone);
	writeFileSync(join(clone, workflowPath), workflowGood);
	const mutableWorkflow = runHook(clone, { timeout: 600_000 });
	check(
		"staged mutable workflow ref rejects in S3",
		mutableWorkflow.status !== 0 &&
			/mutable external reference actions\/checkout@main/.test(mutableWorkflow.output),
		mutableWorkflow.output.slice(0, 480),
	);
	reset();

	git(["rm", "--quiet", "--", releasePath], clone);
	const deletedWorkflow = runHook(clone, { timeout: 600_000 });
	check(
		"staged workflow deletion still runs S3",
		deletedWorkflow.status !== 0 && /━━━ workflow \(exit=1\)/.test(deletedWorkflow.output),
		deletedWorkflow.output.slice(0, 480),
	);
	reset();

	git(["mv", releasePath, "docs/release.yml.probe"], clone);
	const renamedWorkflow = runHook(clone, { timeout: 600_000 });
	check(
		"workflow rename out of the directory still runs S3",
		renamedWorkflow.status !== 0 && /━━━ workflow \(exit=1\)/.test(renamedWorkflow.output),
		renamedWorkflow.output.slice(0, 480),
	);
	reset();

	check(
		"temporary clone index is clean",
		git(["diff", "--cached", "--name-only"], clone).trim() === "",
	);
	check(
		"repository index untouched",
		git(["diff", "--cached", "--name-only"], repo).trim() === indexBefore,
	);
} catch (err) {
	console.error(err);
	failed = 1;
} finally {
	rmSync(tempRoot, { recursive: true, force: true });
}

if (failed) process.exit(failed);
console.log("L1 gate probes passed");
