#!/usr/bin/env bun
/**
 * Isolated probes for `.husky/pre-commit` (index-snapshot L1).
 * Covers staged-vs-worktree mismatch, non-code-only commits, and healthy pass.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
	return leftovers.every((name) => !name.startsWith("bat-index-"));
}

function git(args, cwd) {
	return execFileSync("git", args, { cwd, encoding: "utf8" });
}

const indexBefore = git(["diff", "--cached", "--name-only"], repo).trim();
const versionPath = "packages/shared/src/version.ts";
const versionGood = readFileSync(join(repo, versionPath), "utf8");
const versionBad =
	'// l1-gate probe: staged index type error\nexport const BAT_VERSION: number = "4.0.1";\n';

try {
	const healthy = runHook(repo, { timeout: 600_000 });
	check("healthy index snapshot exits 0", healthy.status === 0, healthy.output.slice(0, 200));
	check(
		"healthy removes snapshot temp dir",
		snapshotGone(healthy.leftovers),
		healthy.leftovers.join(","),
	);

	writeFileSync(join(repo, versionPath), versionBad);
	execFileSync("git", ["add", "--", versionPath], { cwd: repo });
	writeFileSync(join(repo, versionPath), versionGood);
	const mismatch = runHook(repo, { timeout: 600_000 });
	check("staged bad / worktree good rejects", mismatch.status !== 0, mismatch.output);
	check(
		"worktree remains good after rejected commit",
		readFileSync(join(repo, versionPath), "utf8") === versionGood,
	);
	execFileSync("git", ["restore", "--staged", versionPath], { cwd: repo });
	writeFileSync(join(repo, versionPath), versionGood);

	const noticePath = "Retrospective.md";
	const noticeGood = readFileSync(join(repo, noticePath), "utf8");
	const probeLine = `\n<!-- l1-gate-probe:${Date.now()} -->\n`;
	writeFileSync(join(repo, noticePath), `${noticeGood.trimEnd()}${probeLine}`);
	execFileSync("git", ["add", "--", noticePath], { cwd: repo });
	const docOnly = runHook(repo, { timeout: 600_000 });
	check(
		"non-code-only staged change still runs full L1",
		/━━━ unit_cov/.test(docOnly.output) &&
			/Checking coverage threshold/.test(docOnly.output) &&
			/━━━ rust_lint/.test(docOnly.output),
		docOnly.output.slice(0, 320),
	);
	execFileSync("git", ["restore", "--staged", noticePath], { cwd: repo });
	writeFileSync(join(repo, noticePath), noticeGood);

	check(
		"repository index untouched",
		git(["diff", "--cached", "--name-only"], repo).trim() === indexBefore,
	);
} catch (err) {
	console.error(err);
	failed = 1;
} finally {
	writeFileSync(join(repo, versionPath), versionGood);
	rmSync(join(repo, ".tmp-l1-gate"), { recursive: true, force: true });
}

if (failed) process.exit(failed);
console.log("L1 gate probes passed");
