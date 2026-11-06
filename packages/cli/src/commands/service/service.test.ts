// Tests for bat service commands (run, status, install, uninstall)
// and PID file utilities.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager } from "../../lib/config.js";
import {
	getPidFilePath,
	isProcessRunning,
	readPidFile,
	removePidFile,
	writePidFile,
} from "../../lib/pid.js";
import { escapeXml, generatePlist, runServiceInstall } from "./install.js";
import { parseAgentsArg, runServiceLoop, sendHeartbeat } from "./run.js";
import { runServiceStatus } from "./status.js";
import type { CommandRunner } from "./uninstall.js";
import { runServiceUninstall } from "./uninstall.js";

// Mock fetch globally
const mockFetch = vi.fn<typeof fetch>();

// Mock consola to suppress output during tests
vi.mock("consola", () => ({
	consola: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	},
}));

let tempDir: string;

const VALID_CONFIG: BatCliConfig = {
	worker_url: "https://bat-ingest.worker.hexly.ai",
	api_key: "test-cli-token",
	source_key: "550e8400-e29b-41d4-a716-446655440000",
	heartbeat_interval: 1, // 1 second for fast tests
};

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "bat-service-"));
	mockFetch.mockReset();
	vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

function writeConfig(dir: string, config: BatCliConfig): void {
	const manager = createConfigManager(dir);
	manager.write(config);
}

// --- PID file utilities ---

describe("PID file utilities", () => {
	test("getPidFilePath returns path in config dir", () => {
		const path = getPidFilePath("/tmp/bat");
		expect(path).toBe("/tmp/bat/bat.pid");
	});

	test("writePidFile and readPidFile roundtrip", () => {
		const pidPath = join(tempDir, "test.pid");
		writePidFile(pidPath, 12345);
		expect(readPidFile(pidPath)).toBe(12345);
	});

	test("readPidFile returns null when file does not exist", () => {
		expect(readPidFile(join(tempDir, "nonexistent.pid"))).toBeNull();
	});

	test("readPidFile returns null for invalid content", () => {
		const pidPath = join(tempDir, "bad.pid");
		writeFileSync(pidPath, "not-a-number");
		expect(readPidFile(pidPath)).toBeNull();
	});

	test("removePidFile removes file", () => {
		const pidPath = join(tempDir, "rm.pid");
		writePidFile(pidPath, 99);
		removePidFile(pidPath);
		expect(existsSync(pidPath)).toBe(false);
	});

	test("removePidFile ignores missing file", () => {
		expect(() => removePidFile(join(tempDir, "gone.pid"))).not.toThrow();
	});

	test("isProcessRunning returns true for current process", () => {
		expect(isProcessRunning(process.pid)).toBe(true);
	});

	test("isProcessRunning returns false for impossible PID", () => {
		expect(isProcessRunning(999999999)).toBe(false);
	});
});

// --- parseAgentsArg ---

describe("parseAgentsArg", () => {
	test("parses single agent", () => {
		const result = parseAgentsArg("my-agent:running");
		expect(result).toEqual({
			ok: true,
			agents: [{ match_key: "my-agent", status: "running" }],
		});
	});

	test("parses multiple agents", () => {
		const result = parseAgentsArg("a:running,b:stopped");
		expect(result).toEqual({
			ok: true,
			agents: [
				{ match_key: "a", status: "running" },
				{ match_key: "b", status: "stopped" },
			],
		});
	});

	test("rejects empty input", () => {
		const result = parseAgentsArg("");
		expect(result).toEqual({ ok: false, error: "No agents specified" });
	});

	test("rejects invalid format", () => {
		const result = parseAgentsArg("no-colon");
		expect(result.ok).toBe(false);
	});

	test("rejects invalid status", () => {
		const result = parseAgentsArg("a:unknown");
		expect(result.ok).toBe(false);
	});

	test("rejects duplicate match_key", () => {
		const result = parseAgentsArg("a:running,a:stopped");
		expect(result.ok).toBe(false);
	});
});

// --- sendHeartbeat ---

describe("sendHeartbeat", () => {
	test("returns true on success", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ updated: 1, created: 0, missing: 0 }), { status: 200 }),
		);

		const { HttpClient } = await import("../../lib/http.js");
		const client = new HttpClient("https://bat-ingest.worker.hexly.ai", "token");
		const result = await sendHeartbeat(client, {
			source_key: "sk",
			agents: [{ match_key: "a", status: "running" }],
		});
		expect(result).toBe(true);
	});

	test("returns false on network error", async () => {
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const { HttpClient } = await import("../../lib/http.js");
		const client = new HttpClient("https://bat-ingest.worker.hexly.ai", "token");
		const result = await sendHeartbeat(client, {
			source_key: "sk",
			agents: [{ match_key: "a", status: "running" }],
		});
		expect(result).toBe(false);
	});

	test("returns false on auth error", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const { HttpClient } = await import("../../lib/http.js");
		const client = new HttpClient("https://bat-ingest.worker.hexly.ai", "token");
		const result = await sendHeartbeat(client, {
			source_key: "sk",
			agents: [{ match_key: "a", status: "running" }],
		});
		expect(result).toBe(false);
	});
});

// --- runServiceLoop ---

describe("runServiceLoop", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceLoop(manager, "a:running");
		expect(exitCode).toBe(1);
	});

	test("returns 1 on invalid agents arg", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceLoop(manager, "");
		expect(exitCode).toBe(1);
	});

	test("returns 1 when another service is running (PID file exists with live process)", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const pidPath = join(tempDir, "test.pid");
		writePidFile(pidPath, process.pid); // current process = alive

		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceLoop(manager, "a:running", { pidFilePath: pidPath });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("starts when PID file exists but process is dead", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const pidPath = join(tempDir, "test.pid");
		writePidFile(pidPath, 999999999); // dead PID

		// Mock heartbeat response
		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ updated: 1, created: 0, missing: 0 }), { status: 200 }),
		);

		const controller = new AbortController();
		const manager = createConfigManager(tempDir);

		// Abort immediately after start
		setTimeout(() => controller.abort(), 50);

		const exitCode = await runServiceLoop(manager, "a:running", {
			pidFilePath: pidPath,
			pid: 42,
			signal: controller.signal,
		});
		expect(exitCode).toBe(0);
		expect(mockFetch).toHaveBeenCalled(); // initial heartbeat sent
	});

	test("sends initial heartbeat and cleans up PID on abort", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const pidPath = join(tempDir, "test.pid");

		mockFetch.mockResolvedValue(
			new Response(JSON.stringify({ updated: 1, created: 0, missing: 0 }), { status: 200 }),
		);

		const controller = new AbortController();
		const manager = createConfigManager(tempDir);

		// Abort after initial heartbeat
		setTimeout(() => controller.abort(), 50);

		const exitCode = await runServiceLoop(manager, "a:running", {
			pidFilePath: pidPath,
			pid: 42,
			signal: controller.signal,
		});

		expect(exitCode).toBe(0);
		// PID file should be cleaned up
		expect(existsSync(pidPath)).toBe(false);
		// At least one heartbeat should have been sent
		expect(mockFetch).toHaveBeenCalled();

		// Verify heartbeat body
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/agents/heartbeat");
		expect(init.method).toBe("POST");
		const body = JSON.parse(init.body as string);
		expect(body.source_key).toBe("550e8400-e29b-41d4-a716-446655440000");
		expect(body.agents).toEqual([{ match_key: "a", status: "running" }]);
	});

	test("returns 0 and cleans PID for pre-aborted signal", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const pidPath = join(tempDir, "test.pid");

		const controller = new AbortController();
		controller.abort(); // Already aborted before call

		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceLoop(manager, "a:running", {
			pidFilePath: pidPath,
			pid: 42,
			signal: controller.signal,
		});

		expect(exitCode).toBe(0);
		expect(existsSync(pidPath)).toBe(false); // PID cleaned up
		expect(mockFetch).not.toHaveBeenCalled(); // No heartbeat sent
	});

	test("cleans PID when abort fires during initial heartbeat", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const pidPath = join(tempDir, "test.pid");

		const controller = new AbortController();

		// Simulate slow heartbeat — abort during it
		mockFetch.mockImplementation(
			() =>
				new Promise((resolve) => {
					// Abort while heartbeat is in-flight
					setTimeout(() => controller.abort(), 10);
					setTimeout(
						() =>
							resolve(
								new Response(JSON.stringify({ updated: 1, created: 0, missing: 0 }), {
									status: 200,
								}),
							),
						30,
					);
				}),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceLoop(manager, "a:running", {
			pidFilePath: pidPath,
			pid: 42,
			signal: controller.signal,
		});

		expect(exitCode).toBe(0);
		expect(existsSync(pidPath)).toBe(false); // PID cleaned up via finally
	});
});

// --- runServiceStatus ---

describe("runServiceStatus", () => {
	test("reports no PID file", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceStatus(manager, {
			pidFilePath: join(tempDir, "nonexistent.pid"),
		});
		expect(exitCode).toBe(0);
	});

	test("reports running process", async () => {
		const pidPath = join(tempDir, "test.pid");
		writePidFile(pidPath, process.pid);

		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceStatus(manager, { pidFilePath: pidPath });
		expect(exitCode).toBe(0);
	});

	test("reports stale PID", async () => {
		const pidPath = join(tempDir, "test.pid");
		writePidFile(pidPath, 999999999);

		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceStatus(manager, { pidFilePath: pidPath });
		expect(exitCode).toBe(0);
	});
});

// --- escapeXml ---

describe("escapeXml", () => {
	test("escapes XML special characters", () => {
		expect(escapeXml("a&b<c>d\"e'f")).toBe("a&amp;b&lt;c&gt;d&quot;e&apos;f");
	});

	test("leaves safe strings unchanged", () => {
		expect(escapeXml("hello:running")).toBe("hello:running");
	});
});

// --- generatePlist ---

describe("generatePlist", () => {
	test("generates valid plist XML", () => {
		const plist = generatePlist({
			label: "ai.hexly.bat",
			batPath: "/usr/local/bin/bat",
			agents: "a:running",
			intervalSec: 60,
			logPath: "/tmp/bat.log",
		});

		expect(plist).toContain("<string>ai.hexly.bat</string>");
		expect(plist).toContain("<string>/usr/local/bin/bat</string>");
		expect(plist).toContain("<string>service</string>");
		expect(plist).toContain("<string>run</string>");
		expect(plist).toContain("<string>a:running</string>");
		expect(plist).toContain("<integer>60</integer>");
		expect(plist).toContain("<string>/tmp/bat.log</string>");
		expect(plist).toContain("<true/>");
	});

	test("escapes XML special characters in agents", () => {
		const plist = generatePlist({
			label: "ai.hexly.bat",
			batPath: "/bin/bat",
			agents: "a&b:running",
			intervalSec: 60,
			logPath: "/tmp/bat.log",
		});

		expect(plist).toContain("<string>a&amp;b:running</string>");
		expect(plist).not.toContain("<string>a&b:running</string>");
	});
});

// --- runServiceInstall ---

describe("runServiceInstall", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceInstall(manager, "a:running");
		expect(exitCode).toBe(1);
	});

	test("installs plist file", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const plistDir = join(tempDir, "LaunchAgents");

		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceInstall(manager, "a:running", {
			plistDir,
			batPath: "/usr/local/bin/bat",
		});
		expect(exitCode).toBe(0);

		const plistPath = join(plistDir, "ai.hexly.bat.plist");
		expect(existsSync(plistPath)).toBe(true);

		const content = readFileSync(plistPath, "utf-8");
		expect(content).toContain("<string>/usr/local/bin/bat</string>");
		expect(content).toContain("<string>a:running</string>");
	});

	test("rejects when plist already exists", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const plistDir = join(tempDir, "LaunchAgents");

		const manager = createConfigManager(tempDir);
		// Install first
		await runServiceInstall(manager, "a:running", { plistDir, batPath: "/bin/bat" });

		// Second install should fail
		const exitCode = await runServiceInstall(manager, "a:running", {
			plistDir,
			batPath: "/bin/bat",
		});
		expect(exitCode).toBe(1);
	});

	test("rejects invalid agentsArg without writing plist", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const plistDir = join(tempDir, "LaunchAgents");

		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceInstall(manager, "a:unknown", {
			plistDir,
			batPath: "/bin/bat",
		});
		expect(exitCode).toBe(1);

		const plistPath = join(plistDir, "ai.hexly.bat.plist");
		expect(existsSync(plistPath)).toBe(false);
	});
});

// --- runServiceUninstall ---

describe("runServiceUninstall", () => {
	test("returns 1 when no plist", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runServiceUninstall(manager, {
			plistDir: join(tempDir, "LaunchAgents"),
			runCommand: (_cmd, _args) => {
				/* noop */
			},
		});
		expect(exitCode).toBe(1);
	});

	test("passes plistPath as separate argv (no shell interpolation)", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const plistDir = join(tempDir, "LaunchAgents");

		const manager = createConfigManager(tempDir);
		// Install first
		await runServiceInstall(manager, "a:running", { plistDir, batPath: "/bin/bat" });

		// Track argv
		const calls: { cmd: string; args: string[] }[] = [];
		const trackingRunner: CommandRunner = (cmd: string, args: string[]) => {
			calls.push({ cmd, args });
		};

		// Uninstall
		const exitCode = await runServiceUninstall(manager, { plistDir, runCommand: trackingRunner });
		expect(exitCode).toBe(0);

		// Verify argv-based call
		expect(calls).toHaveLength(1);
		expect(calls[0].cmd).toBe("launchctl");
		expect(calls[0].args[0]).toBe("bootout");
		expect(calls[0].args[1]).toMatch(/^gui\/\d+$/);
		// plistPath is a separate arg, not concatenated into a shell string
		expect(calls[0].args[2]).toBe(join(plistDir, "ai.hexly.bat.plist"));

		// Verify plist removed
		const plistPath = join(plistDir, "ai.hexly.bat.plist");
		expect(existsSync(plistPath)).toBe(false);
	});

	test("plistDir with spaces is passed as single argv element", async () => {
		const spacedDir = join(tempDir, "path with spaces");
		const plistDir = join(spacedDir, "LaunchAgents");

		writeConfig(tempDir, VALID_CONFIG);
		const manager = createConfigManager(tempDir);
		await runServiceInstall(manager, "a:running", { plistDir, batPath: "/bin/bat" });

		const calls: { cmd: string; args: string[] }[] = [];
		const trackingRunner: CommandRunner = (cmd: string, args: string[]) => {
			calls.push({ cmd, args });
		};

		const exitCode = await runServiceUninstall(manager, { plistDir, runCommand: trackingRunner });
		expect(exitCode).toBe(0);

		// plistPath with spaces stays as one arg, not split by shell
		expect(calls[0].args[2]).toBe(join(plistDir, "ai.hexly.bat.plist"));
		expect(calls[0].args[2]).toContain("path with spaces");
	});

	test("tolerates bootout 'not loaded' error and still removes plist", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const plistDir = join(tempDir, "LaunchAgents");

		const manager = createConfigManager(tempDir);
		await runServiceInstall(manager, "a:running", { plistDir, batPath: "/bin/bat" });

		// Simulate "not loaded" error
		const notLoadedRunner: CommandRunner = (_cmd, _args) => {
			throw new Error("Could not find specified service");
		};

		const exitCode = await runServiceUninstall(manager, {
			plistDir,
			runCommand: notLoadedRunner,
		});
		expect(exitCode).toBe(0);

		const plistPath = join(plistDir, "ai.hexly.bat.plist");
		expect(existsSync(plistPath)).toBe(false);
	});

	test("warns on unexpected bootout error and still removes plist", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const plistDir = join(tempDir, "LaunchAgents");

		const manager = createConfigManager(tempDir);
		await runServiceInstall(manager, "a:running", {
			plistDir,
			batPath: "/bin/bat",
			runCommand: (_cmd, _args) => {
				/* noop */
			},
		});

		// Simulate unexpected error
		const failRunner: CommandRunner = (_cmd, _args) => {
			throw new Error("Permission denied");
		};

		const exitCode = await runServiceUninstall(manager, { plistDir, runCommand: failRunner });
		expect(exitCode).toBe(0);

		const plistPath = join(plistDir, "ai.hexly.bat.plist");
		expect(existsSync(plistPath)).toBe(false);
	});
});

// --- remaining service branches ---

describe("runServiceLoop — config, parse and signal branches", () => {
	test("rejects config without credentials", async () => {
		const manager = createConfigManager(tempDir);
		manager.write({ worker_url: "https://bat-ingest.worker.hexly.ai" } as BatCliConfig);

		const exitCode = await runServiceLoop(manager, "a:running");
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects an entry with an empty match key", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const exitCode = await runServiceLoop(createConfigManager(tempDir), ":running");
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("ignores a repeated abort notification", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const pidPath = join(tempDir, "repeated.pid");
		mockFetch.mockImplementation(() =>
			Promise.resolve(
				new Response(JSON.stringify({ updated: 1, created: 0, missing: 0 }), { status: 200 }),
			),
		);

		let notify: (() => void) | undefined;
		const signal = {
			aborted: false,
			addEventListener: (_event: string, handler: () => void) => {
				notify = handler;
			},
		} as unknown as AbortSignal;

		const loop = runServiceLoop(createConfigManager(tempDir), "a:running", {
			pidFilePath: pidPath,
			pid: 44,
			signal,
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		notify?.();
		notify?.();

		await expect(loop).resolves.toBe(0);
		expect(existsSync(pidPath)).toBe(false);
	});

	test("sends interval heartbeats until abort", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const pidPath = join(tempDir, "interval.pid");
		mockFetch.mockImplementation(() =>
			Promise.resolve(
				new Response(JSON.stringify({ updated: 1, created: 0, missing: 0 }), { status: 200 }),
			),
		);

		vi.useFakeTimers();
		try {
			const controller = new AbortController();
			const loop = runServiceLoop(createConfigManager(tempDir), "a:running", {
				pidFilePath: pidPath,
				pid: 45,
				signal: controller.signal,
			});

			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(1000);
			controller.abort();
			await loop;
		} finally {
			vi.useRealTimers();
		}

		expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(existsSync(pidPath)).toBe(false);
	});

	test("production mode stops on SIGINT", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const pidPath = join(tempDir, "signal.pid");
		mockFetch.mockImplementation(() =>
			Promise.resolve(
				new Response(JSON.stringify({ updated: 1, created: 0, missing: 0 }), { status: 200 }),
			),
		);

		vi.useFakeTimers();
		try {
			const loop = runServiceLoop(createConfigManager(tempDir), "a:running", {
				pidFilePath: pidPath,
				pid: 46,
			});

			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(1000);
			process.emit("SIGINT");
			await loop;
		} finally {
			vi.useRealTimers();
		}

		expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
		expect(existsSync(pidPath)).toBe(false);
	});
});

describe("runServiceUninstall — default runner", () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	function installFakeLaunchctl(body: string): void {
		const binDir = join(tempDir, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(binDir, "launchctl"), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
		vi.stubEnv("PATH", `${binDir}:${process.env.PATH ?? ""}`);
	}

	test("warns with stderr when launchctl fails", async () => {
		installFakeLaunchctl("echo 'boom' >&2\nexit 1");
		const plistDir = join(tempDir, "LaunchAgents");
		mkdirSync(plistDir, { recursive: true });
		const plistPath = join(plistDir, "ai.hexly.bat.plist");
		writeFileSync(plistPath, "plist");

		const exitCode = await runServiceUninstall(createConfigManager(tempDir), { plistDir });

		expect(exitCode).toBe(0);
		expect(existsSync(plistPath)).toBe(false);
	});

	test("warns with exit code when launchctl writes no stderr", async () => {
		installFakeLaunchctl("exit 3");
		const plistDir = join(tempDir, "LaunchAgents");
		mkdirSync(plistDir, { recursive: true });
		writeFileSync(join(plistDir, "ai.hexly.bat.plist"), "plist");

		const exitCode = await runServiceUninstall(createConfigManager(tempDir), { plistDir });

		expect(exitCode).toBe(0);
	});

	test("returns 1 when the plist cannot be removed", async () => {
		const plistDir = join(tempDir, "LaunchAgents");
		const plistPath = join(plistDir, "ai.hexly.bat.plist");
		mkdirSync(plistPath, { recursive: true });

		const exitCode = await runServiceUninstall(createConfigManager(tempDir), {
			plistDir,
			runCommand: () => undefined,
		});

		expect(exitCode).toBe(1);
	});
});

describe("runServiceInstall — config branch", () => {
	test("rejects config without credentials", async () => {
		const manager = createConfigManager(tempDir);
		manager.write({ worker_url: "https://bat-ingest.worker.hexly.ai" } as BatCliConfig);

		const exitCode = await runServiceInstall(manager, "a:running", {
			plistDir: join(tempDir, "LaunchAgents"),
		});
		expect(exitCode).toBe(1);
	});
});

describe("readPidFile — unreadable path", () => {
	test("returns null when the path cannot be read", () => {
		expect(readPidFile(tempDir)).toBeNull();
	});
});

// --- remaining branch coverage ---

describe("sendHeartbeat — unexpected API error", () => {
	test("returns false on a server error", async () => {
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "internal error" }), { status: 500 }),
		);

		const client = new (await import("../../lib/http.js")).HttpClient(
			"https://bat-ingest.worker.hexly.ai",
			"token",
		);

		const sent = await sendHeartbeat(client, {
			source_key: "550e8400-e29b-41d4-a716-446655440000",
			agents: [{ match_key: "a", status: "running" }],
		});
		expect(sent).toBe(false);
	});
});

describe("runServiceInstall — plist branches", () => {
	test("returns 1 when the plist already exists", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const plistDir = join(tempDir, "LaunchAgents");
		mkdirSync(plistDir, { recursive: true });
		writeFileSync(join(plistDir, "ai.hexly.bat.plist"), "plist");

		const exitCode = await runServiceInstall(createConfigManager(tempDir), "a:running", {
			plistDir,
			batPath: "/bin/bat",
		});
		expect(exitCode).toBe(1);
	});

	test("creates the launch agents directory and falls back to the bat bin name", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const plistDir = join(tempDir, "nested", "LaunchAgents");
		const argvPath = process.argv[1];
		process.argv[1] = undefined as unknown as string;

		try {
			const exitCode = await runServiceInstall(createConfigManager(tempDir), "a:running", {
				plistDir,
			});
			expect(exitCode).toBe(0);
		} finally {
			process.argv[1] = argvPath;
		}

		const plist = readFileSync(join(plistDir, "ai.hexly.bat.plist"), "utf-8");
		expect(plist).toContain("<string>bat</string>");
	});
});

describe("runServiceUninstall — launchctl success", () => {
	test("unloads and removes the plist", async () => {
		const binDir = join(tempDir, "bin");
		mkdirSync(binDir, { recursive: true });
		writeFileSync(join(binDir, "launchctl"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
		vi.stubEnv("PATH", `${binDir}:${process.env.PATH ?? ""}`);
		const plistDir = join(tempDir, "LaunchAgents");
		mkdirSync(plistDir, { recursive: true });
		const plistPath = join(plistDir, "ai.hexly.bat.plist");
		writeFileSync(plistPath, "plist");

		try {
			const exitCode = await runServiceUninstall(createConfigManager(tempDir), { plistDir });
			expect(exitCode).toBe(0);
			expect(existsSync(plistPath)).toBe(false);
		} finally {
			vi.unstubAllEnvs();
		}
	});
});

describe("runServiceInstall — default launch agents directory", () => {
	test("installs into the per-user launch agents directory", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const launchAgents = join(tempDir, "Library", "LaunchAgents");
		mkdirSync(launchAgents, { recursive: true });
		vi.stubEnv("HOME", tempDir);
		vi.stubEnv("USERPROFILE", tempDir);

		try {
			const exitCode = await runServiceInstall(createConfigManager(tempDir), "a:running", {
				batPath: "/bin/bat",
			});
			expect(exitCode).toBe(0);
		} finally {
			vi.unstubAllEnvs();
		}

		expect(existsSync(join(launchAgents, "ai.hexly.bat.plist"))).toBe(true);
	});
});
