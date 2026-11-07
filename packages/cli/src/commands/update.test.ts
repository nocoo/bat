import { describe, expect, test, vi } from "vitest";
import { runUpdateCommand } from "./update.js";

const latest = (version: string) =>
	vi.fn(
		async () => new Response(JSON.stringify({ "dist-tags": { latest: version } }), { status: 200 }),
	);

describe("runUpdateCommand", () => {
	test("reports an up-to-date build without installing", async () => {
		const run = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));
		const exit = await runUpdateCommand({
			currentVersion: "3.3.0",
			fetchImpl: latest("3.3.0") as unknown as typeof fetch,
			run,
			announce: vi.fn(),
		});
		expect(exit).toBe(0);
		expect(run).not.toHaveBeenCalled();
	});

	test("--check reports the newer version and installs nothing", async () => {
		const run = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));
		const exit = await runUpdateCommand({
			currentVersion: "3.2.0",
			fetchImpl: latest("3.3.0") as unknown as typeof fetch,
			run,
			check: true,
			announce: vi.fn(),
		});
		expect(exit).toBe(0);
		expect(run).not.toHaveBeenCalled();
	});

	test("installs a newer version", async () => {
		const run = vi.fn(async () => ({ code: 0, stdout: "", stderr: "" }));
		const exit = await runUpdateCommand({
			currentVersion: "3.2.0",
			fetchImpl: latest("3.3.0") as unknown as typeof fetch,
			run,
			announce: vi.fn(),
		});
		expect(exit).toBe(0);
		expect(run).toHaveBeenCalledTimes(1);
	});

	test("warns when the install itself fails but the plan was resolved", async () => {
		const exit = await runUpdateCommand({
			currentVersion: "3.2.0",
			fetchImpl: latest("3.3.0") as unknown as typeof fetch,
			run: vi.fn(async () => ({ code: 1, stdout: "", stderr: "boom" })),
		});
		expect(exit).toBe(1);
	});

	test("fails when every registry cannot be reached", async () => {
		const exit = await runUpdateCommand({
			currentVersion: "3.2.0",
			fetchImpl: (async () => {
				throw new Error("ENOTCONN");
			}) as unknown as typeof fetch,
			run: vi.fn(),
			announce: vi.fn(),
		});
		expect(exit).toBe(1);
	});

	test("fails when the install fails on both registries", async () => {
		const exit = await runUpdateCommand({
			currentVersion: "3.2.0",
			fetchImpl: latest("3.3.0") as unknown as typeof fetch,
			run: vi.fn(async () => ({ code: 1, stdout: "", stderr: "E403" })),
			announce: vi.fn(),
		});
		expect(exit).toBe(1);
	});
});

describe("runUpdateCommand defaults", () => {
	test("uses the real announcer and spawns npm through the default runner", async () => {
		const exit = await runUpdateCommand({
			currentVersion: "3.2.0",
			fetchImpl: latest("3.3.0") as unknown as typeof fetch,
			npmCommand: "true",
		});
		expect(exit).toBe(0);
	});
});
