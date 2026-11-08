import { describe, expect, test } from "vitest";
import { type DoctorFacts, runChecks, summarise } from "./doctor.js";
import { getWorkstationPaths } from "./workstation/store.js";

const paths = getWorkstationPaths("/tmp/bat-doctor-test");
const credential = {
	workstation_id: "22aace94-25b4-46f4-8813-62c869ef1490",
	token: `batw_${"a".repeat(43)}`,
	worker_url: "https://bat-ingest.worker.hexly.ai",
};

function facts(overrides: Partial<DoctorFacts> = {}): DoctorFacts {
	return {
		version: "3.2.0",
		nodeVersion: "v22.1.0",
		latestVersion: "3.2.0",
		paths,
		assetsConfig: null,
		assetsConfigPath: "/tmp/bat-doctor-test/config.json",
		assetsTokenValid: null,
		installationId: "9f1d3ee2-6f2a-4b7c-8e3d-1a2b3c4d5e6f",
		credential,
		workstationReachable: 8,
		scheduleRecord: { backend: "launchd", installed: true },
		probeLocked: false,
		logAgeSeconds: 600,
		...overrides,
	};
}

function statusOf(results: ReturnType<typeof runChecks>, id: string): string {
	return results.find((check) => check.id === id)?.status ?? "missing";
}

describe("doctor checks", () => {
	test("a healthy machine passes everything and exits zero", () => {
		const results = runChecks(facts());
		expect(results.every((check) => check.status === "pass" || check.status === "warn")).toBe(true);
		expect(statusOf(results, "node")).toBe("pass");
		expect(statusOf(results, "schedule")).toBe("pass");
		expect(summarise(results).exitCode).toBe(0);
	});

	test("an old runtime fails", () => {
		const results = runChecks(facts({ nodeVersion: "v20.11.0" }));
		expect(statusOf(results, "node")).toBe("fail");
		expect(summarise(results).exitCode).toBe(1);
	});

	test("an outdated or unknown CLI version only warns", () => {
		expect(statusOf(runChecks(facts({ latestVersion: "3.3.0" })), "version")).toBe("warn");
		expect(statusOf(runChecks(facts({ latestVersion: null })), "version")).toBe("warn");
		expect(summarise(runChecks(facts({ latestVersion: "3.3.0" }))).exitCode).toBe(0);
	});

	test("an invalid assets profile fails, an unverified one warns", () => {
		const invalid = runChecks(
			facts({ assetsConfig: { worker_url: "", api_key: "", source_key: "" } as never }),
		);
		expect(statusOf(invalid, "assets-profile")).toBe("fail");
		const unverified = runChecks(
			facts({
				assetsConfig: {
					worker_url: "https://bat-ingest.worker.hexly.ai",
					api_key: "key",
					source_key: "source",
				} as never,
			}),
		);
		expect(statusOf(unverified, "assets-profile")).toBe("warn");
		const rejected = runChecks(
			facts({
				assetsConfig: {
					worker_url: "https://bat-ingest.worker.hexly.ai",
					api_key: "key",
					source_key: "source",
				} as never,
				assetsTokenValid: false,
			}),
		);
		expect(statusOf(rejected, "assets-profile")).toBe("fail");
	});

	test("a malformed workstation key fails and a foreign origin warns", () => {
		expect(
			statusOf(
				runChecks(facts({ credential: { ...credential, token: "plain" } })),
				"workstation-credential",
			),
		).toBe("fail");
		expect(
			statusOf(
				runChecks(
					facts({
						credential: { ...credential, worker_url: "https://evil.example" },
						expectedMachineOrigin: "https://bat-ingest.worker.hexly.ai",
					}),
				),
				"workstation-credential",
			),
		).toBe("warn");
		expect(
			statusOf(
				runChecks(facts({ credential: { ...credential, worker_url: "not a url" } })),
				"workstation-credential",
			),
		).toBe("fail");
	});

	test("an unenrolled machine warns instead of failing", () => {
		const results = runChecks(facts({ credential: null, workstationReachable: null }));
		expect(statusOf(results, "workstation-credential")).toBe("warn");
		expect(summarise(results).exitCode).toBe(0);
	});

	test("a missing or unregistered schedule differs", () => {
		expect(statusOf(runChecks(facts({ scheduleRecord: null })), "schedule")).toBe("warn");
		expect(
			statusOf(
				runChecks(facts({ scheduleRecord: { backend: "systemd", installed: false } })),
				"schedule",
			),
		).toBe("fail");
	});

	test("a probe lock and a stale log only warn", () => {
		const locked = runChecks(facts({ probeLocked: true }));
		expect(statusOf(locked, "probe-lock")).toBe("warn");
		expect(summarise(locked).exitCode).toBe(0);
		expect(statusOf(runChecks(facts({ logAgeSeconds: 3600 })), "recent-report")).toBe("warn");
		expect(statusOf(runChecks(facts({ logAgeSeconds: null })), "recent-report")).toBe("missing");
	});

	test("offline facts degrade to warnings", () => {
		const results = runChecks(facts({ workstationReachable: null, latestVersion: null }));
		expect(statusOf(results, "workstation-api")).toBe("warn");
		expect(summarise(results).exitCode).toBe(0);
	});
});

import { gatherFacts } from "./doctor.js";

describe("gatherFacts", () => {
	const base = {
		version: "3.2.0",
		nodeVersion: "v22.0.0",
		paths,
		assetsConfig: null,
		assetsConfigPath: "/tmp/config.json",
		installationId: null,
		credential: null,
		scheduleRecord: null,
		probeLocked: false,
		logAgeSeconds: null,
	};

	test("offline keeps every remote fact null", async () => {
		const facts = await gatherFacts({
			...base,
			offline: true,
			fetchImpl: (async () => {
				throw new Error("should not be called");
			}) as unknown as typeof fetch,
		});
		expect(facts.latestVersion).toBeNull();
		expect(facts.assetsTokenValid).toBeNull();
		expect(facts.workstationReachable).toBeNull();
	});

	test("collects the latest version, token result and target count", async () => {
		const facts = await gatherFacts({
			...base,
			credential: {
				workstation_id: "22aace94-25b4-46f4-8813-62c869ef1490",
				token: `batw_${"a".repeat(43)}`,
				worker_url: "https://bat-ingest.worker.hexly.ai",
			},
			assetsConfig: {
				worker_url: "https://bat-ingest.worker.hexly.ai",
				api_key: "key",
				source_key: "source",
			} as never,
			fetchLatest: async () => ({ version: "3.3.0" }),
			currentAssetsTokenCheck: async () => true,
			targets: async () => ({
				data: [],
				interval_seconds: 600,
				ping_count: 3,
			}),
		});
		expect(facts.latestVersion).toBe("3.3.0");
		expect(facts.assetsTokenValid).toBe(true);
		expect(facts.workstationReachable).toBe(0);
	});

	test("an assets profile without a checker stays unverified", async () => {
		const facts = await gatherFacts({
			...base,
			assetsConfig: {
				worker_url: "https://bat-ingest.worker.hexly.ai",
				api_key: "key",
				source_key: "source",
			} as never,
			fetchLatest: async () => ({ version: "3.2.0" }),
		});
		expect(facts.assetsTokenValid).toBeNull();
	});

	test("a failing lookup leaves the version unknown", async () => {
		const facts = await gatherFacts({
			...base,
			fetchLatest: async () => {
				throw new Error("no registry");
			},
		});
		expect(facts.latestVersion).toBeNull();
	});

	test("falls back to the default registry and target lookups", async () => {
		const fetchImpl = vi.fn(async (input: string | URL) => {
			const url = String(input);
			if (url.includes("registry.npmjs.org")) {
				return new Response(JSON.stringify({ "dist-tags": { latest: "3.4.0" } }), { status: 200 });
			}
			if (url.endsWith("/api/workstation-probe/targets")) {
				return new Response(JSON.stringify({ data: [], interval_seconds: 600, ping_count: 3 }), {
					status: 200,
				});
			}
			return new Response("{}", { status: 200 });
		});
		const facts = await gatherFacts({
			...base,
			credential: {
				workstation_id: "22aace94-25b4-46f4-8813-62c869ef1490",
				token: `batw_${"a".repeat(43)}`,
				worker_url: "https://bat-ingest.worker.hexly.ai",
			},
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});
		expect(facts.latestVersion).toBe("3.4.0");
		expect(facts.workstationReachable).toBe(0);
	});

	test("a rejected token or unreachable machine stays distinguishable", async () => {
		const facts = await gatherFacts({
			...base,
			credential: {
				workstation_id: "22aace94-25b4-46f4-8813-62c869ef1490",
				token: `batw_${"a".repeat(43)}`,
				worker_url: "https://bat-ingest.worker.hexly.ai",
			},
			assetsConfig: {
				worker_url: "https://bat-ingest.worker.hexly.ai",
				api_key: "key",
				source_key: "source",
			} as never,
			fetchLatest: async () => ({ version: "3.2.0" }),
			currentAssetsTokenCheck: async () => {
				throw new Error("boom");
			},
			targets: async () => {
				const { NetworkError } = await import("./lib/http.js");
				throw new NetworkError("offline");
			},
		});
		expect(facts.assetsTokenValid).toBeNull();
		expect(facts.workstationReachable).toBeNull();
	});
});

describe("default lookups through the shared client", () => {
	const okJson = (body: unknown) =>
		(async () =>
			new Response(JSON.stringify(body), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})) as unknown as typeof fetch;

	test("reads the newest version from the first registry that answers", async () => {
		const { fetchLatestVersion } = await import("./lib/registry.js");
		const lookup = await fetchLatestVersion(okJson({ "dist-tags": { latest: "9.9.9" } }));
		expect(lookup.version).toBe("9.9.9");
	});

	test("rejects a report readback without a data array", async () => {
		const { fetchReports } = await import("./workstation/api.js");
		await expect(
			fetchReports("https://bat-ingest.worker.hexly.ai", `batw_${"a".repeat(43)}`, 1, {
				fetchImpl: okJson({ nope: true }),
			}),
		).rejects.toThrow(/no data array/);
	});

	test("accepts a report readback and keeps the payload", async () => {
		const { fetchReports } = await import("./workstation/api.js");
		const body = { data: [{ report_id: "r1", connectivity: [] }], limit: 1 };
		const result = await fetchReports(
			"https://bat-ingest.worker.hexly.ai",
			`batw_${"a".repeat(43)}`,
			1,
			{ fetchImpl: okJson(body) },
		);
		expect(result.data).toHaveLength(1);
		expect(result.limit).toBe(1);
	});

	test("pairing start rejects an invalid input before any request", async () => {
		const { startPairing } = await import("./workstation/api.js");
		await expect(
			startPairing(
				{ dashboard: "https://bat.hexly.ai", machine: "https://bat-ingest.worker.hexly.ai" },
				{ installation_id: "nope", name: "x", code_challenge: "short" },
			),
		).rejects.toThrow(/invalid pairing request/);
	});

	test("pairing status tolerates missing optional fields", async () => {
		const { pairingStatus } = await import("./workstation/api.js");
		const result = await pairingStatus(
			{ dashboard: "https://bat.hexly.ai", machine: "https://bat-ingest.worker.hexly.ai" },
			"ABCD-2345",
			{ fetchImpl: okJson({ status: "pending" }) },
		);
		expect(result).toEqual({ status: "pending", name: "", expires_at: 0 });
	});
});
