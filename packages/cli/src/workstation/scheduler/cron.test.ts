// Tests for the explicit crontab backend.

import { describe, expect, test, vi } from "vitest";
import {
	CRON_BEGIN,
	CRON_END,
	cronLine,
	hasCronBlock,
	hasManagedCron,
	installCron,
	mergeCronBlock,
	readCrontab,
	removeCron,
	stripCronBlock,
	writeCrontab,
} from "./cron.js";
import type { ExecResult } from "./exec.js";
import type { ScheduleContext } from "./plan.js";

const HOME_REF = "$" + "{HOME}";

const CONTEXT: ScheduleContext = {
	home: "/home/tester",
	nodePath: "/usr/local/bin/node",
	entryPath: "/opt/bat/dist/bat.js",
	logPath: "/home/tester/.config/bat/workstation/probe.log",
	platform: "linux",
	uid: 1000,
	intervalSeconds: 600,
};

function result(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		code: 0,
		signal: null,
		stdout: "",
		stderr: "",
		timedOut: false,
		aborted: false,
		...overrides,
	};
}

describe("cron line", () => {
	test("uses absolute paths, ten minute cadence and a log redirect", () => {
		const line = cronLine(CONTEXT);
		expect(line).toBe(
			"*/10 * * * * '/usr/local/bin/node' '/opt/bat/dist/bat.js' workstation probe >> '/home/tester/.config/bat/workstation/probe.log' 2>&1",
		);
	});

	test("escapes percent signs for the crontab parser, not just the shell", () => {
		const line = cronLine({
			...CONTEXT,
			entryPath: "/opt/100%/bat.js",
			logPath: "/tmp/50%/probe.log",
		});
		expect(line).toContain("/opt/100\\%/bat.js");
		expect(line).toContain("/tmp/50\\%/probe.log");
	});

	test("keeps environment references literal", () => {
		const line = cronLine({ ...CONTEXT, entryPath: `/opt/${HOME_REF}/bat.js` });
		expect(line).toContain(`'/opt/${HOME_REF}/bat.js'`);
	});

	test("rejects newlines before they reach cron", () => {
		expect(() => cronLine({ ...CONTEXT, entryPath: "/opt/bat\r.js" })).toThrow(
			/must not contain newlines/,
		);
	});

	test("shell-quotes embedded single quotes", () => {
		const line = cronLine({ ...CONTEXT, entryPath: "/opt/it's/bat.js" });
		expect(line).toContain("'/opt/it'\\''s/bat.js'");
	});

	test("never schedules faster than once per minute", () => {
		expect(cronLine({ ...CONTEXT, intervalSeconds: 10 }).startsWith("*/1 ")).toBe(true);
	});
});

describe("block management", () => {
	const block = "*/10 * * * * cmd";

	test("appends the block after foreign lines", () => {
		const merged = mergeCronBlock("0 1 * * * backup\n", block);
		expect(merged).toBe(`0 1 * * * backup\n${CRON_BEGIN}\n${block}\n${CRON_END}\n`);
	});

	test("replaces our block in place", () => {
		const current = `# mine\n${CRON_BEGIN}\nold\n${CRON_END}\n# tail\n`;
		const merged = mergeCronBlock(current, block);
		expect(merged).toContain("# mine");
		expect(merged).toContain("# tail");
		expect(merged).not.toContain("old");
		expect(merged.split(CRON_BEGIN)).toHaveLength(2);
	});

	test("handles an empty crontab", () => {
		expect(mergeCronBlock("", block)).toBe(`${CRON_BEGIN}\n${block}\n${CRON_END}\n`);
	});

	test("strips only our block and reports whether it existed", () => {
		expect(stripCronBlock(`keep\n${CRON_BEGIN}\nx\n${CRON_END}\n`)).toStrictEqual({
			text: "keep",
			removed: true,
		});
		expect(stripCronBlock("keep\n")).toStrictEqual({ text: "keep\n", removed: false });
		expect(stripCronBlock(`${CRON_END}\n${CRON_BEGIN}`)).toStrictEqual({
			text: `${CRON_END}\n${CRON_BEGIN}`,
			removed: false,
		});
	});

	test("detects the managed block", () => {
		expect(hasCronBlock(`${CRON_BEGIN}\nx\n${CRON_END}`)).toBe(true);
		expect(hasCronBlock(CRON_BEGIN)).toBe(false);
		expect(hasCronBlock("")).toBe(false);
	});
});

describe("crontab I/O", () => {
	test("reads an existing crontab", async () => {
		const exec = vi.fn().mockResolvedValue(result({ stdout: "0 1 * * * backup\n" }));
		await expect(readCrontab(exec)).resolves.toBe("0 1 * * * backup\n");
	});

	test("treats a missing crontab as empty", async () => {
		const exec = vi.fn().mockResolvedValue(result({ code: 1, stderr: "no crontab for tester" }));
		await expect(readCrontab(exec)).resolves.toBe("");
	});

	test("reports an unavailable crontab binary", async () => {
		const exec = vi.fn().mockResolvedValue(result({ code: null, spawnError: "ENOENT" }));
		await expect(readCrontab(exec)).rejects.toThrow(/crontab is unavailable/);
	});

	test("reports other read failures", async () => {
		const exec = vi.fn().mockResolvedValue(result({ code: 2, stderr: "denied" }));
		await expect(readCrontab(exec)).rejects.toThrow(/crontab -l failed: denied/);

		const empty = vi.fn().mockResolvedValue(result({ code: 3, stderr: "" }));
		await expect(readCrontab(empty)).rejects.toThrow(/exit 3/);
	});

	test("writes through stdin", async () => {
		const exec = vi.fn().mockResolvedValue(result());
		await writeCrontab(exec, "content\n");
		expect(exec).toHaveBeenCalledWith("crontab", ["-"], { input: "content\n", timeoutMs: 5000 });
	});

	test("reports write failures", async () => {
		const exec = vi.fn().mockResolvedValue(result({ code: 1, stderr: "bad" }));
		await expect(writeCrontab(exec, "x")).rejects.toThrow(/crontab update failed: bad/);
		const silent = vi.fn().mockResolvedValue(result({ code: 1, stderr: "" }));
		await expect(writeCrontab(silent, "x")).rejects.toThrow(/exit 1/);
	});
});

describe("install and remove", () => {
	test("install preserves foreign entries", async () => {
		const inputs: string[] = [];
		const exec = vi.fn(async (_command: string, _args: string[], options: { input?: string }) => {
			if (options.input !== undefined) {
				inputs.push(options.input);
				return result();
			}
			return result({ stdout: "0 1 * * * backup\n" });
		});

		await installCron(exec, CONTEXT);

		expect(inputs).toHaveLength(1);
		expect(inputs[0]).toContain("0 1 * * * backup");
		expect(inputs[0]).toContain("workstation probe");
	});

	test("remove deletes our block and keeps foreign lines", async () => {
		const inputs: string[] = [];
		const exec = vi.fn(async (_command: string, _args: string[], options: { input?: string }) => {
			if (options.input !== undefined) {
				inputs.push(options.input);
				return result();
			}
			return result({ stdout: `0 1 * * * backup\n${CRON_BEGIN}\nx\n${CRON_END}\n` });
		});

		await expect(removeCron(exec)).resolves.toBe(true);
		expect(inputs[0]).toBe("0 1 * * * backup\n");
	});

	test("remove clears an otherwise empty crontab", async () => {
		const exec = vi.fn(async (_command: string, args: string[]) => {
			if (args[0] === "-l") {
				return result({ stdout: `${CRON_BEGIN}\nx\n${CRON_END}\n` });
			}
			return result();
		});

		await expect(removeCron(exec)).resolves.toBe(true);
		expect(exec).toHaveBeenCalledWith("crontab", ["-r"], { timeoutMs: 5000 });
	});

	test("remove tolerates an already absent crontab", async () => {
		const exec = vi.fn(async (_command: string, args: string[]) => {
			if (args[0] === "-l") {
				return result({ stdout: `${CRON_BEGIN}\nx\n${CRON_END}\n` });
			}
			return result({ code: 1, stderr: "no crontab for tester" });
		});

		await expect(removeCron(exec)).resolves.toBe(true);
	});

	test("remove reports a failed crontab reset", async () => {
		const exec = vi.fn(async (_command: string, args: string[]) => {
			if (args[0] === "-l") {
				return result({ stdout: `${CRON_BEGIN}\nx\n${CRON_END}\n` });
			}
			return result({ code: 1, stderr: "denied" });
		});

		await expect(removeCron(exec)).rejects.toThrow(/crontab removal failed: denied/);
	});

	test("reports a silent reset failure with the exit code", async () => {
		const exec = vi.fn(async (_command: string, args: string[]) => {
			if (args[0] === "-l") {
				return result({ stdout: `${CRON_BEGIN}\nx\n${CRON_END}\n` });
			}
			return result({ code: 4, stderr: "" });
		});

		await expect(removeCron(exec)).rejects.toThrow(/crontab removal failed: exit 4/);
	});

	test("remove is a no-op when our block is absent", async () => {
		const exec = vi.fn().mockResolvedValue(result({ stdout: "0 1 * * * backup\n" }));
		await expect(removeCron(exec)).resolves.toBe(false);
	});

	test("hasManagedCron reflects the crontab content", async () => {
		const withBlock = vi.fn().mockResolvedValue(result({ stdout: `${CRON_BEGIN}\n${CRON_END}` }));
		const without = vi.fn().mockResolvedValue(result({ stdout: "" }));
		await expect(hasManagedCron(withBlock)).resolves.toBe(true);
		await expect(hasManagedCron(without)).resolves.toBe(false);
	});
});
