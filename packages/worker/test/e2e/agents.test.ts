// L2 — Agent CRUD routes (POST/GET/PATCH/DELETE /api/agents)
// These use the localhost bypass for auth. Validates full round-trip through
// the worker including route registration, body parsing, and DB operations.

import type { AgentItem } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { assertStatus, BASE, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

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

	test("PATCH /api/agents/:id — clear nullable field with null", async () => {
		// Create a fresh agent with nickname
		const createRes = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: "e2e_nullable_src",
				match_key: "e2e_nullable_mk",
				nickname: "will-clear",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as AgentItem;
		expect(created.nickname).toBe("will-clear");

		// PATCH to null
		const patchRes = await fetch(`${BASE}/api/agents/${created.id}`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({ nickname: null }),
		});
		expect(patchRes.status).toBe(200);
		const patched = (await patchRes.json()) as AgentItem;
		expect(patched.nickname).toBeNull();

		// Cleanup
		await fetch(`${BASE}/api/agents/${created.id}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
	});

	test("PUT /api/agents/:id/tags → 200 (assign tags)", async () => {
		// Create a tag first (unique name to avoid 409 on re-runs)
		const tagName = `e2e-agent-tag-${Date.now()}`;
		const tagRes = await fetch(`${BASE}/api/tags`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ name: tagName }),
		});
		expect(tagRes.status).toBe(201);
		const tag = (await tagRes.json()) as { id: number; name: string };

		// Create agent
		const createRes = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: "e2e_tag_src",
				match_key: "e2e_tag_mk",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as AgentItem;

		try {
			// Assign tag
			const putRes = await fetch(`${BASE}/api/agents/${created.id}/tags`, {
				method: "PUT",
				headers: writeHeaders(),
				body: JSON.stringify({ tag_ids: [tag.id] }),
			});
			expect(putRes.status).toBe(200);
			const tagged = (await putRes.json()) as AgentItem;
			expect(tagged.tags).toHaveLength(1);
			expect(tagged.tags[0].name).toBe(tagName);

			// Clear tags
			const clearRes = await fetch(`${BASE}/api/agents/${created.id}/tags`, {
				method: "PUT",
				headers: writeHeaders(),
				body: JSON.stringify({ tag_ids: [] }),
			});
			expect(clearRes.status).toBe(200);
			const cleared = (await clearRes.json()) as AgentItem;
			expect(cleared.tags).toEqual([]);
		} finally {
			// Cleanup agent and tag even if assertions fail
			await fetch(`${BASE}/api/agents/${created.id}`, {
				method: "DELETE",
				headers: writeHeaders(),
			});
			await fetch(`${BASE}/api/tags/${tag.id}`, {
				method: "DELETE",
				headers: writeHeaders(),
			});
		}
	});

	test("PUT /api/agents/:id/tags → 400 (non-existent tags)", async () => {
		// Create agent
		const createRes = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: "e2e_badtag_src",
				match_key: "e2e_badtag_mk",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as AgentItem;

		try {
			const putRes = await fetch(`${BASE}/api/agents/${created.id}/tags`, {
				method: "PUT",
				headers: writeHeaders(),
				body: JSON.stringify({ tag_ids: [99999] }),
			});
			expect(putRes.status).toBe(400);
		} finally {
			// Cleanup
			await fetch(`${BASE}/api/agents/${created.id}`, {
				method: "DELETE",
				headers: writeHeaders(),
			});
		}
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
