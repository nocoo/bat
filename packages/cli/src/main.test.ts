// Tests for the bat command tree and the published package contract.

import { readFileSync } from "node:fs";
import { BAT_VERSION } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { main } from "./main.js";

const manifest = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
) as Record<string, unknown>;

describe("main command tree", () => {
	test("exposes the bat name and version", () => {
		expect(main.meta?.name).toBe("bat");
		expect(main.meta?.version).toBe(BAT_VERSION);
	});

	test("registers every server command group", () => {
		expect(Object.keys(main.subCommands ?? {})).toStrictEqual([
			"login",
			"status",
			"doctor",
			"update",
			"agent",
			"asset",
			"binding",
			"service",
			"workstation",
		]);
	});

	test("loads the workstation command group lazily", async () => {
		const entry = main.subCommands?.workstation;
		expect(entry).toBeTypeOf("function");
		const group = (await (entry as () => Promise<unknown>)()) as {
			meta?: { name?: string };
			subCommands?: Record<string, unknown>;
		};
		expect(group.meta?.name).toBe("workstation");
		expect(Object.keys(group.subCommands ?? {})).toStrictEqual([
			"login",
			"detail",
			"setup",
			"probe",
			"status",
			"logout",
		]);
	});
});

describe("package contract", () => {
	test("publishes @nocoo/bat with the single bat bin", () => {
		expect(manifest.name).toBe("@nocoo/bat");
		expect(manifest.bin).toStrictEqual({ bat: "./dist/bat.js" });
		expect(manifest.private).toBeUndefined();
		expect(manifest.publishConfig).toStrictEqual({ access: "public" });
	});

	test("ships only the bundle, license and readme", () => {
		expect(manifest.files).toStrictEqual(["dist", "LICENSE", "README.md"]);
	});

	test("requires Node 22 or newer without install scripts", () => {
		expect(manifest.engines).toStrictEqual({ node: ">=22" });
		expect(manifest.scripts).not.toHaveProperty("preinstall");
		expect(manifest.scripts).not.toHaveProperty("postinstall");
	});

	test("has no runtime workspace or private dependencies", () => {
		expect(manifest.dependencies).toBeUndefined();
	});
});
