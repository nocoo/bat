// Tests for native schedule definitions.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
	buildPlan,
	buildScheduleContext,
	detectSystemd,
	launchdPlist,
	launchdPlistPath,
	resolveBackend,
	resolveEntryPath,
	type ScheduleContext,
	systemdQuote,
	systemdServicePath,
	systemdServiceUnit,
	systemdTimerPath,
	systemdTimerUnit,
	WINDOWS_BATTERY_SCRIPT,
	windowsCommandLine,
} from "./plan.js";

const HOME_REF = "$" + "{HOME}";

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "bat-ws-plan-"));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

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

describe("entry point", () => {
	test("resolves an existing absolute entry", () => {
		expect(resolveEntryPath(process.execPath)).toBe(process.execPath);
	});

	test("refuses to guess when argv has no entry", () => {
		expect(() => resolveEntryPath("")).toThrow(/entry point/);
	});

	test("builds a complete schedule context", () => {
		const built = buildScheduleContext({ home: dir, platform: "darwin", uid: 7 });
		expect(built.home).toBe(dir);
		expect(built.nodePath).toBe(process.execPath);
		expect(built.uid).toBe(7);
		expect(built.intervalSeconds).toBe(600);
		expect(built.logPath).toBe(join(dir, ".config", "bat", "workstation", "probe.log"));
	});

	test("falls back to the real uid", () => {
		const built = buildScheduleContext({ home: dir, platform: "darwin" });
		expect(built.uid).toBe(process.getuid?.() ?? 501);
	});

	test("accepts an explicit entry path", () => {
		const entry = join(dir, "bat.js");
		writeFileSync(entry, "");
		expect(buildScheduleContext({ home: dir, entryPath: entry }).entryPath).toBe(entry);
	});
});

describe("launchd", () => {
	test("writes a StartInterval job without KeepAlive", () => {
		const plist = launchdPlist(context());
		expect(plist).toContain("<string>ai.hexly.bat.workstation</string>");
		expect(plist).toContain("<integer>600</integer>");
		expect(plist).toContain("<key>StartInterval</key>");
		expect(plist).toContain("<key>RunAtLoad</key>\n\t<false/>");
		expect(plist).not.toContain("KeepAlive");
		expect(plist).toContain("<string>/usr/local/bin/node</string>");
		expect(plist).toContain("<string>/opt/bat/dist/bat.js</string>");
		expect(plist).toContain("<string>workstation</string>");
		expect(plist).toContain("<string>probe</string>");
	});

	test("escapes XML in paths", () => {
		const plist = launchdPlist(context({ entryPath: "/opt/a&b/bat.js" }));
		expect(plist).toContain("/opt/a&amp;b/bat.js");
	});

	test("registers idempotently and unregisters by label", () => {
		const plan = buildPlan(context(), "launchd");
		expect(plan.files.map((file) => file.path)).toStrictEqual([launchdPlistPath(dir)]);
		expect(plan.register[0]?.tolerateFailure).toBe(true);
		expect(plan.register[1]?.argv).toStrictEqual([
			"launchctl",
			"bootstrap",
			"gui/501",
			launchdPlistPath(dir),
		]);
		expect(plan.register[2]?.argv).toStrictEqual([
			"launchctl",
			"enable",
			"gui/501/ai.hexly.bat.workstation",
		]);
		expect(plan.unregister[0]?.argv).toStrictEqual([
			"launchctl",
			"bootout",
			"gui/501",
			launchdPlistPath(dir),
		]);
	});
});

describe("systemd", () => {
	test("quotes unit arguments and escapes percent and dollar specifiers", () => {
		expect(systemdQuote("/plain/path")).toBe('"/plain/path"');
		expect(systemdQuote('/a "quote" and \\ slash')).toBe('"/a \\"quote\\" and \\\\ slash"');
		expect(systemdQuote("/srv/100%/bat")).toBe('"/srv/100%%/bat"');
		expect(systemdQuote(`/srv/${HOME_REF}/bat`)).toBe(`"/srv/$${HOME_REF}/bat"`);
		expect(systemdQuote("/srv/$USER/bat")).toBe('"/srv/$$USER/bat"');
	});

	test("writes a oneshot service and a persistent=false timer", () => {
		const service = systemdServiceUnit(context());
		expect(service).toContain("Type=oneshot");
		expect(service).toContain('ExecStart="/usr/local/bin/node" "/opt/bat/dist/bat.js"');
		expect(service).toContain("workstation");
		expect(service).toContain("probe");

		const timer = systemdTimerUnit(context());
		expect(timer).toContain("OnUnitActiveSec=600");
		expect(timer).toContain("OnBootSec=600");
		expect(timer).toContain("Persistent=false");
		expect(timer).toContain("WantedBy=timers.target");
	});

	test("doubles dollar only in ExecStart, never in log paths", () => {
		const service = systemdServiceUnit(
			context({ entryPath: `/opt/${HOME_REF}/bat`, logPath: `/tmp/${HOME_REF}/probe.log` }),
		);
		expect(service).toContain(`"/opt/$${HOME_REF}/bat"`);
		expect(service).toContain(`StandardOutput=append:/tmp/${HOME_REF}/probe.log`);
		expect(service).toContain(`StandardError=append:/tmp/${HOME_REF}/probe.log`);
		expect(service).not.toContain(`StandardOutput=append:/tmp/$${HOME_REF}`);
	});

	test("escapes the log path for systemd", () => {
		const service = systemdServiceUnit(context({ logPath: join(dir, "100%", "probe.log") }));
		expect(service).toContain("StandardOutput=append:");
		expect(service).toContain("100%%");
	});

	test("rejects control characters before they reach a unit file", () => {
		expect(() => systemdServiceUnit(context({ entryPath: "/opt/bat\nprobe.js" }))).toThrow(
			/must not contain newlines/,
		);
		expect(() => launchdPlist(context({ entryPath: "/opt/bat\rprobe.js" }))).toThrow(
			/must not contain newlines/,
		);
		expect(() => buildPlan(context({ logPath: "/tmp/x\nprobe.log" }), "launchd")).toThrow(
			/must not contain newlines/,
		);
		expect(() =>
			windowsCommandLine(context({ platform: "win32", entryPath: "C:\\bat\r.js" })),
		).toThrow(/must not contain newlines/);
	});

	test("plans both unit files and enables the timer", () => {
		const plan = buildPlan(context({ platform: "linux" }), "systemd");
		expect(plan.files.map((file) => file.path)).toStrictEqual([
			systemdServicePath(dir),
			systemdTimerPath(dir),
		]);
		expect(plan.register.map((command) => command.argv)).toStrictEqual([
			["systemctl", "--user", "daemon-reload"],
			["systemctl", "--user", "enable", "--now", "ai.hexly.bat.workstation.timer"],
		]);
	});
});

describe("Windows Task Scheduler", () => {
	test("quotes the absolute command line", () => {
		expect(
			windowsCommandLine(
				context({
					platform: "win32",
					nodePath: "C:\\Program Files\\nodejs\\node.exe",
					entryPath: "C:\\bat\\dist\\bat.js",
				}),
			),
		).toBe('"C:\\Program Files\\nodejs\\node.exe" "C:\\bat\\dist\\bat.js" "workstation" "probe"');
	});

	test("creates an interactive, battery-friendly task without wake", () => {
		const plan = buildPlan(
			context({
				platform: "win32",
				nodePath: "C:\\Program Files\\nodejs\\node.exe",
				entryPath: "C:\\bat\\dist\\bat.js",
			}),
			"windows",
		);
		expect(plan.files).toStrictEqual([]);
		expect(plan.register[0]?.argv).toContain("/IT");
		expect(plan.register[0]?.argv).toContain("/F");
		expect(plan.register[0]?.argv).not.toContain("/RU");
		expect(plan.register[0]?.argv).toContain("10");
		expect(plan.register[1]?.argv.at(-1)).toBe(WINDOWS_BATTERY_SCRIPT);
		expect(WINDOWS_BATTERY_SCRIPT).toContain("DisallowStartIfOnBatteries=$false");
		expect(WINDOWS_BATTERY_SCRIPT).toContain("StopIfGoingOnBatteries=$false");
		expect(WINDOWS_BATTERY_SCRIPT).toContain("WakeToRun=$false");
		expect(plan.unregister[0]?.argv).toStrictEqual([
			"schtasks",
			"/Delete",
			"/TN",
			"bat-workstation",
			"/F",
		]);
	});
});

describe("backend resolution", () => {
	test("defaults to the native scheduler per platform", () => {
		expect(resolveBackend(undefined, "darwin", false)).toBe("launchd");
		expect(resolveBackend(undefined, "win32", false)).toBe("windows");
		expect(resolveBackend(undefined, "linux", true)).toBe("systemd");
	});

	test("never falls back silently on Linux without systemd", () => {
		expect(() => resolveBackend(undefined, "linux", false)).toThrow(/--backend cron/);
	});

	test("requires an explicit backend on other POSIX systems", () => {
		expect(() => resolveBackend(undefined, "freebsd", false)).toThrow(/--backend cron/);
		expect(resolveBackend("cron", "freebsd", false)).toBe("cron");
	});

	test("rejects unknown and impossible backends", () => {
		expect(() => resolveBackend("at", "linux", true)).toThrow(/unknown --backend/);
		expect(() => resolveBackend("launchd", "linux", true)).toThrow(/only available on macOS/);
		expect(() => resolveBackend("windows", "linux", true)).toThrow(/only available on Windows/);
		expect(() => resolveBackend("systemd", "darwin", true)).toThrow(/only available on Linux/);
		expect(() => resolveBackend("cron", "win32", false)).toThrow(/not available on Windows/);
	});

	test("plans nothing for cron because the block is managed separately", () => {
		expect(buildPlan(context(), "cron")).toStrictEqual({
			backend: "cron",
			files: [],
			register: [],
			unregister: [],
			finalize: [],
		});
	});

	test("detects systemd without running a command", () => {
		expect(typeof detectSystemd()).toBe("boolean");
	});
});
