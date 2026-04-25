import { describe, expect, test } from "vitest";
import { setupRoute } from "./setup.js";

function makeCtx(host: string | undefined) {
	return {
		req: {
			header: (key: string) => (key === "host" ? host : undefined),
		},
		json: (data: unknown, status?: number) =>
			new Response(JSON.stringify(data), {
				status: status ?? 200,
				headers: { "Content-Type": "application/json" },
			}),
	// biome-ignore lint/suspicious/noExplicitAny: test
	} as any;
}

describe("setupRoute", () => {
	test("defaults to localhost when host header missing", async () => {
		const res = setupRoute(makeCtx(undefined));
		const body = await res.json() as { worker_url: string };
		expect(body.worker_url).toBe("http://localhost:8787");
	});

	test("localhost uses http", async () => {
		const res = setupRoute(makeCtx("localhost:8787"));
		const body = await res.json() as { worker_url: string };
		expect(body.worker_url).toBe("http://localhost:8787");
	});

	test("bat.hexly.ai browser endpoint points to machine endpoint", async () => {
		const res = setupRoute(makeCtx("bat.hexly.ai"));
		const body = await res.json() as { worker_url: string };
		expect(body.worker_url).toBe("https://bat-ingest.worker.hexly.ai");
	});

	test("bat-ingest host uses its own url", async () => {
		const res = setupRoute(makeCtx("bat-ingest.worker.hexly.ai"));
		const body = await res.json() as { worker_url: string };
		expect(body.worker_url).toBe("https://bat-ingest.worker.hexly.ai");
	});

	test("other https host uses own url", async () => {
		const res = setupRoute(makeCtx("custom.example.com"));
		const body = await res.json() as { worker_url: string };
		expect(body.worker_url).toBe("https://custom.example.com");
	});
});
