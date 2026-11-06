// Tests for schedule installation, removal and inspection.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CRON_BEGIN, CRON_END } from "./cron.js";
import type { CommandExecutor, ExecOptions, ExecResult } from "./exec.js";
import {
	inspectSchedule,
	installSchedule,
	parseWindowsTaskSnapshot,
	removeSchedule,
	WINDOWS_TASK_SNAPSHOT_SCRIPT,
} from "./index.js";
import {
	launchdPlistPath,
	type ScheduleContext,
	systemdServicePath,
	systemdTimerPath,
} from "./plan.js";

let dir: string;

function ok(overrides: Partial<ExecResult> = {}): ExecResult {
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

interface RecordedCall {
	command: string;
	args: string[];
	options: ExecOptions;
}

function fakeExec(handler?: (command: string, args: string[]) => ExecResult | undefined): {
	exec: CommandExecutor;
	calls: RecordedCall[];
} {
	const calls: RecordedCall[] = [];
	const exec: CommandExecutor = vi.fn(async (command, args, options) => {
		calls.push({ command, args, options });
		return handler?.(command, args) ?? ok();
	});
	return { exec, calls };
}

const TASK_XML =
	'<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Actions/></Task>';

function taskJson(
	overrides: Partial<{
		exists: boolean;
		xml: string | null;
		notFound: boolean;
		error: string | null;
		hresult: string | null;
	}> = {},
): string {
	return JSON.stringify({
		exists: false,
		xml: null,
		notFound: false,
		error: null,
		hresult: null,
		...overrides,
	});
}

function isTaskQuery(args: readonly string[]): boolean {
	return (args.at(-1) ?? "").includes("Schedule.Service");
}

function isBatteryScript(args: readonly string[]): boolean {
	return (args.at(-1) ?? "").includes("Set-ScheduledTask");
}

function context(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
	return {
		home: dir,
		nodePath: "/usr/local/bin/node",
		entryPath: "/opt/bat/dist/bat.js",
		logPath: join(dir, "probe.log"),
		platform: "darwin",
		uid: 501,
		intervalSeconds: 600,
		...overrides,
	};
}

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "bat-ws-scheduler-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("installSchedule", () => {
	test("writes the plist and registers it with launchd", async () => {
		const { exec, calls } = fakeExec();
		const result = await installSchedule(context(), { exec, hasSystemd: false });

		expect(result.backend).toBe("launchd");
		const plist = launchdPlistPath(dir);
		expect(result.files).toStrictEqual([plist]);
		expect(readFileSync(plist, "utf-8")).toContain("<key>StartInterval</key>");
		expect(calls.map((call) => call.args.slice(0, 2).join(" "))).toStrictEqual([
			"bootout gui/501",
			"bootstrap gui/501",
			"enable gui/501/ai.hexly.bat.workstation",
		]);
	});

	test("is idempotent", async () => {
		const first = fakeExec();
		await installSchedule(context(), { exec: first.exec });
		const second = fakeExec();
		await expect(installSchedule(context(), { exec: second.exec })).resolves.toMatchObject({
			backend: "launchd",
		});
	});

	test("writes systemd units on Linux", async () => {
		const { exec, calls } = fakeExec();
		const result = await installSchedule(context({ platform: "linux" }), {
			exec,
			hasSystemd: true,
		});
		expect(result.files).toStrictEqual([systemdServicePath(dir), systemdTimerPath(dir)]);
		expect(calls[0]?.args).toStrictEqual(["--user", "daemon-reload"]);
		expect(calls[1]?.args).toStrictEqual([
			"--user",
			"enable",
			"--now",
			"ai.hexly.bat.workstation.timer",
		]);
	});

	test("creates the Windows task without local files", async () => {
		const { exec, calls } = fakeExec((command, args) =>
			command === "powershell.exe" && isTaskQuery(args)
				? ok({ stdout: taskJson({ notFound: true }) })
				: ok(),
		);
		const result = await installSchedule(context({ platform: "win32" }), {
			backend: "windows",
			exec,
		});
		expect(result.files).toStrictEqual([]);
		expect(calls.some((call) => call.command === "schtasks" && call.args.includes("/Create"))).toBe(
			true,
		);
		expect(calls.some((call) => call.command === "powershell.exe")).toBe(true);
	});

	test("installs the cron block when explicitly requested", async () => {
		const { exec, calls } = fakeExec((_command, args) =>
			args[0] === "-l" ? ok({ stdout: "0 1 * * * backup\n" }) : ok(),
		);
		const result = await installSchedule(context({ platform: "freebsd" }), {
			backend: "cron",
			exec,
		});
		expect(result).toStrictEqual({ backend: "cron", files: [] });
		const written = calls.find((call) => call.args[0] === "-");
		expect(written?.options.input).toContain(CRON_BEGIN);
		expect(written?.options.input).toContain("0 1 * * * backup");
	});

	test("rolls back our files when registration fails", async () => {
		let step = 0;
		const { exec, calls } = fakeExec(() => {
			step += 1;
			return step === 2 ? ok({ code: 1, stderr: "denied" }) : ok();
		});

		await expect(installSchedule(context(), { exec, hasSystemd: false })).rejects.toThrow(
			/launchctl bootstrap gui\/501 .* failed: denied/,
		);
		expect(existsSync(launchdPlistPath(dir))).toBe(false);
		expect(calls.some((call) => call.args[0] === "bootout")).toBe(true);
	});

	test("rolls back even when the unregister command cannot start", async () => {
		let bootouts = 0;
		const { exec } = fakeExec((command, args) => {
			if (command === "launchctl" && args[0] === "bootout") {
				bootouts += 1;
				return bootouts === 1 ? ok() : ok({ code: null, spawnError: "ENOENT" });
			}
			if (command === "launchctl" && args[0] === "bootstrap") {
				return ok({ code: 1, stderr: "denied" });
			}
			return ok();
		});
		await expect(installSchedule(context(), { exec })).rejects.toThrow(/denied/);
		expect(existsSync(launchdPlistPath(dir))).toBe(false);
	});

	test("reports a binary that cannot start", async () => {
		const { exec } = fakeExec((command) =>
			command === "launchctl" ? ok({ code: null, spawnError: "ENOENT" }) : ok(),
		);
		await expect(installSchedule(context(), { exec })).rejects.toThrow(/could not start: ENOENT/);
	});

	test("reports a failing command without stderr as an exit code", async () => {
		const { exec } = fakeExec((_command, args) =>
			args[0] === "bootstrap" ? ok({ code: 7, stderr: "" }) : ok(),
		);
		await expect(installSchedule(context(), { exec })).rejects.toThrow(/failed: exit 7/);
	});

	test("aborts before Create/Delete when the Windows snapshot times out", async () => {
		const { exec, calls } = fakeExec((command, args) =>
			command === "powershell.exe" && isTaskQuery(args) ? ok({ code: null, timedOut: true }) : ok(),
		);
		await expect(
			installSchedule(context({ platform: "win32" }), { backend: "windows", exec }),
		).rejects.toThrow(/timed out/);
		expect(calls.some((call) => call.args.includes("/Create"))).toBe(false);
		expect(calls.some((call) => call.args.includes("/Delete"))).toBe(false);
	});

	test("aborts before Create/Delete when the Windows snapshot is denied", async () => {
		const { exec, calls } = fakeExec((command, args) =>
			command === "powershell.exe" && isTaskQuery(args)
				? ok({ stdout: taskJson({ error: "Access is denied.", hresult: "0x80070005" }) })
				: ok(),
		);
		await expect(
			installSchedule(context({ platform: "win32" }), { backend: "windows", exec }),
		).rejects.toThrow(/Access is denied/);
		expect(calls.some((call) => call.args.includes("/Create"))).toBe(false);
		expect(calls.some((call) => call.args.includes("/Delete"))).toBe(false);
	});

	test("aborts before Create/Delete when the Windows snapshot is invalid XML", async () => {
		const { exec, calls } = fakeExec((command, args) =>
			command === "powershell.exe" && isTaskQuery(args)
				? ok({ stdout: taskJson({ exists: true, xml: "<broken" }) })
				: ok(),
		);
		await expect(
			installSchedule(context({ platform: "win32" }), { backend: "windows", exec }),
		).rejects.toThrow(/no task XML/);
		expect(calls.some((call) => call.args.includes("/Create"))).toBe(false);
		expect(calls.some((call) => call.args.includes("/Delete"))).toBe(false);
	});

	test("aborts before Create/Delete when the Windows snapshot is invalid JSON", async () => {
		const { exec, calls } = fakeExec((command, args) =>
			command === "powershell.exe" && isTaskQuery(args) ? ok({ stdout: "not json" }) : ok(),
		);
		await expect(
			installSchedule(context({ platform: "win32" }), { backend: "windows", exec }),
		).rejects.toThrow(/invalid JSON/);
		expect(calls.some((call) => call.args.includes("/Create"))).toBe(false);
		expect(calls.some((call) => call.args.includes("/Delete"))).toBe(false);
	});

	test("aborts when the Windows snapshot payload is incomplete", async () => {
		const { exec, calls } = fakeExec((command, args) =>
			command === "powershell.exe" && isTaskQuery(args) ? ok({ stdout: '{"exists":false}' }) : ok(),
		);
		await expect(
			installSchedule(context({ platform: "win32" }), { backend: "windows", exec }),
		).rejects.toThrow(/incomplete/);
		expect(calls.some((call) => call.args.includes("/Create"))).toBe(false);
	});

	test("aborts when the Windows snapshot does not say whether the task exists", async () => {
		const { exec, calls } = fakeExec((command, args) =>
			command === "powershell.exe" && isTaskQuery(args)
				? ok({ stdout: taskJson({ exists: false, notFound: false }) })
				: ok(),
		);
		await expect(
			installSchedule(context({ platform: "win32" }), { backend: "windows", exec }),
		).rejects.toThrow(/no existence flag/);
		expect(calls.some((call) => call.args.includes("/Create"))).toBe(false);
	});

	test("restores the previous Windows task when a later step fails", async () => {
		const previousXml =
			'<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"><Actions/></Task>';
		let restoredXml: string | undefined;
		const { exec, calls } = fakeExec((command, args) => {
			if (command === "powershell.exe" && isTaskQuery(args)) {
				return ok({ stdout: taskJson({ exists: true, xml: previousXml }) });
			}
			if (command === "powershell.exe" && isBatteryScript(args)) {
				return ok({ code: 1, stderr: "Set-ScheduledTask failed" });
			}
			if (command === "schtasks" && args[0] === "/Create" && args.includes("/XML")) {
				restoredXml = readFileSync(args[args.indexOf("/XML") + 1] as string, "utf-8");
				return ok();
			}
			return ok();
		});

		await expect(
			installSchedule(context({ platform: "win32" }), { backend: "windows", exec }),
		).rejects.toThrow(/Set-ScheduledTask failed/);

		expect(restoredXml).toBe(previousXml);
		expect(calls.some((call) => call.args.includes("/Delete"))).toBe(false);
	});

	test("rolls back a fresh Windows task when there was nothing to restore", async () => {
		const { exec, calls } = fakeExec((command, args) => {
			if (command === "powershell.exe" && isTaskQuery(args)) {
				return ok({ stdout: taskJson({ notFound: true }) });
			}
			if (command === "powershell.exe" && isBatteryScript(args)) {
				return ok({ code: 1, stderr: "Set-ScheduledTask failed" });
			}
			return ok();
		});

		await expect(
			installSchedule(context({ platform: "win32" }), { backend: "windows", exec }),
		).rejects.toThrow(/Set-ScheduledTask failed/);
		expect(calls.some((call) => call.command === "schtasks" && call.args.includes("/Delete"))).toBe(
			true,
		);
	});

	test("keeps a fresh Windows task when every step succeeds", async () => {
		const { exec, calls } = fakeExec((command, args) =>
			command === "powershell.exe" && isTaskQuery(args)
				? ok({ stdout: taskJson({ notFound: true }) })
				: ok(),
		);
		await expect(
			installSchedule(context({ platform: "win32" }), { backend: "windows", exec }),
		).resolves.toMatchObject({ backend: "windows" });
		expect(calls.some((call) => call.args.includes("/Delete"))).toBe(false);
	});

	test("rejects an unknown backend", async () => {
		const { exec } = fakeExec();
		await expect(installSchedule(context(), { exec, backend: "at" })).rejects.toThrow(
			/unknown --backend/,
		);
	});
});

describe("removeSchedule", () => {
	test("unregisters and deletes only our plist", async () => {
		const { exec } = fakeExec();
		await installSchedule(context(), { exec });

		const removal = fakeExec();
		const result = await removeSchedule(context(), "launchd", removal.exec);

		expect(result.removed).toStrictEqual([launchdPlistPath(dir)]);
		expect(result.warnings).toStrictEqual([]);
		expect(removal.calls[0]?.args.slice(0, 2)).toStrictEqual(["bootout", "gui/501"]);
		expect(existsSync(launchdPlistPath(dir))).toBe(false);
	});

	test("fails removal when unregister cannot start and keeps the plist", async () => {
		const { exec } = fakeExec();
		await installSchedule(context(), { exec });

		const removal = fakeExec((command) =>
			command === "launchctl" ? ok({ code: null, spawnError: "ENOENT" }) : ok(),
		);
		await expect(removeSchedule(context(), "launchd", removal.exec)).rejects.toThrow(
			/could not start/,
		);
		expect(existsSync(launchdPlistPath(dir))).toBe(true);
	});

	test("fails removal on a real unregister error and keeps the plist", async () => {
		const { exec } = fakeExec();
		await installSchedule(context(), { exec });

		const removal = fakeExec(() => ok({ code: 1, stderr: "Operation not permitted" }));
		await expect(removeSchedule(context(), "launchd", removal.exec)).rejects.toThrow(
			/Operation not permitted/,
		);
		expect(existsSync(launchdPlistPath(dir))).toBe(true);
	});

	test("warns when nothing is installed", async () => {
		const { exec } = fakeExec(() => ok({ code: 1, stderr: "Could not find specified service" }));
		const result = await removeSchedule(context(), "launchd", exec);
		expect(result.removed).toStrictEqual([]);
		expect(result.warnings).toContain("no workstation schedule files found");
	});

	test("reloads systemd only after deleting unit files", async () => {
		const { exec } = fakeExec();
		await installSchedule(context({ platform: "linux" }), { exec, hasSystemd: true });

		let filesAtReload: boolean | undefined;
		const removal = fakeExec((command, args) => {
			if (command === "systemctl" && args.includes("daemon-reload")) {
				filesAtReload = existsSync(systemdServicePath(dir)) || existsSync(systemdTimerPath(dir));
			}
			return ok();
		});
		const result = await removeSchedule(context({ platform: "linux" }), "systemd", removal.exec);
		expect(result.removed).toHaveLength(2);
		expect(filesAtReload).toBe(false);
	});

	test("restores a previously working schedule when a reinstall fails", async () => {
		const first = fakeExec();
		await installSchedule(context(), { exec: first.exec });
		const before = readFileSync(launchdPlistPath(dir), "utf-8");

		const failing = fakeExec((_command, args) =>
			args[0] === "bootstrap" ? ok({ code: 1, stderr: "denied" }) : ok(),
		);
		await expect(
			installSchedule(context({ logPath: "/tmp/other.log" }), { exec: failing.exec }),
		).rejects.toThrow(/denied/);

		expect(existsSync(launchdPlistPath(dir))).toBe(true);
		expect(readFileSync(launchdPlistPath(dir), "utf-8")).toBe(before);
	});

	test("removes the cron block", async () => {
		const { exec } = fakeExec((_command, args) =>
			args[0] === "-l" ? ok({ stdout: `keep\n${CRON_BEGIN}\nx\n${CRON_END}\n` }) : ok(),
		);
		const result = await removeSchedule(context({ platform: "freebsd" }), "cron", exec);
		expect(result).toStrictEqual({ backend: "cron", removed: [], warnings: [] });
	});

	test("warns when the cron block is absent", async () => {
		const { exec } = fakeExec(() => ok({ stdout: "keep\n" }));
		const result = await removeSchedule(context({ platform: "freebsd" }), "cron", exec);
		expect(result.warnings).toHaveLength(1);
	});

	test("skips deletion when the Windows task is structurally absent", async () => {
		const { exec, calls } = fakeExec(() => ok({ stdout: taskJson({ notFound: true }) }));
		const result = await removeSchedule(context({ platform: "win32" }), "windows", exec);
		expect(result.warnings).toContain("no workstation task found");
		expect(calls.some((call) => call.args.includes("/Delete"))).toBe(false);
	});

	test("deletes an existing Windows task", async () => {
		const { exec, calls } = fakeExec((command, args) =>
			command === "powershell.exe" && isTaskQuery(args)
				? ok({ stdout: taskJson({ exists: true, xml: TASK_XML }) })
				: ok(),
		);
		const result = await removeSchedule(context({ platform: "win32" }), "windows", exec);
		expect(result.warnings).toStrictEqual([]);
		expect(calls.some((call) => call.command === "schtasks" && call.args.includes("/Delete"))).toBe(
			true,
		);
	});

	test("keeps the task recorded when Windows deletion fails", async () => {
		const { exec } = fakeExec((command, args) => {
			if (command === "powershell.exe" && isTaskQuery(args)) {
				return ok({ stdout: taskJson({ exists: true, xml: TASK_XML }) });
			}
			if (command === "schtasks" && args[0] === "/Delete") {
				return ok({ code: 1, stderr: "Access is denied." });
			}
			return ok();
		});
		await expect(removeSchedule(context({ platform: "win32" }), "windows", exec)).rejects.toThrow(
			/Access is denied/,
		);
	});

	test("does not delete when the Windows snapshot is denied", async () => {
		const { exec, calls } = fakeExec(() =>
			ok({ stdout: taskJson({ error: "Access is denied.", hresult: "0x80070005" }) }),
		);
		await expect(removeSchedule(context({ platform: "win32" }), "windows", exec)).rejects.toThrow(
			/Access is denied/,
		);
		expect(calls.some((call) => call.args.includes("/Delete"))).toBe(false);
	});
});

describe("inspectSchedule", () => {
	test("reports launchd installation from our file", async () => {
		const { exec } = fakeExec();
		await expect(inspectSchedule(context(), "launchd", exec)).resolves.toStrictEqual({
			backend: "launchd",
			installed: false,
			files: [launchdPlistPath(dir)],
		});

		await installSchedule(context(), { exec });
		await expect(inspectSchedule(context(), "launchd", exec)).resolves.toMatchObject({
			installed: true,
		});
	});

	test("requires both systemd unit files", async () => {
		const { exec } = fakeExec();
		await installSchedule(context({ platform: "linux" }), { exec, hasSystemd: true });
		rmSync(systemdTimerPath(dir));

		await expect(
			inspectSchedule(context({ platform: "linux" }), "systemd", exec),
		).resolves.toMatchObject({ installed: false });
	});

	test("reads the managed cron block", async () => {
		const installed = fakeExec(() => ok({ stdout: `${CRON_BEGIN}\nx\n${CRON_END}` }));
		await expect(
			inspectSchedule(context({ platform: "freebsd" }), "cron", installed.exec),
		).resolves.toStrictEqual({ backend: "cron", installed: true, files: [] });
	});

	test("queries the Windows task read-only through the structured helper", async () => {
		const present = fakeExec(() => ok({ stdout: taskJson({ exists: true, xml: TASK_XML }) }));
		await expect(
			inspectSchedule(context({ platform: "win32" }), "windows", present.exec),
		).resolves.toStrictEqual({ backend: "windows", installed: true, files: [] });
		const missing = fakeExec(() => ok({ stdout: taskJson({ notFound: true }) }));
		await expect(
			inspectSchedule(context({ platform: "win32" }), "windows", missing.exec),
		).resolves.toMatchObject({ installed: false });
		const unavailable = fakeExec(() => ok({ code: null, spawnError: "ENOENT" }));
		await expect(
			inspectSchedule(context({ platform: "win32" }), "windows", unavailable.exec),
		).rejects.toThrow(/could not start/);
	});
});

describe("tolerated failures", () => {
	test("ignores unregister failures while removing", async () => {
		const { exec } = fakeExec();
		await installSchedule(context(), { exec });
		mkdirSync(join(dir, "unused"), { recursive: true });

		const removal = fakeExec(() => ok({ code: 1, stderr: "not loaded" }));
		await expect(removeSchedule(context(), "launchd", removal.exec)).resolves.toMatchObject({
			removed: [launchdPlistPath(dir)],
		});
	});
});

describe("parseWindowsTaskSnapshot", () => {
	test("reads a structured existing-task snapshot", () => {
		expect(parseWindowsTaskSnapshot(taskJson({ exists: true, xml: TASK_XML }))).toStrictEqual({
			exists: true,
			xml: TASK_XML,
			notFound: false,
			error: null,
			hresult: null,
		});
	});

	test("reads a structured not-found snapshot", () => {
		expect(
			parseWindowsTaskSnapshot(taskJson({ notFound: true, hresult: "0x8004130F" })),
		).toStrictEqual({
			exists: false,
			xml: null,
			notFound: true,
			error: null,
			hresult: "0x8004130F",
		});
	});

	test("reads a structured access error", () => {
		expect(
			parseWindowsTaskSnapshot(taskJson({ error: "Access is denied.", hresult: "0x80070005" })),
		).toStrictEqual({
			exists: false,
			xml: null,
			notFound: false,
			error: "Access is denied.",
			hresult: "0x80070005",
		});
	});

	test("rejects invalid JSON, invalid shapes and incomplete payloads", () => {
		expect(() => parseWindowsTaskSnapshot("not json")).toThrow(/invalid JSON/);
		expect(() => parseWindowsTaskSnapshot("[]")).toThrow(/invalid payload/);
		expect(() => parseWindowsTaskSnapshot("3")).toThrow(/invalid payload/);
		expect(() => parseWindowsTaskSnapshot('{"exists":true}')).toThrow(/incomplete/);
	});

	test("uses a constant locale-independent COM command", () => {
		expect(WINDOWS_TASK_SNAPSHOT_SCRIPT).toContain("Schedule.Service");
		expect(WINDOWS_TASK_SNAPSHOT_SCRIPT).toContain("GetTask($env:BAT_TASK_NAME)");
		expect(WINDOWS_TASK_SNAPSHOT_SCRIPT).toContain("0x80070002");
		expect(WINDOWS_TASK_SNAPSHOT_SCRIPT).toContain("0x8004130F");
		expect(WINDOWS_TASK_SNAPSHOT_SCRIPT).toContain("InnerException");
		expect(WINDOWS_TASK_SNAPSHOT_SCRIPT).not.toContain("bat-workstation");
	});
});
