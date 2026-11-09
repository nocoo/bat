import type { HostDetailItem, HostOverviewItem } from "@bat/shared";
import { hashHostId } from "@bat/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, test } from "vitest";
import { createD1Repositories } from "../adapters/d1/factory";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { hostBillingPatchRoute } from "./host-billing";
import { hostDetailRoute } from "./host-detail";
import { hostsListRoute } from "./hosts";

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "wk", BAT_READ_KEY: "rk" };
		c.set("repos", createD1Repositories(db));
		return next();
	});
	app.patch("/api/hosts/:id/billing", hostBillingPatchRoute);
	app.get("/api/hosts/:id", hostDetailRoute);
	app.get("/api/hosts", hostsListRoute);
	return app;
}

async function insertHost(db: D1Database, hostId: string) {
	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(hostId, hostId, now)
		.run();
}

function patch(app: Hono<AppEnv>, id: string, body: unknown) {
	return app.request(
		new Request(`http://localhost/api/hosts/${id}/billing`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("PATCH /api/hosts/:id/billing", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(async () => {
		db = createMockD1();
		app = createApp(db);
		await insertHost(db, "host-001");
	});

	test("stores the billing triple and serves it on the detail route", async () => {
		const res = await patch(app, "host-001", {
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});
		expect(res.status).toBe(204);

		const detail = (await (
			await app.request("http://localhost/api/hosts/host-001")
		).json()) as HostDetailItem;
		expect(detail.cost_amount_cny).toBe(365);
		expect(detail.paid_at).toBe("2026-01-01");
		expect(detail.renews_at).toBe("2027-01-01");
	});

	test("the overview list carries the renewal date only", async () => {
		await patch(app, "host-001", {
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});

		const hosts = (await (
			await app.request("http://localhost/api/hosts")
		).json()) as HostOverviewItem[];
		expect(hosts[0]?.renews_at).toBe("2027-01-01");
		expect(hosts[0]?.host_id).toBe("host-001");
	});

	test("clears the billing triple when every field is null", async () => {
		await patch(app, "host-001", {
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});
		const res = await patch(app, "host-001", {
			cost_amount_cny: null,
			paid_at: null,
			renews_at: null,
		});
		expect(res.status).toBe(204);

		const detail = (await (
			await app.request("http://localhost/api/hosts/host-001")
		).json()) as HostDetailItem;
		expect(detail.cost_amount_cny).toBeNull();
		expect(detail.paid_at).toBeNull();
		expect(detail.renews_at).toBeNull();
	});

	test("accepts a host addressed by its opaque hid", async () => {
		const res = await patch(app, hashHostId("host-001"), {
			cost_amount_cny: 88.5,
			paid_at: "2026-02-01",
			renews_at: "2026-03-01",
		});
		expect(res.status).toBe(204);

		const detail = (await (
			await app.request("http://localhost/api/hosts/host-001")
		).json()) as HostDetailItem;
		expect(detail.cost_amount_cny).toBe(88.5);
	});

	test("rejects a mixed null triple", async () => {
		const res = await patch(app, "host-001", {
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: null,
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("all be set or all be null");
	});

	test("rejects a negative amount", async () => {
		const res = await patch(app, "host-001", {
			cost_amount_cny: -1,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});
		expect(res.status).toBe(400);
	});

	test("rejects an amount with three decimals", async () => {
		const res = await patch(app, "host-001", {
			cost_amount_cny: 12.345,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});
		expect(res.status).toBe(400);
	});

	test("rejects a date that is not a real calendar day", async () => {
		const res = await patch(app, "host-001", {
			cost_amount_cny: 365,
			paid_at: "2026-02-30",
			renews_at: "2027-01-01",
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("paid_at");
	});

	test("rejects a renewal that is not after the payment", async () => {
		const res = await patch(app, "host-001", {
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2025-12-31",
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("renews_at must be after paid_at");
	});

	test("rejects a body that is not a JSON object", async () => {
		const res = await app.request(
			new Request("http://localhost/api/hosts/host-001/billing", {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			}),
		);
		expect(res.status).toBe(400);
	});

	test("404 for an unknown host", async () => {
		const res = await patch(app, "nonexistent", {
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});
		expect(res.status).toBe(404);
	});

	test("403 for a retired host", async () => {
		await db.prepare("UPDATE hosts SET is_active = 0 WHERE host_id = ?").bind("host-001").run();
		const res = await patch(app, "host-001", {
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
		});
		expect(res.status).toBe(403);
	});
});
