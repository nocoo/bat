// Tests for workstation HTTP calls: exchange, targets and report upload.

import type { WorkstationReportInput } from "@bat/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	exchangeLogin,
	fetchTargets,
	parseExchangeOutput,
	revokeWorkstationKey,
	uploadReport,
} from "./api.js";
import { TRUSTED_MACHINE_ORIGIN, type WorkstationOrigins } from "./origins.js";

const mockFetch = vi.fn<typeof fetch>();
const UUID = "550e8400-e29b-41d4-a716-446655440000";
const TOKEN = `batw_${"a".repeat(43)}`;

const ORIGINS: WorkstationOrigins = {
	dashboard: "https://bat.hexly.ai",
	machine: TRUSTED_MACHINE_ORIGIN,
};

const REPORT = { report_id: UUID } as unknown as WorkstationReportInput;

const TARGETS = {
	data: [
		{
			server_id: "srv_1",
			name: "edge-1",
			address: "203.0.113.10",
			family: 4 as const,
		},
	],
	interval_seconds: 600,
	ping_count: 3,
};

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

beforeEach(() => {
	mockFetch.mockReset();
	vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("exchangeLogin", () => {
	test("posts the validated PKCE body to the machine origin", async () => {
		mockFetch.mockResolvedValueOnce(
			jsonResponse(200, {
				workstation_id: UUID,
				token: TOKEN,
				worker_url: TRUSTED_MACHINE_ORIGIN,
			}),
		);

		const credential = await exchangeLogin(ORIGINS, {
			code: "code-1",
			code_verifier: "v".repeat(43),
			installation_id: UUID,
		});

		expect(credential).toStrictEqual({
			workstation_id: UUID,
			worker_url: TRUSTED_MACHINE_ORIGIN,
			token: TOKEN,
		});
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${TRUSTED_MACHINE_ORIGIN}/api/workstation-auth/exchange`);
		expect(JSON.parse(init.body as string)).toStrictEqual({
			code: "code-1",
			code_verifier: "v".repeat(43),
			installation_id: UUID,
		});
	});

	test("rejects an invalid exchange request before any network call", async () => {
		await expect(
			exchangeLogin(ORIGINS, {
				code: "code-1",
				code_verifier: "short",
				installation_id: UUID,
			}),
		).rejects.toThrow(/invalid exchange request/);
		expect(mockFetch).not.toHaveBeenCalled();
	});
});

describe("parseExchangeOutput", () => {
	test("rejects malformed payloads", () => {
		expect(() => parseExchangeOutput(null, TRUSTED_MACHINE_ORIGIN)).toThrow(/no object/);
		expect(() => parseExchangeOutput({}, TRUSTED_MACHINE_ORIGIN)).toThrow(/workstation_id/);
		expect(() =>
			parseExchangeOutput(
				{ workstation_id: UUID, token: "bat_x", worker_url: TRUSTED_MACHINE_ORIGIN },
				TRUSTED_MACHINE_ORIGIN,
			),
		).toThrow(/token/);
		expect(() =>
			parseExchangeOutput({ workstation_id: UUID, token: TOKEN }, TRUSTED_MACHINE_ORIGIN),
		).toThrow(/worker_url/);
	});

	test("rejects a worker_url that is not the trusted origin", () => {
		expect(() =>
			parseExchangeOutput(
				{ workstation_id: UUID, token: TOKEN, worker_url: "https://evil.example" },
				TRUSTED_MACHINE_ORIGIN,
			),
		).toThrow(/untrusted worker_url/);
	});
});

describe("fetchTargets", () => {
	test("validates the targets response", async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(200, TARGETS));
		await expect(fetchTargets(TRUSTED_MACHINE_ORIGIN, TOKEN)).resolves.toStrictEqual(TARGETS);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${TRUSTED_MACHINE_ORIGIN}/api/workstation-probe/targets`);
		expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
	});

	test("rejects an invalid targets response", async () => {
		mockFetch.mockResolvedValueOnce(
			jsonResponse(200, { data: [], interval_seconds: 60, ping_count: 3 }),
		);
		await expect(fetchTargets(TRUSTED_MACHINE_ORIGIN, TOKEN)).rejects.toThrow(
			/targets response rejected/,
		);
	});
});

describe("uploadReport", () => {
	test("accepts a 204 and never retries", async () => {
		mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		await uploadReport(TRUSTED_MACHINE_ORIGIN, TOKEN, REPORT);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	test("retries a server error with the same id and body", async () => {
		mockFetch
			.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const sleep = vi.fn().mockResolvedValue(undefined);

		await uploadReport(TRUSTED_MACHINE_ORIGIN, TOKEN, REPORT, { sleep });

		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(500);
		const bodies = mockFetch.mock.calls.map((call) => (call[1] as RequestInit).body);
		expect(bodies[0]).toBe(bodies[1]);
	});

	test("uses the real backoff when no sleep is injected", async () => {
		mockFetch
			.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }));

		await uploadReport(TRUSTED_MACHINE_ORIGIN, TOKEN, REPORT);
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});

	test("retries a network error until the attempt budget is spent", async () => {
		mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(
			uploadReport(TRUSTED_MACHINE_ORIGIN, TOKEN, REPORT, { attempts: 2, sleep }),
		).rejects.toThrow(/Failed to fetch/);
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(sleep).toHaveBeenCalledWith(500);
	});

	test("does not retry a 409 conflict", async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(409, { error: "conflict" }));
		const sleep = vi.fn().mockResolvedValue(undefined);

		await expect(uploadReport(TRUSTED_MACHINE_ORIGIN, TOKEN, REPORT, { sleep })).rejects.toThrow(
			/different content \(409\)/,
		);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(sleep).not.toHaveBeenCalled();
	});

	test("does not retry an authentication failure", async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(403, { error: "disabled" }));
		await expect(uploadReport(TRUSTED_MACHINE_ORIGIN, TOKEN, REPORT)).rejects.toThrow(/disabled/);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	test("retries 429 rate limiting", async () => {
		mockFetch
			.mockResolvedValueOnce(jsonResponse(429, { error: "slow down" }))
			.mockResolvedValueOnce(new Response(null, { status: 204 }));
		const sleep = vi.fn().mockResolvedValue(undefined);
		await uploadReport(TRUSTED_MACHINE_ORIGIN, TOKEN, REPORT, { sleep });
		expect(mockFetch).toHaveBeenCalledTimes(2);
	});
});

describe("cancellation", () => {
	test("forwards an external abort to the in-flight request", async () => {
		mockFetch.mockImplementationOnce((_url, init) => {
			const signal = (init as RequestInit).signal as AbortSignal;
			return new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () => {
					reject(new DOMException("Aborted", "AbortError"));
				});
			});
		});
		const controller = new AbortController();
		const pending = fetchTargets(TRUSTED_MACHINE_ORIGIN, TOKEN, { signal: controller.signal });
		controller.abort();
		await expect(pending).rejects.toThrow("Request aborted");
	});

	test("stops retrying once the run signal aborts", async () => {
		const controller = new AbortController();
		mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
		const sleep = vi.fn(async () => {
			controller.abort();
		});

		await expect(
			uploadReport(TRUSTED_MACHINE_ORIGIN, TOKEN, REPORT, {
				signal: controller.signal,
				sleep,
			}),
		).rejects.toThrow(/Failed to fetch/);
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});
});

describe("revokeWorkstationKey", () => {
	test("revokes the current key with a Bearer token", async () => {
		mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
		await revokeWorkstationKey(TRUSTED_MACHINE_ORIGIN, TOKEN);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(`${TRUSTED_MACHINE_ORIGIN}/api/workstation-probe/revoke`);
		expect(init.method).toBe("POST");
		expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
	});

	test("explains an unsupported server", async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(404, { error: "not found" }));
		await expect(revokeWorkstationKey(TRUSTED_MACHINE_ORIGIN, TOKEN)).rejects.toThrow(
			/does not support key revocation/,
		);
	});

	test("propagates other failures", async () => {
		mockFetch.mockResolvedValueOnce(jsonResponse(401, { error: "invalid key" }));
		await expect(revokeWorkstationKey(TRUSTED_MACHINE_ORIGIN, TOKEN)).rejects.toThrow(
			/invalid key/,
		);
	});
});
