// Tests for the workstation command surface.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { CRON_BEGIN, CRON_END } from "../../workstation/scheduler/cron.js";
import type { CommandExecutor, ExecOptions, ExecResult } from "../../workstation/scheduler/exec.js";
import type { ScheduleContext } from "../../workstation/scheduler/plan.js";
import {
	getWorkstationPaths,
	readCredential,
	type WorkstationCredential,
	writeCredential,
	writeScheduleRecord,
} from "../../workstation/store.js";
import workstation from "./index.js";
import loginCommand, { runLoginCommand, storeDepsFor } from "./login.js";
import logoutCommand, { runLogoutCommand } from "./logout.js";
import probeCommand, { runProbeCommand } from "./probe.js";
import setupCommand, { readScheduleStatus, runSetupCommand } from "./setup.js";
import statusCommand, { runStatusCommand } from "./status.js";

const TOKEN = `batw_${"a".repeat(43)}`;
const CREDENTIAL: WorkstationCredential = {
	workstation_id: "771e8400-e29b-41d4-a716-446655440000",
	worker_url: "https://bat-ingest.worker.hexly.ai",
	token: TOKEN,
};

const runWorkstationLogin = vi.fn();

vi.mock("../../workstation/login.js", () => ({
	runWorkstationLogin: (...args: unknown[]) => runWorkstationLogin(...args),
	performWorkstationLogin: vi.fn(),
	generatePkce: vi.fn(),
}));

let home: string;

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

function fakeExec(handler?: (command: string, args: string[]) => ExecResult | undefined): {
	exec: CommandExecutor;
	calls: { command: string; args: string[]; options: ExecOptions }[];
} {
	const calls: { command: string; args: string[]; options: ExecOptions }[] = [];
	const exec: CommandExecutor = vi.fn(async (command, args, options) => {
		calls.push({ command, args, options });
		return handler?.(command, args) ?? ok();
	});
	return { exec, calls };
}

function context(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
	return {
		home,
		nodePath: "/usr/local/bin/node",
		entryPath: "/opt/bat/dist/bat.js",
		logPath: join(home, "probe.log"),
		platform: "freebsd",
		uid: 501,
		intervalSeconds: 600,
		...overrides,
	};
}

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bat-ws-cmd-"));
	process.exitCode = undefined;
	runWorkstationLogin.mockReset();
});

afterEach(() => {
	process.exitCode = undefined;
	rmSync(home, { recursive: true, force: true });
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("command group", () => {
	test("registers every workstation verb", () => {
		expect(Object.keys(workstation.subCommands ?? {})).toStrictEqual([
			"login",
			"setup",
			"probe",
			"status",
			"logout",
		]);
	});
});

describe("login command", () => {
	test("passes the loopback origin and succeeds", async () => {
		runWorkstationLogin.mockResolvedValue({ exitCode: 0, report: { workstationId: "w" } });

		const exitCode = await runLoginCommand({ loopbackUrl: "http://127.0.0.1:8787" });

		expect(exitCode).toBe(0);
		const deps = runWorkstationLogin.mock.calls[0]?.[0] as {
			origins: { dashboard: string; machine: string };
			paths: { credentialPath: string };
		};
		expect(deps.origins).toStrictEqual({
			dashboard: "http://127.0.0.1:8787",
			machine: "http://127.0.0.1:8787",
		});
		expect(deps.paths.credentialPath).toBe(getWorkstationPaths().credentialPath);
	});

	test("returns the failure exit code", async () => {
		runWorkstationLogin.mockResolvedValue({ exitCode: 1 });
		await expect(runLoginCommand()).resolves.toBe(1);
	});

	test("rejects an untrusted loopback origin without starting login", async () => {
		await expect(runLoginCommand({ loopbackUrl: "https://bat.hexly.ai" })).resolves.toBe(1);
		expect(runWorkstationLogin).not.toHaveBeenCalled();
	});

	test("only restricts a Windows ACL on Windows", async () => {
		expect(storeDepsFor("darwin")).toBeUndefined();
		vi.stubEnv("USERNAME", "tester");
		const exec = fakeExec().exec;
		const store = storeDepsFor("win32", exec);
		expect(store?.acl).toBeTypeOf("function");
		await store?.acl?.("C:\\cfg");
		expect(exec).toHaveBeenCalledWith(
			"icacls",
			["C:\\cfg", "/inheritance:r", "/grant:r", "tester:F", "/T"],
			{},
		);
	});

	test("wrapper sets the exit code", async () => {
		runWorkstationLogin.mockResolvedValue({ exitCode: 0, report: { workstationId: "w" } });
		vi.stubEnv("HOME", home);
		vi.stubEnv("USERPROFILE", home);
		const command = loginCommand as unknown as {
			run?: (context: { args: Record<string, unknown> }) => Promise<void>;
		};
		await command.run?.({ args: {} });
		expect(process.exitCode).toBe(0);
	});

	test("wrapper forwards the loopback origin", async () => {
		runWorkstationLogin.mockResolvedValue({ exitCode: 0, report: { workstationId: "w" } });
		vi.stubEnv("HOME", home);
		vi.stubEnv("USERPROFILE", home);
		const command = loginCommand as unknown as {
			run?: (context: { args: Record<string, unknown> }) => Promise<void>;
		};
		await command.run?.({ args: { "loopback-url": "http://127.0.0.1:8787" } });
		expect(process.exitCode).toBe(0);
	});
});

describe("setup command", () => {
	test("requires a workstation login before installing", async () => {
		const { exec } = fakeExec();
		const exitCode = await runSetupCommand({
			exec,
			context: context({ platform: "darwin" }),
			paths: getWorkstationPaths(home),
		});
		expect(exitCode).toBe(1);
		expect(exec).not.toHaveBeenCalled();
	});

	test("installs an explicit cron schedule and records it", async () => {
		await writeCredential(getWorkstationPaths(home), CREDENTIAL);
		const { exec, calls } = fakeExec();
		const paths = getWorkstationPaths(home);

		const exitCode = await runSetupCommand({
			backend: "cron",
			exec,
			context: context(),
			paths,
			now: () => 1_700_000_000_000,
		});

		expect(exitCode).toBe(0);
		const written = calls.find((call) => call.args[0] === "-");
		expect(written?.options.input).toContain(CRON_BEGIN);
		expect(written?.options.input).toContain("/opt/bat/dist/bat.js");
	});

	test("removes the recorded schedule", async () => {
		const paths = getWorkstationPaths(home);
		writeScheduleRecord(paths, { backend: "cron", installed_at: 1 });
		const { exec } = fakeExec((_command, args) =>
			args[0] === "-l" ? ok({ stdout: `${CRON_BEGIN}\nx\n${CRON_END}\n` }) : ok(),
		);

		const exitCode = await runSetupCommand({ remove: true, exec, context: context(), paths });
		expect(exitCode).toBe(0);
		expect(() => readScheduleStatus(paths, context(), exec)).not.toThrow();
		await expect(readScheduleStatus(paths, context(), exec)).resolves.toBeNull();
	});

	test("removes installed files and reports them", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		const install = fakeExec();
		await runSetupCommand({
			exec: install.exec,
			context: context({ platform: "darwin" }),
			paths,
		});
		const removal = fakeExec();
		const exitCode = await runSetupCommand({
			remove: true,
			exec: removal.exec,
			context: context({ platform: "darwin" }),
			paths,
		});
		expect(exitCode).toBe(0);
	});

	test("warns when removing a schedule with no files left", async () => {
		const paths = getWorkstationPaths(home);
		writeScheduleRecord(paths, { backend: "launchd", installed_at: 1 });
		const { exec } = fakeExec();
		await expect(
			runSetupCommand({ remove: true, exec, context: context({ platform: "darwin" }), paths }),
		).resolves.toBe(0);
	});

	test("is a no-op when removing without a record", async () => {
		const { exec } = fakeExec();
		await expect(
			runSetupCommand({ remove: true, exec, context: context(), paths: getWorkstationPaths(home) }),
		).resolves.toBe(0);
	});

	test("installs the native backend and reports its files", async () => {
		await writeCredential(getWorkstationPaths(home), CREDENTIAL);
		const { exec, calls } = fakeExec();
		const exitCode = await runSetupCommand({
			exec,
			context: context({ platform: "darwin" }),
			paths: getWorkstationPaths(home),
		});
		expect(exitCode).toBe(0);
		expect(calls[1]?.args[0]).toBe("bootstrap");
	});

	test("reuses the recorded backend when none is requested", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		writeScheduleRecord(paths, { backend: "cron", installed_at: 1 });
		const { exec } = fakeExec((_command, args) => (args[0] === "-l" ? ok({ stdout: "" }) : ok()));
		const exitCode = await runSetupCommand({ exec, context: context(), paths });
		expect(exitCode).toBe(0);
	});

	test("installs the Windows task backend", async () => {
		await writeCredential(getWorkstationPaths(home), CREDENTIAL);
		const { exec } = fakeExec((command, args) =>
			command === "powershell.exe" && (args.at(-1) ?? "").includes("Schedule.Service")
				? ok({
						stdout: JSON.stringify({
							exists: false,
							xml: null,
							notFound: true,
							error: null,
							hresult: null,
						}),
					})
				: ok(),
		);
		const exitCode = await runSetupCommand({
			backend: "windows",
			exec,
			context: context({ platform: "win32" }),
			paths: getWorkstationPaths(home),
		});
		expect(exitCode).toBe(0);
	});

	test("rejects a backend switch without removing the old schedule", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		writeScheduleRecord(paths, { backend: "launchd", installed_at: 1 });
		const { exec } = fakeExec();

		const exitCode = await runSetupCommand({
			backend: "cron",
			exec,
			context: context({ platform: "darwin" }),
			paths,
		});
		expect(exitCode).toBe(1);
		expect(exec).not.toHaveBeenCalled();
	});

	test("returns 1 when installation fails", async () => {
		await writeCredential(getWorkstationPaths(home), CREDENTIAL);
		const { exec } = fakeExec(() => ok({ code: 1, stderr: "denied" }));
		const exitCode = await runSetupCommand({
			backend: "cron",
			exec,
			context: context(),
			paths: getWorkstationPaths(home),
		});
		expect(exitCode).toBe(1);
	});

	test("reports an installed schedule status", async () => {
		const paths = getWorkstationPaths(home);
		writeScheduleRecord(paths, { backend: "cron", installed_at: 1 });
		const { exec } = fakeExec(() => ok({ stdout: `${CRON_BEGIN}\nx\n${CRON_END}` }));

		await expect(readScheduleStatus(paths, context(), exec)).resolves.toStrictEqual({
			installed: true,
			backend: "cron",
			files: [],
		});
	});

	test("wrapper rejects an unavailable backend without touching the system", async () => {
		vi.stubEnv("HOME", home);
		vi.stubEnv("USERPROFILE", home);
		const command = setupCommand as unknown as {
			run?: (context: { args: Record<string, unknown> }) => Promise<void>;
		};
		await command.run?.({ args: { backend: "windows" } });
		expect(process.exitCode).toBe(1);
	});

	test("wrapper removes without a record", async () => {
		vi.stubEnv("HOME", home);
		vi.stubEnv("USERPROFILE", home);
		const command = setupCommand as unknown as {
			run?: (context: { args: Record<string, unknown> }) => Promise<void>;
		};
		await command.run?.({ args: { remove: true } });
		expect(process.exitCode).toBe(0);
	});
});

describe("probe command", () => {
	test("fails cleanly without a credential", async () => {
		await expect(runProbeCommand({ paths: getWorkstationPaths(home) })).resolves.toBe(1);
	});

	test("returns 1 when the probe cannot start", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.credentialPath, "not json");
		await expect(runProbeCommand({ paths })).resolves.toBe(1);
	});

	test("wrapper sets the exit code", async () => {
		vi.stubEnv("HOME", home);
		vi.stubEnv("USERPROFILE", home);
		const command = probeCommand as unknown as {
			run?: () => Promise<void>;
		};
		await command.run?.();
		expect(process.exitCode).toBe(1);
	});
});

describe("status command", () => {
	test("reports an empty profile", async () => {
		const { exec } = fakeExec();
		await expect(
			runStatusCommand({ paths: getWorkstationPaths(home), context: context(), exec }),
		).resolves.toBe(0);
	});

	test("reports a linked workstation and installed schedule", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		writeScheduleRecord(paths, { backend: "cron", installed_at: 1 });
		const { exec } = fakeExec(() => ok({ stdout: `${CRON_BEGIN}\nx\n${CRON_END}` }));

		await expect(runStatusCommand({ paths, context: context(), exec })).resolves.toBe(0);
	});

	test("warns about a leftover probe lock", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.lockPath, "{}");

		await expect(
			runStatusCommand({ paths, context: context(), exec: fakeExec().exec }),
		).resolves.toBe(0);
	});

	test("warns about a missing registration", async () => {
		const paths = getWorkstationPaths(home);
		writeScheduleRecord(paths, { backend: "launchd", installed_at: 1 });
		const { exec } = fakeExec();

		await expect(runStatusCommand({ paths, context: context(), exec })).resolves.toBe(0);
	});

	test("returns 1 on a corrupt profile", async () => {
		const paths = getWorkstationPaths(home);
		const { mkdirSync, writeFileSync } = await import("node:fs");
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.installationPath, "[]");

		await expect(
			runStatusCommand({ paths, context: context(), exec: fakeExec().exec }),
		).resolves.toBe(1);
	});

	test("wrapper sets the exit code", async () => {
		vi.stubEnv("HOME", home);
		vi.stubEnv("USERPROFILE", home);
		const command = statusCommand as unknown as {
			run?: () => Promise<void>;
		};
		await command.run?.();
		expect(process.exitCode).toBe(0);
	});
});

describe("logout command", () => {
	test("revokes the key before removing the credential", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		const revoke = vi.fn(async () => {
			expect(existsSync(paths.credentialPath)).toBe(true);
		});

		await expect(runLogoutCommand({ paths, revoke })).resolves.toBe(0);
		expect(revoke).toHaveBeenCalledWith(CREDENTIAL.worker_url, CREDENTIAL.token);
		expect(existsSync(paths.credentialPath)).toBe(false);
		expect(readCredential(paths)).toBeNull();
	});

	test("keeps the credential when revocation fails", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		const revoke = vi.fn().mockRejectedValue(new Error("network down"));

		await expect(runLogoutCommand({ paths, revoke })).resolves.toBe(1);
		expect(existsSync(paths.credentialPath)).toBe(true);
	});

	test("clears the credential when the server says the key is already invalid", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		const revoke = vi
			.fn()
			.mockRejectedValue(new (await import("../../lib/http.js")).AuthError(401, "invalid key"));

		await expect(runLogoutCommand({ paths, revoke })).resolves.toBe(0);
		expect(existsSync(paths.credentialPath)).toBe(false);
	});

	test("keeps the credential on a network failure", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		const revoke = vi
			.fn()
			.mockRejectedValue(new (await import("../../lib/http.js")).NetworkError("offline"));

		await expect(runLogoutCommand({ paths, revoke })).resolves.toBe(1);
		expect(existsSync(paths.credentialPath)).toBe(true);
	});

	test("keeps the credential when the server errors", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		const revoke = vi
			.fn()
			.mockRejectedValue(new (await import("../../lib/http.js")).ApiError(500, "boom"));

		await expect(runLogoutCommand({ paths, revoke })).resolves.toBe(1);
		expect(existsSync(paths.credentialPath)).toBe(true);
	});

	test("reports that nothing is stored without claiming a revoke", async () => {
		const paths = getWorkstationPaths(home);
		const revoke = vi.fn();
		await expect(runLogoutCommand({ paths, revoke })).resolves.toBe(0);
		expect(revoke).not.toHaveBeenCalled();
	});

	test("warns when a schedule remains", async () => {
		const paths = getWorkstationPaths(home);
		await writeCredential(paths, CREDENTIAL);
		writeScheduleRecord(paths, { backend: "cron", installed_at: 1 });
		await expect(runLogoutCommand({ paths, revoke: vi.fn() })).resolves.toBe(0);
	});

	test("returns 1 when the credential cannot be read", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeFileSync(paths.credentialPath, "not json");
		await expect(runLogoutCommand({ paths, revoke: vi.fn() })).resolves.toBe(1);
	});

	test("wrapper sets the exit code", async () => {
		vi.stubEnv("HOME", home);
		vi.stubEnv("USERPROFILE", home);
		const command = logoutCommand as unknown as {
			run?: () => Promise<void>;
		};
		await command.run?.();
		expect(process.exitCode).toBe(0);
	});
});
