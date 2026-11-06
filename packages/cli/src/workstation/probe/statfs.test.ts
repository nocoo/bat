// Tests for the isolated statfs child.

import { describe, expect, test, vi } from "vitest";
import { runCommand } from "../scheduler/exec.js";
import { STATFS_SCRIPT, statfsInChild } from "./statfs.js";

function result(overrides: Record<string, unknown> = {}): never {
	return {
		code: 0,
		signal: null,
		stdout: "",
		stderr: "",
		timedOut: false,
		aborted: false,
		...overrides,
	} as never;
}

describe("statfsInChild", () => {
	test("reads the real root volume through a child", async () => {
		const stats = await statfsInChild("/", { exec: runCommand });
		expect(stats.bsize).toBeGreaterThan(0);
		expect(stats.blocks).toBeGreaterThan(0);
		expect(stats.bavail).toBeGreaterThanOrEqual(0);
	});

	test("reports a missing mount as an error", async () => {
		await expect(
			statfsInChild("/definitely-not-a-mount-xyz", { exec: runCommand }),
		).rejects.toThrow();
	});

	test("runs a self-contained script without CLI imports", () => {
		expect(STATFS_SCRIPT).toContain("require('node:fs')");
		expect(STATFS_SCRIPT).not.toContain("workstation");
		expect(STATFS_SCRIPT).not.toContain("import(");
	});

	test("maps spawn failures and exit codes to errors", async () => {
		const spawnError = vi.fn().mockResolvedValue(result({ code: null, spawnError: "ENOENT" }));
		await expect(statfsInChild("/", { exec: spawnError })).rejects.toThrow(/could not start/);

		const failed = vi.fn().mockResolvedValue(result({ code: 1, stderr: "EACCES" }));
		await expect(statfsInChild("/", { exec: failed })).rejects.toThrow(/EACCES/);

		const silent = vi.fn().mockResolvedValue(result({ code: 2, stderr: "" }));
		await expect(statfsInChild("/", { exec: silent })).rejects.toThrow(/exited with 2/);
	});

	test("rejects unreadable or unusable child output", async () => {
		const garbage = vi.fn().mockResolvedValue(result({ stdout: "not json" }));
		await expect(statfsInChild("/", { exec: garbage })).rejects.toThrow(/no result/);

		const scalar = vi.fn().mockResolvedValue(result({ stdout: "3" }));
		await expect(statfsInChild("/", { exec: scalar })).rejects.toThrow(/no result/);

		const reported = vi.fn().mockResolvedValue(result({ stdout: '{"error":"ENOENT"}' }));
		await expect(statfsInChild("/", { exec: reported })).rejects.toThrow(/ENOENT/);

		const partial = vi.fn().mockResolvedValue(result({ stdout: '{"bsize":1}' }));
		await expect(statfsInChild("/", { exec: partial })).rejects.toThrow(/unusable/);
	});

	test("passes the mount and the abort signal to the child", async () => {
		const controller = new AbortController();
		const exec = vi.fn().mockResolvedValue(result({ stdout: '{"bsize":1,"blocks":2,"bavail":1}' }));
		await statfsInChild("/data", {
			exec,
			signal: controller.signal,
			timeoutMs: 1234,
			nodePath: "/bin/node",
		});
		expect(exec).toHaveBeenCalledWith("/bin/node", ["-e", STATFS_SCRIPT], {
			env: { BAT_STATFS_MOUNT: "/data" },
			timeoutMs: 1234,
			signal: controller.signal,
		});
	});
});
