// L2 — Agent Heartbeat E2E
// Validates heartbeat flow: create, update, mark-missing, source_key isolation.

import type { AgentHeartbeatResponse, AgentItem } from "@bat/shared";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { assertStatus, BASE, writeHeaders } from "./helpers";

const SUFFIX = Date.now().toString(36);
const SOURCE_KEY = `e2e_hb_src_${SUFFIX}`;

// Pre-register an agent for update testing
let preRegisteredAgentId = "";

describe("L2: POST /api/agents/heartbeat", () => {
	beforeAll(async () => {
		// Create an agent with our source_key to test the update path
		const res = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: SOURCE_KEY,
				match_key: `e2e_hb_mk_existing_${SUFFIX}`,
				nickname: "hb-existing",
				status: "unknown",
			}),
		});
		assertStatus(res.status, 201, "heartbeat beforeAll agent create");
		const data = (await res.json()) as { id: string };
		preRegisteredAgentId = data.id;
	});

	afterAll(async () => {
		// Clean up only agents created by this test run.
		// List all agents, filter by our unique SUFFIX in match_key field.
		const listRes = await fetch(`${BASE}/api/agents`, {
			headers: writeHeaders(),
		});
		if (listRes.ok) {
			const agents = (await listRes.json()) as AgentItem[];
			for (const agent of agents) {
				if (agent.match_key?.includes(SUFFIX)) {
					await fetch(`${BASE}/api/agents/${agent.id}`, {
						method: "DELETE",
						headers: writeHeaders(),
					});
				}
			}
		}
		// Fallback: ensure pre-registered agent is cleaned up
		await fetch(`${BASE}/api/agents/${preRegisteredAgentId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
	});

	test("POST /api/agents/heartbeat → 400 (empty body)", async () => {
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: "",
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/agents/heartbeat → 400 (missing source_key)", async () => {
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ agents: [] }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/agents/heartbeat → 400 (agents not array)", async () => {
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ source_key: SOURCE_KEY, agents: "bad" }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/agents/heartbeat → 400 (invalid agent status)", async () => {
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: SOURCE_KEY,
				agents: [{ match_key: "mk", status: "invalid_status" }],
			}),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/agents/heartbeat → 400 (duplicate match_key)", async () => {
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: SOURCE_KEY,
				agents: [
					{ match_key: "dup", status: "running" },
					{ match_key: "dup", status: "stopped" },
				],
			}),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/agents/heartbeat → 400 (status 'missing' is server-only)", async () => {
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: SOURCE_KEY,
				agents: [{ match_key: "mk_test", status: "missing" }],
			}),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/agents/heartbeat → 200 (empty agents, no side effects)", async () => {
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ source_key: `e2e_hb_empty_${SUFFIX}`, agents: [] }),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AgentHeartbeatResponse;
		expect(data.updated).toBe(0);
		expect(data.created).toBe(0);
		expect(data.missing).toBe(0);
	});

	test("POST /api/agents/heartbeat → 200 (updates existing agent)", async () => {
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: SOURCE_KEY,
				agents: [
					{
						match_key: `e2e_hb_mk_existing_${SUFFIX}`,
						status: "running",
						runtime_app: "cursor",
						runtime_version: "0.50.1",
					},
				],
			}),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AgentHeartbeatResponse;
		expect(data.updated).toBe(1);
		expect(data.created).toBe(0);

		// Verify the agent was updated
		const agentRes = await fetch(`${BASE}/api/agents/${preRegisteredAgentId}`, {
			headers: writeHeaders(),
		});
		expect(agentRes.status).toBe(200);
		const agent = (await agentRes.json()) as {
			status: string;
			runtime_app: string;
			runtime_version: string;
		};
		expect(agent.status).toBe("running");
		expect(agent.runtime_app).toBe("cursor");
		expect(agent.runtime_version).toBe("0.50.1");
	});

	test("POST /api/agents/heartbeat → 200 (creates new agent)", async () => {
		const newMatchKey = `e2e_hb_mk_new_${SUFFIX}`;
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: SOURCE_KEY,
				agents: [
					{
						match_key: `e2e_hb_mk_existing_${SUFFIX}`,
						status: "running",
					},
					{
						match_key: newMatchKey,
						status: "stopped",
						runtime_app: "windsurf",
					},
				],
			}),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AgentHeartbeatResponse;
		expect(data.created).toBe(1);
		expect(data.updated).toBe(1);
	});

	test("POST /api/agents/heartbeat → 200 (marks missing)", async () => {
		// Report only the new agent, not the pre-registered one → pre-registered becomes missing
		const res = await fetch(`${BASE}/api/agents/heartbeat`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: SOURCE_KEY,
				agents: [
					{
						match_key: `e2e_hb_mk_new_${SUFFIX}`,
						status: "running",
					},
				],
			}),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AgentHeartbeatResponse;
		expect(data.missing).toBeGreaterThanOrEqual(1);

		// Verify pre-registered agent is now missing
		const agentRes = await fetch(`${BASE}/api/agents/${preRegisteredAgentId}`, {
			headers: writeHeaders(),
		});
		expect(agentRes.status).toBe(200);
		const agent = (await agentRes.json()) as { status: string };
		expect(agent.status).toBe("missing");
	});
});
