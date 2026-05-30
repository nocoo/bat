// C1 wiring tests — verifies that the repos middleware sets `c.var.repos`
// to a `Repositories` bundle and that the D1 factory returns the expected
// shape. Per docs/20-d1-to-kv-migration.md v6 §4.

import { Hono } from "hono";
import { describe, expect, test } from "vitest";
import { reposMiddleware } from "../../middleware/repos.js";
import type { AppEnv } from "../../types.js";
import { createD1Repositories } from "./factory.js";

describe("createD1Repositories", () => {
	test("returns a bundle with all 15 repo slots", () => {
		const fakeDb = {} as D1Database;
		const repos = createD1Repositories(fakeDb);
		const expectedKeys = [
			"hosts",
			"metrics",
			"alerts",
			"events",
			"webhooks",
			"ports",
			"tags",
			"settings",
			"maintenance",
			"agents",
			"assets",
			"bindings",
			"tier2",
			"cliTokens",
			"aggregation",
		];
		for (const k of expectedKeys) {
			expect(repos).toHaveProperty(k);
		}
		expect(Object.keys(repos).sort()).toEqual([...expectedKeys].sort());
	});

	test("each repo slot is an object (placeholder; methods land in C2+)", () => {
		const repos = createD1Repositories({} as D1Database);
		for (const v of Object.values(repos)) {
			expect(typeof v).toBe("object");
			expect(v).not.toBeNull();
		}
	});

	test("placeholder repo slots are frozen-singleton across calls; concrete adapter slots are per-call instances", () => {
		const a = createD1Repositories({} as D1Database);
		const b = createD1Repositories({} as D1Database);
		// Slots that haven't migrated yet share the frozen-empty singleton.
		expect(a.hosts).toBe(b.hosts);
		expect(a.aggregation).toBe(b.aggregation);
		// Concrete adapters (settings, webhooks) are fresh instances per call,
		// each closed over its own db reference.
		expect(a.settings).not.toBe(b.settings);
		expect(a.webhooks).not.toBe(b.webhooks);
	});
});

describe("reposMiddleware", () => {
	test("sets c.var.repos to a Repositories bundle on every request", async () => {
		const app = new Hono<AppEnv>();
		app.use("*", reposMiddleware);
		app.get("/probe", (c) => {
			const repos = c.var.repos;
			return c.json({
				hasHosts: typeof repos.hosts === "object" && repos.hosts !== null,
				hasMetrics: typeof repos.metrics === "object" && repos.metrics !== null,
				hasAggregation: typeof repos.aggregation === "object" && repos.aggregation !== null,
				keyCount: Object.keys(repos).length,
			});
		});

		const res = await app.request("/probe", undefined, { DB: {} as D1Database });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			hasHosts: true,
			hasMetrics: true,
			hasAggregation: true,
			keyCount: 15,
		});
	});

	test("re-runs on each request (per-request bundle, no leakage)", async () => {
		const app = new Hono<AppEnv>();
		app.use("*", reposMiddleware);
		app.get("/r", (c) => {
			return c.json({ keys: Object.keys(c.var.repos).sort() });
		});

		const r1 = await app.request("/r", undefined, { DB: {} as D1Database });
		const r2 = await app.request("/r", undefined, { DB: {} as D1Database });
		expect(await r1.json()).toEqual(await r2.json());
	});
});
