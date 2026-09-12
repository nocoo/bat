import { afterEach, describe, expect, test, vi } from "vitest";
import type { Bindings } from "./types.js";

const { fetcher } = vi.hoisted(() => ({ fetcher: vi.fn() }));
vi.mock("cloudflare:workers", () => ({
	DurableObject: class {
		constructor(
			public ctx: DurableObjectState,
			public env: Bindings,
		) {}
	},
}));
vi.mock("./index.js", () => ({ app: { fetch: fetcher }, default: { scheduled: vi.fn() } }));

import worker, { ConnectCoordinator, coordinates } from "./entry.js";

const env = {
	DB: {} as D1Database,
	BAT_READ_KEY: "",
	BAT_WRITE_KEY: "",
	CONNECT_DEPLOYMENT_ID: "test",
	ENVIRONMENT: "development",
};
const ctx = { waitUntil: vi.fn() } as unknown as DurableObjectState;
afterEach(() => {
	vi.useRealTimers();
	fetcher.mockReset();
});

describe("Connect configuration coordination", () => {
	test("all browser/CLI/Connect control mutations share the atom; observations and reads stay concurrent", async () => {
		for (const path of [
			"/api/connect/servers/a/tokens",
			"/api/v1/servers/a/assets",
			"/api/tags/1",
			"/api/settings",
		])
			expect(coordinates("POST", path)).toBe(true);
		for (const method of ["GET", "HEAD", "OPTIONS"])
			expect(coordinates(method, "/api/v1/servers/a")).toBe(false);
		for (const path of ["/api/ingest", "/api/identity", "/api/tier2", "/api/events", "/connect"])
			expect(coordinates("POST", path)).toBe(false);
		fetcher.mockResolvedValue(new Response("ok"));
		expect(
			(
				await worker.fetch(
					new Request("http://localhost/api/live"),
					env,
					ctx as unknown as ExecutionContext,
				)
			).status,
		).toBe(200);
		expect(fetcher.mock.calls[0]?.[1].CONNECT_COORDINATED).toBe(false);
		const stub = { fetch: vi.fn().mockResolvedValue(new Response("ok")) };
		const bound = {
			...env,
			CONNECT_COORDINATOR: {
				getByName: vi.fn().mockReturnValue(stub),
			} as unknown as DurableObjectNamespace<ConnectCoordinator>,
		};
		expect(
			(
				await worker.fetch(
					new Request("http://localhost/api/tags", { method: "POST" }),
					bound,
					ctx as unknown as ExecutionContext,
				)
			).status,
		).toBe(200);
		expect(stub.fetch).toHaveBeenCalledOnce();
	});

	test("missing coordinator, rate limits and unknown production hosts fail closed", async () => {
		const request = new Request("http://localhost/api/tags", { method: "POST" });
		expect((await worker.fetch(request, env, ctx as unknown as ExecutionContext)).status).toBe(503);
		expect(
			(
				await worker.fetch(
					request,
					{ ...env, ENVIRONMENT: "production" },
					ctx as unknown as ExecutionContext,
				)
			).status,
		).toBe(403);
		expect(
			(
				await worker.fetch(
					request,
					{
						...env,
						CONNECT_COORDINATOR: {} as DurableObjectNamespace<ConnectCoordinator>,
						CONNECT_EDGE_LIMITER: { limit: async () => ({ success: false }) },
					},
					ctx as unknown as ExecutionContext,
				)
			).status,
		).toBe(429);
	});

	test("a response cannot release serialization while background mutation work is still pending", async () => {
		let release!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		fetcher
			.mockImplementationOnce(async (_request, _env, execution) => {
				execution.waitUntil(pending);
				return new Response(null, { status: 504 });
			})
			.mockResolvedValue(new Response("next"));
		const coordinator = new ConnectCoordinator(ctx, env);
		const first = coordinator.fetch(new Request("http://localhost/api/tags", { method: "POST" }));
		const second = coordinator.fetch(new Request("http://localhost/api/tags", { method: "POST" }));
		expect((await first).status).toBe(504);
		expect(fetcher).toHaveBeenCalledTimes(1);
		release();
		expect((await second).status).toBe(200);
		expect(fetcher.mock.calls[1]?.[1].CONNECT_COORDINATED).toBe(true);
	});

	test("queue bound and expired queued work never execute extra side effects", async () => {
		vi.useFakeTimers();
		let release!: (response: Response) => void;
		fetcher.mockReturnValueOnce(
			new Promise<Response>((resolve) => {
				release = resolve;
			}),
		);
		const coordinator = new ConnectCoordinator(ctx, env);
		const jobs = Array.from({ length: 32 }, () =>
			coordinator.fetch(new Request("http://localhost/api/tags", { method: "POST" })),
		);
		expect(
			(await coordinator.fetch(new Request("http://localhost/api/tags", { method: "POST" })))
				.status,
		).toBe(429);
		vi.setSystemTime(Date.now() + 16000);
		release(new Response("first"));
		const results = await Promise.all(jobs);
		expect(results.filter((response) => response.status === 504)).toHaveLength(31);
		expect(fetcher).toHaveBeenCalledTimes(1);
	});
});
