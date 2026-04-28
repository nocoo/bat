// L2 — Webhooks CRUD + Events ingest (kept together because event ingest tests
// depend on the webhook token created in setup).

import type { EventsListResponse, WebhookConfig } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { BASE, assertStatus, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HID = "e2e-wh-host";
const PUBLIC_IP = "203.0.113.42";

let webhookId = 0;
let webhookToken = "";

describe("L2: webhooks + events", () => {
	beforeAll(async () => {
		// Bootstrap host with a public_ip — events ingest validates CF-Connecting-IP
		// against the host's stored public_ip.
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ ...makeIdentityPayload(HID), public_ip: PUBLIC_IP }),
		});
		assertStatus(res.status, 204, "webhooks beforeAll identity");
	});

	// --- Webhook CRUD ---

	test("POST /api/webhooks → 201 (create webhook config)", async () => {
		const res = await fetch(`${BASE}/api/webhooks`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ host_id: HID }),
		});
		expect(res.status).toBe(201);
		const config = (await res.json()) as WebhookConfig;
		expect(config.host_id).toBe(HID);
		expect(config.token).toHaveLength(32);
		expect(config.is_active).toBe(true);
		expect(config.rate_limit).toBe(10);
		webhookId = config.id;
		webhookToken = config.token;
	});

	test("POST /api/webhooks duplicate host → 409", async () => {
		const res = await fetch(`${BASE}/api/webhooks`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ host_id: HID }),
		});
		expect(res.status).toBe(409);
	});

	test("POST /api/webhooks unknown host → 404", async () => {
		const res = await fetch(`${BASE}/api/webhooks`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ host_id: "nonexistent-host" }),
		});
		expect(res.status).toBe(404);
	});

	test("GET /api/webhooks → lists configs", async () => {
		const res = await fetch(`${BASE}/api/webhooks`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const configs = (await res.json()) as (WebhookConfig & { hostname: string })[];
		const ours = configs.find((c) => c.host_id === HID);
		expect(ours).toBeDefined();
		expect(ours?.hostname).toBe(`${HID}.example.com`);
	});

	test("POST /api/webhooks/:id/regenerate → new token", async () => {
		const res = await fetch(`${BASE}/api/webhooks/${webhookId}/regenerate`, {
			method: "POST",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { token: string };
		expect(body.token).toHaveLength(32);
		expect(body.token).not.toBe(webhookToken);
		webhookToken = body.token;
	});

	// --- Event ingest auth chain ---

	test("POST /api/events without token → 401", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ title: "test", body: {} }),
		});
		expect(res.status).toBe(401);
	});

	test("POST /api/events with invalid token → 403", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: "Bearer deadbeefdeadbeefdeadbeefdeadbeef",
				"Content-Type": "application/json",
				"CF-Connecting-IP": PUBLIC_IP,
			},
			body: JSON.stringify({ title: "test", body: {} }),
		});
		expect(res.status).toBe(403);
	});

	test("POST /api/events without CF-Connecting-IP → local wrangler injects 127.0.0.1 → IP mismatch 403", async () => {
		// Local wrangler/miniflare auto-injects CF-Connecting-IP=127.0.0.1, so we
		// can't test "missing header → 400" here. Instead this verifies the
		// IP-mismatch path when the injected IP doesn't match host's public_ip.
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${webhookToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ title: "test", body: {} }),
		});
		expect(res.status).toBe(403);
	});

	test("POST /api/events with wrong IP → 403", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${webhookToken}`,
				"Content-Type": "application/json",
				"CF-Connecting-IP": "198.51.100.1",
			},
			body: JSON.stringify({ title: "test", body: {} }),
		});
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("IP");
	});

	// --- Event ingest payload validation ---

	test("POST /api/events missing title → 400", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${webhookToken}`,
				"Content-Type": "application/json",
				"CF-Connecting-IP": PUBLIC_IP,
			},
			body: JSON.stringify({ body: { msg: "hello" } }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("title");
	});

	test("POST /api/events title too long → 400", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${webhookToken}`,
				"Content-Type": "application/json",
				"CF-Connecting-IP": PUBLIC_IP,
			},
			body: JSON.stringify({ title: "x".repeat(201), body: {} }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("200");
	});

	test("POST /api/events body not an object → 400", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${webhookToken}`,
				"Content-Type": "application/json",
				"CF-Connecting-IP": PUBLIC_IP,
			},
			body: JSON.stringify({ title: "test", body: "not-an-object" }),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("body");
	});

	test("POST /api/events too many tags → 400", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${webhookToken}`,
				"Content-Type": "application/json",
				"CF-Connecting-IP": PUBLIC_IP,
			},
			body: JSON.stringify({
				title: "test",
				body: {},
				tags: Array.from({ length: 11 }, (_, i) => `tag${i}`),
			}),
		});
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("10");
	});

	// --- Successful event ingest ---

	test("POST /api/events valid payload → 204", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${webhookToken}`,
				"Content-Type": "application/json",
				"CF-Connecting-IP": PUBLIC_IP,
			},
			body: JSON.stringify({
				title: "Deployment completed",
				body: { version: "1.0.0", duration_ms: 12345 },
				tags: ["deploy", "production"],
			}),
		});
		expect(res.status).toBe(204);
	});

	test("POST /api/events minimal payload (no tags) → 204", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${webhookToken}`,
				"Content-Type": "application/json",
				"CF-Connecting-IP": PUBLIC_IP,
			},
			body: JSON.stringify({ title: "Backup finished", body: { size_bytes: 1024000 } }),
		});
		expect(res.status).toBe(204);
	});

	// --- Events listing ---

	test("GET /api/events → lists ingested events", async () => {
		const res = await fetch(`${BASE}/api/events`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const data = (await res.json()) as EventsListResponse;
		expect(data.items.length).toBeGreaterThanOrEqual(2);
		expect(data.limit).toBe(30);
		expect(data.offset).toBe(0);
		const deploy = data.items.find((e) => e.title === "Deployment completed");
		expect(deploy).toBeDefined();
		expect(deploy?.host_id).toBe(HID);
		expect(deploy?.hostname).toBe(`${HID}.example.com`);
		expect(deploy?.tags).toEqual(["deploy", "production"]);
		expect(deploy?.source_ip).toBe(PUBLIC_IP);
	});

	test("GET /api/events?host_id= → filtered by host", async () => {
		const res = await fetch(`${BASE}/api/events?host_id=${HID}`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const data = (await res.json()) as EventsListResponse;
		expect(data.items.length).toBeGreaterThanOrEqual(2);
		for (const event of data.items) {
			expect(event.host_id).toBe(HID);
		}
	});

	test("GET /api/events?host_id= for host with no events → empty array", async () => {
		const res = await fetch(`${BASE}/api/events?host_id=nonexistent-host-zzz`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as EventsListResponse;
		expect(data.items).toEqual([]);
		expect(data.total).toBe(0);
	});

	// --- Rate limiting ---

	test("POST /api/events rate limiting → 429 after exceeding limit", async () => {
		const RL_HID = "e2e-wh-rl";
		const RL_IP = "198.51.100.99";

		const identRes = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ ...makeIdentityPayload(RL_HID), public_ip: RL_IP }),
		});
		expect(identRes.status).toBe(204);

		const whRes = await fetch(`${BASE}/api/webhooks`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ host_id: RL_HID }),
		});
		expect(whRes.status).toBe(201);
		const rlToken = ((await whRes.json()) as WebhookConfig).token;

		for (let i = 0; i < 10; i++) {
			const res = await fetch(`${BASE}/api/events`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${rlToken}`,
					"Content-Type": "application/json",
					"CF-Connecting-IP": RL_IP,
				},
				body: JSON.stringify({ title: `Rate limit test ${i}`, body: { seq: i } }),
			});
			expect(res.status).toBe(204);
		}

		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${rlToken}`,
				"Content-Type": "application/json",
				"CF-Connecting-IP": RL_IP,
			},
			body: JSON.stringify({ title: "Should be rate limited", body: { over: true } }),
		});
		expect(res.status).toBe(429);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Rate limit");
	});

	// --- Webhook delete ---

	test("DELETE /api/webhooks/:id → 204", async () => {
		const res = await fetch(`${BASE}/api/webhooks/${webhookId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(204);
	});

	test("DELETE /api/webhooks/:id already deleted → 404", async () => {
		const res = await fetch(`${BASE}/api/webhooks/${webhookId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("POST /api/events with deleted webhook token → 403", async () => {
		const res = await fetch(`${BASE}/api/events`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${webhookToken}`,
				"Content-Type": "application/json",
				"CF-Connecting-IP": PUBLIC_IP,
			},
			body: JSON.stringify({ title: "should fail", body: {} }),
		});
		expect(res.status).toBe(403);
	});
});
