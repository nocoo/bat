import { describe, expect, test, vi } from "vitest";
import {
	compareVersions,
	fetchLatestVersion,
	metadataUrl,
	PACKAGE_NAME,
	REGISTRIES,
} from "./registry.js";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

describe("registry metadata", () => {
	test("encodes scoped names and keeps the registry order", () => {
		expect(metadataUrl(REGISTRIES[0] as (typeof REGISTRIES)[number])).toBe(
			"https://registry.npmjs.org/@nocoo%2Fbat",
		);
		expect(metadataUrl({ label: "x", base: "http://x" }, "@a/b")).toBe("http://x/@a%2Fb");
		expect(REGISTRIES.map((registry) => registry.label)).toEqual(["npmjs", "tencent mirror"]);
		expect(PACKAGE_NAME).toBe("@nocoo/bat");
	});
});

describe("fetchLatestVersion", () => {
	test("uses the first registry that answers", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ "dist-tags": { latest: "3.3.0" } }));
		const lookup = await fetchLatestVersion(fetchImpl as unknown as typeof fetch, REGISTRIES);
		expect(lookup.version).toBe("3.3.0");
		expect(lookup.registry.label).toBe("npmjs");
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	test("falls back to the mirror on a network error or non-2xx", async () => {
		const network = vi.fn(async (url: string) => {
			if (String(url).includes("registry.npmjs.org")) {
				throw new Error("ENOTCONN");
			}
			return jsonResponse({ "dist-tags": { latest: "3.3.1" } });
		});
		expect((await fetchLatestVersion(network as unknown as typeof fetch)).registry.label).toBe(
			"tencent mirror",
		);

		const http500 = vi.fn(async (url: string) =>
			String(url).includes("registry.npmjs.org")
				? jsonResponse({}, 500)
				: jsonResponse({ "dist-tags": { latest: "3.3.2" } }),
		);
		expect((await fetchLatestVersion(http500 as unknown as typeof fetch)).version).toBe("3.3.2");
	});

	test("skips unreadable bodies and missing tags", async () => {
		const fetchImpl = vi.fn(async (url: string) => {
			if (String(url).includes("registry.npmjs.org")) {
				return new Response("not json", { status: 200 });
			}
			return jsonResponse({ "dist-tags": {} });
		});
		await expect(fetchLatestVersion(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
			/no registry answered/,
		);
	});

	test("skips a blank latest tag", async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ "dist-tags": { latest: "  " } }));
		await expect(fetchLatestVersion(fetchImpl as unknown as typeof fetch)).rejects.toThrow(
			/no latest tag/,
		);
	});
});

describe("compareVersions", () => {
	test("compares numerically, not lexically", () => {
		expect(compareVersions("3.10.0", "3.9.9")).toBeGreaterThan(0);
		expect(compareVersions("3.2.0", "3.2.0")).toBe(0);
		expect(compareVersions("v3.1.9", "3.2.0")).toBeLessThan(0);
		expect(compareVersions("3.2.0-beta.1", "3.2.0")).toBe(0);
		expect(compareVersions("3.2", "3.2.1")).toBeLessThan(0);
		// Non-numeric segments count as zero instead of NaN poisoning the result.
		expect(compareVersions("3.x.0", "3.0.0")).toBe(0);
		expect(compareVersions("garbage", "0.0.0")).toBe(0);
		expect(compareVersions("1", "1.0.1")).toBeLessThan(0);
		expect(compareVersions("1.0.1", "1")).toBeGreaterThan(0);
	});
});
