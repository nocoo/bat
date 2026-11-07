import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { buildScheduleContext } from "../workstation/scheduler/plan.js";
import { getWorkstationPaths, writeCredential, writeScheduleRecord } from "../workstation/store.js";
import { runDoctorCommand } from "./doctor.js";

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bat-doctor-cmd-"));
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

function offlineDeps() {
	const paths = getWorkstationPaths(home);
	return {
		paths,
		version: "3.2.0",
		nodeVersion: "v22.0.0",
		offline: true,
		fetchImpl: (async () => {
			throw new Error("offline");
		}) as unknown as typeof fetch,
		exec: async () => ({ code: 1, stdout: "", stderr: "" }),
	};
}

describe("runDoctorCommand", () => {
	test("offline mode warns instead of guessing", async () => {
		const exit = await runDoctorCommand({ ...offlineDeps(), json: true });
		expect(exit).toBe(0);
	});

	test("renders the human summary with warnings and failures", async () => {
		const deps = offlineDeps();
		const warned = await runDoctorCommand({ ...deps, nodeVersion: "v22.0.0" });
		expect(warned).toBe(0);
		const failed = await runDoctorCommand({ ...deps, nodeVersion: "v16.0.0" });
		expect(failed).toBe(1);
	});

	test("tolerates a schedule inspection that throws", async () => {
		const deps = offlineDeps();
		mkdirSync(deps.paths.dir, { recursive: true });
		writeScheduleRecord(deps.paths, {
			backend: "launchd",
			installed_at: Math.floor(Date.now() / 1000),
		});
		const exit = await runDoctorCommand({
			...deps,
			context: { ...buildScheduleContext(), home, logPath: deps.paths.logPath },
			exec: async () => {
				throw new Error("launchctl missing");
			},
			json: true,
		});
		expect(exit).toBe(1);
	});

	test("an old runtime fails the command", async () => {
		const exit = await runDoctorCommand({
			...offlineDeps(),
			nodeVersion: "v18.0.0",
			json: true,
		});
		expect(exit).toBe(1);
	});

	test("reads the probe log age and reports a stale schedule", async () => {
		const deps = offlineDeps();
		mkdirSync(deps.paths.dir, { recursive: true });
		writeFileSync(deps.paths.logPath, "probe\n");
		const exit = await runDoctorCommand({
			...deps,
			now: () => Math.floor(Date.now() / 1000) + 7200,
			json: true,
		});
		expect(exit).toBe(0);
	});

	test("accepts injected schedule inspection", async () => {
		const deps = offlineDeps();
		mkdirSync(deps.paths.dir, { recursive: true });
		writeFileSync(
			deps.paths.schedulePath,
			JSON.stringify({ backend: "cron", installed_at: Math.floor(Date.now() / 1000) }),
		);
		const exec = vi.fn(async () => ({
			code: 0,
			stdout:
				"# BEGIN bat workstation (managed by @nocoo/bat)\n*/10 * * * * x\n# END bat workstation (managed by @nocoo/bat)\n",
			stderr: "",
		}));
		const exit = await runDoctorCommand({
			...deps,
			context: { ...buildScheduleContext(), home, logPath: deps.paths.logPath },
			exec,
			json: true,
		});
		expect(exit).toBe(0);
		expect(exec).toHaveBeenCalled();
	});
});

describe("runDoctorCommand with an assets profile", () => {
	test("verifies a present token and reports a rejected one", async () => {
		const manager = {
			exists: () => true,
			configPath: join(home, "config.json"),
			read: () => ({
				worker_url: "https://bat-ingest.worker.hexly.ai",
				api_key: "key",
				source_key: "source",
			}),
		} as never;
		const deps = { ...offlineDeps(), configManager: manager, offline: false };

		const fetchOk = (async (input: string | URL) => {
			const url = String(input);
			if (url.endsWith("/api/live")) return new Response("{}", { status: 200 });
			if (url.includes("registry.npmjs.org")) {
				return new Response(JSON.stringify({ "dist-tags": { latest: "3.2.0" } }), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}) as unknown as typeof fetch;
		const passed = await runDoctorCommand({ ...deps, fetchImpl: fetchOk, json: true });
		expect(passed).toBe(0);

		const fetch401 = (async () =>
			new Response(JSON.stringify({ error: "unauthorized" }), {
				status: 401,
			})) as unknown as typeof fetch;
		const failed = await runDoctorCommand({ ...deps, fetchImpl: fetch401, json: true });
		expect(failed).toBe(1);
	});

	test("an unexpected token-check failure is a network stop, not a rejection", async () => {
		const manager = {
			exists: () => true,
			configPath: join(home, "config.json"),
			read: () => ({
				worker_url: "https://bat-ingest.worker.hexly.ai",
				api_key: "key",
				source_key: "source",
			}),
		} as never;
		const fetchImpl = (async (input: string | URL) => {
			const url = String(input);
			if (url.includes("/api/agents")) {
				throw new TypeError("parse exploded");
			}
			if (url.includes("registry.npmjs.org")) {
				return new Response(JSON.stringify({ "dist-tags": { latest: "3.2.0" } }), { status: 200 });
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}) as unknown as typeof fetch;
		const exit = await runDoctorCommand({
			...offlineDeps(),
			configManager: manager,
			offline: false,
			fetchImpl,
			json: true,
		});
		expect(exit).toBe(0);
	});

	test("treats an unreadable profile file as missing", async () => {
		const manager = {
			exists: () => true,
			configPath: join(home, "config.json"),
			read: () => {
				throw new Error("corrupt");
			},
		} as never;
		const exit = await runDoctorCommand({
			...offlineDeps(),
			configManager: manager,
			json: true,
		});
		expect(exit).toBe(0);
	});
});

describe("runDoctorCommand healthy machine", () => {
	test("reports all checks passed", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeCredential(paths, {
			workstation_id: "22aace94-25b4-46f4-8813-62c869ef1490",
			token: `batw_${"a".repeat(43)}`,
			worker_url: "https://bat-ingest.worker.hexly.ai",
		} as never);
		writeScheduleRecord(paths, { backend: "cron", installed_at: Math.floor(Date.now() / 1000) });
		writeFileSync(paths.installationPath, JSON.stringify({ installation_id: randomUUID() }));
		writeFileSync(paths.logPath, "probe\n");
		const manager = {
			exists: () => true,
			configPath: join(home, "config.json"),
			read: () => ({
				worker_url: "https://bat-ingest.worker.hexly.ai",
				api_key: "key",
				source_key: "source",
			}),
		} as never;
		const fetchImpl = (async (input: string | URL) => {
			const url = String(input);
			if (url.includes("registry.npmjs.org")) {
				return new Response(JSON.stringify({ "dist-tags": { latest: "3.2.0" } }), { status: 200 });
			}
			if (url.endsWith("/api/workstation-probe/targets")) {
				return new Response(JSON.stringify({ data: [], interval_seconds: 600, ping_count: 3 }), {
					status: 200,
				});
			}
			return new Response(JSON.stringify([]), { status: 200 });
		}) as unknown as typeof fetch;
		const exit = await runDoctorCommand({
			paths,
			context: { ...buildScheduleContext(), home, logPath: paths.logPath },
			version: "3.2.0",
			nodeVersion: "v22.0.0",
			configManager: manager,
			fetchImpl,
			exec: async () => ({
				code: 0,
				stdout:
					"# BEGIN bat workstation (managed by @nocoo/bat)\n*/10 * * * * x\n# END bat workstation (managed by @nocoo/bat)\n",
				stderr: "",
			}),
		});
		expect(exit).toBe(0);
	});

	test("a throwing schedule inspection fails the check", async () => {
		const paths = getWorkstationPaths(home);
		mkdirSync(paths.dir, { recursive: true });
		writeScheduleRecord(paths, { backend: "cron", installed_at: Math.floor(Date.now() / 1000) });
		const exit = await runDoctorCommand({
			paths,
			context: { ...buildScheduleContext(), home, logPath: paths.logPath },
			version: "3.2.0",
			nodeVersion: "v22.0.0",
			offline: true,
			exec: async () => {
				throw new Error("crontab exploded");
			},
			json: true,
		});
		expect(exit).toBe(1);
	});
});
