// L2 — Agent CRUD routes (POST/GET/PATCH/DELETE /api/agents)
// These use the localhost bypass for auth. Validates full round-trip through
// the worker including route registration, body parsing, and DB operations.

import type { AgentItem } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { BASE, assertStatus, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HOST_ID = "e2e-agents-host";
let agentId = "";

describe("L2: agents CRUD", () => {
	beforeAll(async () => {
		// Create a host for FK tests
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HOST_ID)),
		});
		assertStatus(res.status, 204, "agents beforeAll identity");
	});

	test("GET /api/agents → 200 (empty list)", async () => {
		const res = await fetch(`${BASE}/api/agents`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const data = (await res.json()) as AgentItem[];
		expect(Array.isArray(data)).toBe(true);
	});

	test("POST /api/agents → 201 (create)", async () => {
		const res = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: "e2e_src_key",
				match_key: "e2e_match_key",
				host_id: HOST_ID,
				nickname: "e2e-agent",
				role: "tester",
				status: "running",
			}),
		});
		expect(res.status).toBe(201);
		const data = (await res.json()) as AgentItem;
		expect(data.id).toMatch(/^agt_/);
		expect(data.source_key_short).toBe("e2e_src_");
		expect(data.match_key).toBe("e2e_match_key");
		expect(data.host_id).toBe(HOST_ID);
		expect(data.nickname).toBe("e2e-agent");
		expect(data.role).toBe("tester");
		expect(data.status).toBe("running");
		expect(data.metadata).toEqual({});
		expect(data.tags).toEqual([]);
		agentId = data.id;
	});

	test("POST /api/agents → 200 (upsert on same source_key + match_key)", async () => {
		const res = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: "e2e_src_key",
				match_key: "e2e_match_key",
				nickname: "e2e-agent-updated",
				status: "stopped",
			}),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AgentItem;
		expect(data.id).toBe(agentId);
		expect(data.nickname).toBe("e2e-agent-updated");
		expect(data.status).toBe("stopped");
	});

	test("GET /api/agents/:id → 200", async () => {
		const res = await fetch(`${BASE}/api/agents/${agentId}`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AgentItem;
		expect(data.id).toBe(agentId);
		expect(data.nickname).toBe("e2e-agent-updated");
	});

	test("GET /api/agents/:id → 404 (non-existent)", async () => {
		const res = await fetch(`${BASE}/api/agents/agt_nonexistent`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("PATCH /api/agents/:id → 200 (update)", async () => {
		const res = await fetch(`${BASE}/api/agents/${agentId}`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({
				nickname: "e2e-patched",
				metadata: { build: "42" },
			}),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AgentItem;
		expect(data.nickname).toBe("e2e-patched");
		expect(data.metadata).toEqual({ build: "42" });
	});

	test("PATCH /api/agents/:id → 404 (non-existent)", async () => {
		const res = await fetch(`${BASE}/api/agents/agt_ghost`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({ nickname: "nope" }),
		});
		expect(res.status).toBe(404);
	});

	test("PATCH /api/agents/:id → 400 (invalid status)", async () => {
		const res = await fetch(`${BASE}/api/agents/${agentId}`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({ status: "bogus" }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/agents → 400 (missing required fields)", async () => {
		const res = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ nickname: "only-nickname" }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/agents → 400 (invalid host_id FK)", async () => {
		const res = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: "sk_fk_test",
				match_key: "mk_fk_test",
				host_id: "nonexistent_host",
			}),
		});
		expect(res.status).toBe(400);
		const data = await res.json();
		expect((data as { error: string }).error).toContain("host_id");
	});

	test("DELETE /api/agents/:id → 204 (hard delete)", async () => {
		const res = await fetch(`${BASE}/api/agents/${agentId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(204);
	});

	test("DELETE /api/agents/:id → 404 (already deleted)", async () => {
		const res = await fetch(`${BASE}/api/agents/${agentId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("GET /api/agents/:id → 404 (after delete)", async () => {
		const res = await fetch(`${BASE}/api/agents/${agentId}`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
	});
});
