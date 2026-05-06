// L2 — Binding CRUD + Map/Overview routes
// Validates full round-trip including FK checks, idempotent create, and read models.

import type { AssetItem, AssetMapResponse, AssetsOverview, BindingItem } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { BASE, assertStatus, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HOST_ID = "e2e-bindings-host";
let agentId = "";
let assetId = "";

describe("L2: bindings + map + overview", () => {
	beforeAll(async () => {
		// Create a host
		const hostRes = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HOST_ID)),
		});
		assertStatus(hostRes.status, 204, "bindings beforeAll identity");

		// Create an agent
		const agentRes = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: "e2e_bind_src",
				match_key: "e2e_bind_mk",
				host_id: HOST_ID,
				nickname: "bind-agent",
			}),
		});
		assertStatus(agentRes.status, 201, "bindings beforeAll agent");
		const agentData = (await agentRes.json()) as { id: string };
		agentId = agentData.id;

		// Create an asset
		const assetRes = await fetch(`${BASE}/api/assets`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				type: "cloud_service",
				name: "bind-asset",
				host_id: HOST_ID,
				subtype: "workers",
			}),
		});
		assertStatus(assetRes.status, 201, "bindings beforeAll asset");
		const assetData = (await assetRes.json()) as AssetItem;
		assetId = assetData.id;
	});

	test("GET /api/bindings → 200 (empty list)", async () => {
		const res = await fetch(`${BASE}/api/bindings`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const data = (await res.json()) as BindingItem[];
		expect(Array.isArray(data)).toBe(true);
	});

	test("POST /api/bindings → 201 (create)", async () => {
		const res = await fetch(`${BASE}/api/bindings`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ agent_id: agentId, asset_id: assetId }),
		});
		expect(res.status).toBe(201);
		const data = await res.json();
		expect((data as { agent_id: string }).agent_id).toBe(agentId);
		expect((data as { asset_id: string }).asset_id).toBe(assetId);
	});

	test("POST /api/bindings → 200 (duplicate idempotent)", async () => {
		const res = await fetch(`${BASE}/api/bindings`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ agent_id: agentId, asset_id: assetId }),
		});
		expect(res.status).toBe(200);
	});

	test("GET /api/bindings → includes created binding", async () => {
		const res = await fetch(`${BASE}/api/bindings`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const data = (await res.json()) as BindingItem[];
		const found = data.find((b) => b.agent_id === agentId && b.asset_id === assetId);
		expect(found).toBeDefined();
		expect(found?.agent_nickname).toBe("bind-agent");
		expect(found?.asset_name).toBe("bind-asset");
		expect(found?.asset_type).toBe("cloud_service");
	});

	test("POST /api/bindings → 400 (missing agent_id)", async () => {
		const res = await fetch(`${BASE}/api/bindings`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ asset_id: assetId }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/bindings → 400 (non-existent agent_id)", async () => {
		const res = await fetch(`${BASE}/api/bindings`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ agent_id: "agt_ghost", asset_id: assetId }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/bindings → 400 (non-existent asset_id)", async () => {
		const res = await fetch(`${BASE}/api/bindings`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ agent_id: agentId, asset_id: "ast_ghost" }),
		});
		expect(res.status).toBe(400);
	});

	test("GET /api/assets/map → 200 (full graph)", async () => {
		const res = await fetch(`${BASE}/api/assets/map`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const data = (await res.json()) as AssetMapResponse;
		expect(Array.isArray(data.hosts)).toBe(true);
		expect(Array.isArray(data.agents)).toBe(true);
		expect(Array.isArray(data.assets)).toBe(true);
		expect(Array.isArray(data.bindings)).toBe(true);
		expect(Array.isArray(data.tags)).toBe(true);
		// Should contain our created entities
		expect(data.agents.some((a) => a.id === agentId)).toBe(true);
		expect(data.assets.some((a) => a.id === assetId)).toBe(true);
		expect(data.bindings.some((b) => b.agent_id === agentId && b.asset_id === assetId)).toBe(true);
	});

	test("GET /api/assets/overview → 200 (counters)", async () => {
		const res = await fetch(`${BASE}/api/assets/overview`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AssetsOverview;
		expect(data.agents.total).toBeGreaterThanOrEqual(1);
		expect(data.assets.total).toBeGreaterThanOrEqual(1);
		expect(data.bindings).toBeGreaterThanOrEqual(1);
	});

	test("DELETE /api/bindings/:agentId/:assetId → 204", async () => {
		const res = await fetch(`${BASE}/api/bindings/${agentId}/${assetId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(204);
	});

	test("DELETE /api/bindings/:agentId/:assetId → 404 (already deleted)", async () => {
		const res = await fetch(`${BASE}/api/bindings/${agentId}/${assetId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(404);
	});
});
