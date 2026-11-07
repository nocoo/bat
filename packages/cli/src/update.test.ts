import { describe, expect, test, vi } from "vitest";
import { REGISTRIES } from "./lib/registry.js";
import { installUpdate, planUpdate } from "./update.js";

const latest = (version: string) =>
	vi.fn(
		async () => new Response(JSON.stringify({ "dist-tags": { latest: version } }), { status: 200 }),
	);

describe("planUpdate", () => {
	test("reports an up-to-date build", async () => {
		const plan = await planUpdate({
			currentVersion: "3.2.0",
			fetchImpl: latest("3.2.0") as unknown as typeof fetch,
		});
		expect(plan.upToDate).toBe(true);
		expect(plan.registry.label).toBe("npmjs");
	});

	test("reports an available upgrade", async () => {
		const plan = await planUpdate({
			currentVersion: "3.2.0",
			fetchImpl: latest("3.3.0") as unknown as typeof fetch,
		});
		expect(plan.upToDate).toBe(false);
		expect(plan.latestVersion).toBe("3.3.0");
	});
});

describe("installUpdate", () => {
	const plan = {
		currentVersion: "3.2.0",
		latestVersion: "3.3.0",
		registry: REGISTRIES[0] as (typeof REGISTRIES)[number],
		upToDate: false,
	};

	test("installs from npmjs when it works", async () => {
		const run = vi.fn(async () => ({ code: 0, stdout: "ok", stderr: "" }));
		const result = await installUpdate(plan, { run, announce: vi.fn() });
		expect(result).toEqual({ ok: true, registry: REGISTRIES[0] });
		expect(run).toHaveBeenCalledTimes(1);
		expect(run).toHaveBeenCalledWith("npm", [
			"install",
			"--global",
			"@nocoo/bat@3.3.0",
			"--registry=https://registry.npmjs.org",
			"--no-fund",
			"--no-audit",
		]);
	});

	test("falls back to the mirror and reports each failure", async () => {
		const announce = vi.fn();
		const run = vi.fn(async (_command: string, args: string[]) =>
			args.includes("--registry=https://registry.npmjs.org")
				? { code: 1, stdout: "", stderr: "E403 blocked\nsecond line" }
				: { code: 0, stdout: "added", stderr: "" },
		);
		const result = await installUpdate(plan, { run, announce });
		expect(result).toEqual({ ok: true, registry: REGISTRIES[1] });
		expect(run).toHaveBeenCalledTimes(2);
		expect(announce).toHaveBeenCalledWith("  npmjs failed, trying the next registry.");
	});

	test("reports every registry when the upgrade cannot be installed", async () => {
		const run = vi.fn(async () => ({ code: 1, stdout: "stdout tail", stderr: "" }));
		const result = await installUpdate(plan, { run });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.failures).toHaveLength(2);
			expect(result.failures[0]).toContain("npmjs: stdout tail");
		}
	});

	test("spawns npm itself when no runner is injected", async () => {
		// `printf` ignores the arguments and exits zero, exercising the default runner.
		const result = await installUpdate(plan, { npmCommand: "true" });
		expect(result.ok).toBe(true);
	});

	test("reports a spawn failure from the default runner", async () => {
		const result = await installUpdate(plan, { npmCommand: "definitely-not-a-real-binary" });
		expect(result.ok).toBe(false);
	});

	test("uses the injected npm command name", async () => {
		const run = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));
		await installUpdate(plan, { run, npmCommand: "/opt/homebrew/bin/npm" });
		expect(run).toHaveBeenCalledWith("/opt/homebrew/bin/npm", expect.any(Array));
	});
});
