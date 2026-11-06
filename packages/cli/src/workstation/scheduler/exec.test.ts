// Tests for the no-shell command executor.

import { describe, expect, test } from "vitest";
import { runCommand } from "./exec.js";

const node = process.execPath;

describe("runCommand", () => {
	test("runs an argv command and captures stdout", async () => {
		const result = await runCommand(node, ["-e", "process.stdout.write('hello')"], {});
		expect(result).toStrictEqual({
			code: 0,
			signal: null,
			stdout: "hello",
			stderr: "",
			timedOut: false,
			aborted: false,
		});
	});

	test("feeds stdin", async () => {
		const result = await runCommand(node, ["-e", "process.stdin.pipe(process.stdout)"], {
			input: "from-stdin",
		});
		expect(result.stdout).toBe("from-stdin");
	});

	test("adds environment entries without dropping the parent environment", async () => {
		const result = await runCommand(
			node,
			["-e", "process.stdout.write(String(process.env.BAT_TEST))"],
			{ env: { BAT_TEST: "value" } },
		);
		expect(result.stdout).toBe("value");
	});

	test("kills a child that exceeds its timeout", async () => {
		const started = Date.now();
		const result = await runCommand(node, ["-e", "setTimeout(() => {}, 5000)"], {
			timeoutMs: 50,
		});
		expect(Date.now() - started).toBeLessThan(3000);
		expect(result.code).toBeNull();
		expect(result.signal).toBe("SIGTERM");
		expect(result.timedOut).toBe(true);
		expect(result.aborted).toBe(false);
	});

	test("kills a child when the signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const result = await runCommand(node, ["-e", "setTimeout(() => {}, 5000)"], {
			signal: controller.signal,
		});
		expect(result.code).toBeNull();
		expect(result.timedOut).toBe(false);
		expect(result.aborted).toBe(true);
	});

	test("kills a child when the signal aborts later", async () => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 30);
		const result = await runCommand(node, ["-e", "setTimeout(() => {}, 5000)"], {
			signal: controller.signal,
		});
		expect(result.code).toBeNull();
		expect(result.timedOut).toBe(false);
		expect(result.aborted).toBe(true);
	});

	test("reports a missing binary as a spawn error, not an exit code", async () => {
		const result = await runCommand("bat-definitely-missing-binary", [], {});
		expect(result.spawnError).toBe("ENOENT");
		expect(result.code).toBeNull();
	});

	test("escalates to SIGKILL when the child ignores SIGTERM", async () => {
		const result = await runCommand(
			node,
			["-e", "process.on('SIGTERM', () => {}); setTimeout(() => {}, 5000)"],
			{ timeoutMs: 300 },
		);
		expect(result.code).toBeNull();
		expect(result.signal).toBe("SIGKILL");
		expect(result.timedOut).toBe(true);
		expect(result.aborted).toBe(false);
	});

	test("reports a spawn call that throws synchronously", async () => {
		const result = await runCommand(null as unknown as string, [], {});
		expect(result.code).toBeNull();
		expect(result.spawnError).toContain("argument");
	});

	test("caps captured stderr", async () => {
		const result = await runCommand(node, ["-e", "process.stderr.write('e'.repeat(200000))"], {});
		expect(result.stderr.length).toBeGreaterThanOrEqual(64 * 1024);
		expect(result.stderr.length).toBeLessThan(200000);
	});

	test("ignores a stdin write failure after the child exits", async () => {
		const result = await runCommand(node, ["-e", "process.exit(0)"], {
			input: "x".repeat(1_000_000),
		});
		expect(result.code).toBe(0);
	});

	test("caps captured output", async () => {
		const result = await runCommand(node, ["-e", "process.stdout.write('x'.repeat(200000))"], {});
		expect(result.stdout.length).toBeGreaterThanOrEqual(64 * 1024);
		expect(result.stdout.length).toBeLessThan(200000);
	});
});
