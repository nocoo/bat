import { describe, expect, test } from "bun:test";
import { guardBrowserRequest, isProductionUrl, productionHostname } from "./capture-guard.mjs";

function fakeRoute(url) {
	const calls = [];
	return {
		calls,
		request: () => ({ url: () => url }),
		abort: async (reason) => calls.push(["abort", reason]),
		continue: async () => calls.push(["continue"]),
	};
}

describe("capture production guard", () => {
	test("aborts production hosts before dispatch and records only hostnames", async () => {
		for (const hostname of ["bat.hexly.ai", "bat-ingest.worker.hexly.ai"]) {
			const route = fakeRoute(`https://${hostname}/api/private?token=canary-secret`);
			const violations = [];
			expect(await guardBrowserRequest(route, violations)).toBe(hostname);
			expect(route.calls).toEqual([["abort", "blockedbyclient"]]);
			expect(violations).toEqual([hostname]);
			expect(JSON.stringify(violations)).not.toContain("canary-secret");
		}
	});

	test("continues localhost and lookalike hosts without recording", async () => {
		for (const url of [
			"http://127.0.0.1:4321/api/hosts?token=canary-secret",
			"https://bat.hexly.ai.example.test/api/hosts",
			"https://example.test/bat.hexly.ai",
		]) {
			const route = fakeRoute(url);
			const violations = [];
			expect(await guardBrowserRequest(route, violations)).toBeNull();
			expect(route.calls).toEqual([["continue"]]);
			expect(violations).toEqual([]);
		}
	});

	test("matches only the two production hostnames", () => {
		expect(productionHostname("https://bat.hexly.ai/")).toBe("bat.hexly.ai");
		expect(productionHostname("https://bat-ingest.worker.hexly.ai/path")).toBe(
			"bat-ingest.worker.hexly.ai",
		);
		expect(isProductionUrl("http://bat.hexly.ai:8080/api/live")).toBe(true);
		expect(isProductionUrl("http://localhost:7025/api/live")).toBe(false);
		expect(productionHostname("not a url")).toBeNull();
	});
});
