import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
	buildStaleVersionArgs,
	CI_REGISTRATION_TIMEOUT_MS,
	CI_VIEW_TIMEOUT_MS,
	CI_WATCH_TIMEOUT_MS,
	type CiRunMetadata,
	type CiWaitDeps,
	formatChangelogSection,
	isReleaseCommit,
	releaseCommitMessage,
	syncBunLockWorkspaceVersions,
	versionedWorkspaceDirs,
	waitForCiSuccess,
} from "./release.ts";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const BIOME_BIN = resolve(REPO_ROOT, "node_modules/.bin/biome");
const WORKSPACES = ["", "packages/cli", "packages/shared", "packages/ui", "packages/worker"];

const LOCK_FIXTURE = `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "bat",
      "devDependencies": {
        "typescript": "^7.0.2",
      },
    },
    "packages/cli": {
      "name": "@nocoo/bat",
      "version": "2.4.2",
      "bin": {
        "bat": "./dist/bat.js",
      },
      "devDependencies": {
        "@bat/shared": "workspace:*",
      },
    },
    "packages/shared": {
      "name": "@bat/shared",
      "version": "2.4.2",
    },
    "packages/ui": {
      "name": "@bat/ui",
      "version": "2.4.2",
    },
    "packages/worker": {
      "name": "@bat/worker",
      "version": "2.4.2",
    },
  },
  "packages": {
    "react": ["react@19.3.1", "", {}, "sha512-aaa=="],

    "pinned": ["pinned@1.0.0", "", { "dependencies": { "react": "19.3.1" } }, "sha512-bbb=="],
  }
}
`;

function blankWorkspaceVersions(lock: string): string {
	return lock.replace(/^([ \t]*)"version": "[^"]*"/gm, '$1"version": ""');
}

const NESTED_VERSION_FIXTURE = `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "bat",
      "devDependencies": {
        "version": "2.4.2",
      },
    },
  },
  "packages": {
    "version": ["version@2.4.2", "", {}, "sha512-ccc=="],
  }
}
`;

describe("syncBunLockWorkspaceVersions", () => {
	test("rewrites workspace versions and preserves the dependency graph bytewise", () => {
		const result = syncBunLockWorkspaceVersions(LOCK_FIXTURE, "2.4.2", "3.0.0", WORKSPACES);

		expect(result.content).toBe(
			LOCK_FIXTURE.replaceAll('"version": "2.4.2"', '"version": "3.0.0"'),
		);
		expect(result.content).toContain('"react": ["react@19.3.1", "", {}, "sha512-aaa=="]');
		expect(result.content).toContain('"@bat/shared": "workspace:*"');
		expect(result.content).not.toContain("2.4.2");
		expect(result.content.length).toBe(LOCK_FIXTURE.length);
		expect(result.updated).toEqual([
			"packages/cli",
			"packages/shared",
			"packages/ui",
			"packages/worker",
		]);
	});

	test("tolerates the root workspace having no version entry", () => {
		const result = syncBunLockWorkspaceVersions(LOCK_FIXTURE, "2.4.2", "3.0.0", [""]);

		expect(result.content).toBe(LOCK_FIXTURE);
		expect(result.updated).toEqual([]);
	});

	test("leaves a nested dependency named version holding the old version untouched", () => {
		const result = syncBunLockWorkspaceVersions(NESTED_VERSION_FIXTURE, "2.4.2", "3.0.0", [""]);

		expect(result.content).toBe(NESTED_VERSION_FIXTURE);
		expect(result.updated).toEqual([]);
	});

	test("leaves a nested dependency named version holding a different version untouched", () => {
		const result = syncBunLockWorkspaceVersions(NESTED_VERSION_FIXTURE, "1.0.0", "3.0.0", [""]);

		expect(result.content).toBe(NESTED_VERSION_FIXTURE);
		expect(result.updated).toEqual([]);
	});

	test("fails closed when a workspace has no version entry", () => {
		const lock = LOCK_FIXTURE.replace('      "version": "2.4.2",\n', "", 1);

		expect(() => syncBunLockWorkspaceVersions(lock, "2.4.2", "3.0.0", WORKSPACES)).toThrow(
			/workspace "packages\/cli" has no "version" entry/,
		);
	});

	test("fails closed on an unexpected on-disk version", () => {
		const lock = LOCK_FIXTURE.replace('"version": "2.4.2"', '"version": "2.4.1"');

		expect(() => syncBunLockWorkspaceVersions(lock, "2.4.2", "3.0.0", WORKSPACES)).toThrow(
			/workspace "packages\/cli" has version "2\.4\.1", expected "2\.4\.2"/,
		);
	});

	test("fails closed when a workspace is missing from the lock", () => {
		expect(() =>
			syncBunLockWorkspaceVersions(LOCK_FIXTURE, "2.4.2", "3.0.0", ["packages/api"]),
		).toThrow(/workspace "packages\/api" not found/);
	});

	test("fails closed when the lock has no workspaces section", () => {
		expect(() => syncBunLockWorkspaceVersions("{}\n", "2.4.2", "3.0.0", WORKSPACES)).toThrow(
			/missing "workspaces" section/,
		);
	});

	test("syncs the real bun.lock without touching anything else", () => {
		const lock = readFileSync(resolve(REPO_ROOT, "bun.lock"), "utf-8");
		const rootPackage = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf-8"));
		const currentVersion = rootPackage.version as string;

		const result = syncBunLockWorkspaceVersions(lock, currentVersion, "9.9.9");

		expect(blankWorkspaceVersions(result.content)).toBe(blankWorkspaceVersions(lock));
		expect(result.content).not.toContain(`"version": "${currentVersion}"`);
		expect(result.content).toContain('"version": "9.9.9"');
		expect(result.updated).not.toContain("(root)");
		expect(result.updated.length).toBeGreaterThan(0);
	});
});

describe("versionedWorkspaceDirs", () => {
	test("derives every workspace directory from VERSION_TARGETS", () => {
		const dirs = versionedWorkspaceDirs();

		expect(dirs).toContain("");
		expect(new Set(dirs).size).toBe(dirs.length);
		for (const dir of dirs) {
			const pkg = readFileSync(resolve(REPO_ROOT, dir, "package.json"), "utf-8");
			expect(pkg).toContain('"version"');
		}
	});
});

describe("release commit subject", () => {
	test("uses an allowed conventional type and version prefix", () => {
		expect(releaseCommitMessage("3.0.0")).toBe("chore: release v3.0.0");
		expect(releaseCommitMessage("3.0.0")).toMatch(/^(fix|feat|docs|test|refactor|chore): /);
		expect(releaseCommitMessage("3.0.0")).not.toMatch(/^release: /);
	});

	test("keeps generated release commits out of the changelog", () => {
		expect(isReleaseCommit("chore: release v3.0.0")).toBe(true);
		expect(isReleaseCommit("release: v3.0.0")).toBe(false);
		expect(isReleaseCommit("feat: add workstation grants")).toBe(false);
	});
});

describe("buildStaleVersionArgs", () => {
	function negativeGlobs(): string[] {
		const args = buildStaleVersionArgs("2.4.2");
		return args
			.flatMap((arg, index) => (args[index - 1] === "--glob" ? [arg] : []))
			.filter((glob) => glob.startsWith("!"))
			.map((glob) => glob.slice(1));
	}

	test("skips test files and test directories but not runtime sources", () => {
		const globs = negativeGlobs();
		const excluded = (path: string) => globs.some((glob) => new Bun.Glob(glob).match(path));

		expect(excluded("packages/ui/src/lib/workstation-format.test.ts")).toBe(true);
		expect(excluded("packages/ui/tests/workstations.spec.ts")).toBe(true);
		expect(excluded("packages/worker/test/e2e/live.test.ts")).toBe(true);
		expect(excluded("packages/shared/src/__tests__/version.ts")).toBe(true);
		expect(excluded("scripts/release.ts")).toBe(true);
		expect(excluded("packages/shared/src/version.ts")).toBe(false);
		expect(excluded("packages/ui/src/lib/workstation-format.ts")).toBe(false);
	});

	test("still matches an old runtime version constant", () => {
		const args = buildStaleVersionArgs("2.4.2");
		const pattern = new RegExp(args[1] ?? "");
		const matches = (source: string) => new RegExp(pattern.source).test(source);

		expect(matches('export const BAT_VERSION = "2.4.2";')).toBe(true);
		expect(matches('\tcli_version: "2.4.2",')).toBe(true);
		expect(matches('const tag = "v2.4.2";')).toBe(true);
		expect(matches('"version": "2.4.20"')).toBe(false);
		expect(matches('"2.4.2.1"')).toBe(false);
	});
});

function biomeMarkdown(document: string): string {
	const result = Bun.spawnSync([BIOME_BIN, "format", "--stdin-file-path", "CHANGELOG.md"], {
		cwd: REPO_ROOT,
		stdin: Buffer.from(document),
	});
	expect(result.exitCode).toBe(0);
	return result.stdout.toString();
}

describe("formatChangelogSection", () => {
	test("emits a blank line after every section heading", () => {
		const section = formatChangelogSection("3.0.1", {
			added: ["Expose workstation monitoring"],
			changed: ["Bump jose to ^6.2.15"],
			fixed: ["Preserve release dependency snapshots"],
			removed: ["Drop legacy probe flags"],
		});

		expect(section).toBe(
			[
				"## v3.0.1",
				"",
				"### Added",
				"",
				"- Expose workstation monitoring",
				"",
				"### Changed",
				"",
				"- Bump jose to ^6.2.15",
				"",
				"### Fixed",
				"",
				"- Preserve release dependency snapshots",
				"",
				"### Removed",
				"",
				"- Drop legacy probe flags",
			].join("\n"),
		);
	});

	test("generator output already matches Biome Markdown formatting", () => {
		const section = formatChangelogSection("3.0.1", {
			added: ["Expose workstation monitoring", "Add workstation commands to bat cli"],
			changed: ["Bump @biomejs/biome to 2.6.4 (#648)"],
			fixed: [],
			removed: [],
		});
		const document = `# Changelog\n\n${section}\n`;

		expect(biomeMarkdown(document)).toBe(document);
	});
});

describe("waitForCiSuccess", () => {
	const SHA = "aaf10fd0c0ffee";

	function ciRun(overrides: Partial<CiRunMetadata> = {}): CiRunMetadata {
		return {
			databaseId: 42,
			headSha: SHA,
			headBranch: "main",
			event: "push",
			workflowName: "CI",
			status: "in_progress",
			conclusion: "",
			...overrides,
		};
	}

	interface FakeSteps {
		/** Successive `gh run list` payloads; the last one repeats. */
		list: string[];
		/** Advances the clock before each `gh run list` returns, like a stalled command. */
		listDelayMs?: number;
		watchCode?: number;
		view?: CiRunMetadata | string;
		viewCode?: number;
	}

	function fakeDeps(steps: FakeSteps) {
		const state = { now: 0 };
		const calls: string[][] = [];
		const timeouts: (number | undefined)[] = [];
		const list = [...steps.list];
		const deps: CiWaitDeps = {
			run: async (args, timeoutMs) => {
				calls.push(args);
				timeouts.push(timeoutMs);
				switch (args[1]) {
					case "list": {
						const payload = list.length > 1 ? (list.shift() as string) : (list[0] ?? "[]");
						state.now += steps.listDelayMs ?? 0;
						return { code: 0, stdout: payload, stderr: "" };
					}
					case "watch":
						return { code: steps.watchCode ?? 0, stdout: "", stderr: "" };
					case "view": {
						const stdout =
							typeof steps.view === "string"
								? steps.view
								: steps.view
									? JSON.stringify(steps.view)
									: "";
						return { code: steps.viewCode ?? 0, stdout, stderr: "" };
					}
					default:
						throw new Error(`unexpected gh call: ${args.join(" ")}`);
				}
			},
			sleep: async (ms) => {
				state.now += ms;
			},
			now: () => state.now,
		};
		return { deps, calls, timeouts };
	}

	test("polls while registration is pending, then requires a successful run", async () => {
		const { deps, calls, timeouts } = fakeDeps({
			list: ["[]", JSON.stringify([ciRun()])],
			view: ciRun({ status: "completed", conclusion: "success" }),
		});

		const final = await waitForCiSuccess(SHA, deps, { registrationMs: 60_000, pollMs: 10_000 });

		expect(final.conclusion).toBe("success");
		expect(calls.filter((call) => call[1] === "list")).toHaveLength(2);
		const listCall = calls[0] ?? [];
		expect(listCall).toContain(".github/workflows/ci.yml");
		expect(listCall).toContain(SHA);
		expect(listCall).toContain("push");
		expect(listCall).toContain("main");
		expect(calls.find((call) => call[1] === "watch")).toEqual([
			"run",
			"watch",
			"42",
			"--exit-status",
		]);
		expect(timeouts).toEqual([60_000, 50_000, CI_WATCH_TIMEOUT_MS, CI_VIEW_TIMEOUT_MS]);
	});

	test("rejects a matching record that only arrives after the registration deadline", async () => {
		const { deps, calls, timeouts } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			listDelayMs: CI_REGISTRATION_TIMEOUT_MS + 1_000,
			view: ciRun({ status: "completed", conclusion: "success" }),
		});

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(
			/no CI run registered for commit .* within 300000ms/,
		);
		expect(timeouts).toEqual([CI_REGISTRATION_TIMEOUT_MS]);
		expect(calls.filter((call) => call[1] === "watch")).toHaveLength(0);
	});

	test("fails closed when the verification call errors", async () => {
		const { deps, timeouts } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			viewCode: 1,
		});

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(
			/could not verify CI run 42 \(exit 1\)/,
		);
		expect(timeouts.at(-1)).toBe(CI_VIEW_TIMEOUT_MS);
	});

	test("fails closed when the run never registers", async () => {
		const { deps } = fakeDeps({ list: ["[]"] });

		await expect(
			waitForCiSuccess(SHA, deps, { registrationMs: 30_000, pollMs: 10_000 }),
		).rejects.toThrow(/no CI run registered for commit .* within 30000ms/);
	});

	test("fails closed on a run for a different commit", async () => {
		const { deps } = fakeDeps({ list: [JSON.stringify([ciRun({ headSha: "deadbeef" })])] });

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/does not match the pushed commit/);
	});

	test("fails closed on a run for a different branch", async () => {
		const { deps } = fakeDeps({ list: [JSON.stringify([ciRun({ headBranch: "feature" })])] });

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/branch=feature/);
	});

	test("fails closed on a different workflow", async () => {
		const { deps } = fakeDeps({ list: [JSON.stringify([ciRun({ workflowName: "Release" })])] });

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/does not match the pushed commit/);
	});

	test("throws when the watched run fails", async () => {
		const { deps } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			watchCode: 1,
			view: ciRun({ status: "completed", conclusion: "failure" }),
		});

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/did not succeed \(watch exit 1\)/);
	});

	test("throws when watch passes but the run was not green", async () => {
		const { deps } = fakeDeps({
			list: [JSON.stringify([ciRun()])],
			view: ciRun({ status: "completed", conclusion: "cancelled" }),
		});

		await expect(waitForCiSuccess(SHA, deps)).rejects.toThrow(/conclusion `cancelled`/);
	});
});
