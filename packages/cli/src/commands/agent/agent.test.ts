// Tests for bat-cli agent commands (list, create, update, delete, heartbeat)

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager } from "../../lib/config.js";
import { runAgentCreate } from "./create.js";
import { runAgentDelete } from "./delete.js";
import { runAgentHeartbeat } from "./heartbeat.js";
import { runAgentList } from "./list.js";
import { runAgentUpdate } from "./update.js";

// Mock fetch globally
const mockFetch = vi.fn<typeof fetch>();

// Mock consola to suppress output during tests
vi.mock("consola", () => ({
	consola: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	},
}));

let tempDir: string;

const VALID_CONFIG: BatCliConfig = {
	worker_url: "https://bat-ingest.worker.hexly.ai",
	api_key: "test-cli-token",
	source_key: "550e8400-e29b-41d4-a716-446655440000",
};

const MOCK_AGENT = {
	id: "agt_abc123",
	host_id: null,
	hostname: null,
	source_key_short: "550e8400",
	match_key: "my-agent",
	nickname: "Test Agent",
	role: "monitor",
	runtime_app: "bat-probe",
	runtime_version: "1.0.0",
	status: "running",
	metadata: {},
	tags: [],
	created_at: 1700000000,
	last_seen_at: 1700001000,
};

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "bat-cli-agent-"));
	mockFetch.mockReset();
	vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

function writeConfig(dir: string, config: BatCliConfig): void {
	const manager = createConfigManager(dir);
	manager.write(config);
}

// --- agent list ---

describe("runAgentList", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentList(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 0 and prints table when agents exist", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([MOCK_AGENT]), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentList(manager);
		expect(exitCode).toBe(0);

		const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/agents");
	});

	test("returns 0 when no agents", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentList(manager);
		expect(exitCode).toBe(0);
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentList(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 1 on network error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentList(manager);
		expect(exitCode).toBe(1);
	});
});

// --- agent create ---

describe("runAgentCreate", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentCreate(manager, { matchKey: "test" });
		expect(exitCode).toBe(1);
	});

	test("returns 0 on successful create", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 201 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentCreate(manager, { matchKey: "my-agent" });
		expect(exitCode).toBe(0);

		// Verify request body
		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/agents");
		expect(init.method).toBe("POST");
		const body = JSON.parse(init.body as string);
		expect(body.source_key).toBe(VALID_CONFIG.source_key);
		expect(body.match_key).toBe("my-agent");
	});

	test("sends optional fields when provided", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 201 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentCreate(manager, {
			matchKey: "my-agent",
			nickname: "My Agent",
			role: "monitor",
			runtimeApp: "bat-probe",
			runtimeVersion: "1.0.0",
		});
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.nickname).toBe("My Agent");
		expect(body.role).toBe("monitor");
		expect(body.runtime_app).toBe("bat-probe");
		expect(body.runtime_version).toBe("1.0.0");
	});

	test("omits optional fields when not provided", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 201 }));

		const manager = createConfigManager(tempDir);
		await runAgentCreate(manager, { matchKey: "my-agent" });

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.nickname).toBeUndefined();
		expect(body.role).toBeUndefined();
		expect(body.runtime_app).toBeUndefined();
		expect(body.runtime_version).toBeUndefined();
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentCreate(manager, { matchKey: "test" });
		expect(exitCode).toBe(1);
	});
});

// --- agent update ---

describe("runAgentUpdate", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentUpdate(manager, "agt_abc", {});
		expect(exitCode).toBe(1);
	});

	test("returns 0 on successful update", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentUpdate(manager, "agt_abc123", {
			nickname: "New Name",
		});
		expect(exitCode).toBe(0);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/agents/agt_abc123");
		expect(init.method).toBe("PATCH");
		const body = JSON.parse(init.body as string);
		expect(body.nickname).toBe("New Name");
	});

	test("sends null for cleared fields", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ ...MOCK_AGENT, nickname: null }), { status: 200 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentUpdate(manager, "agt_abc123", {
			clearNickname: true,
		});
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.nickname).toBeNull();
	});

	test("sends status field", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ ...MOCK_AGENT, status: "stopped" }), { status: 200 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentUpdate(manager, "agt_abc123", {
			status: "stopped",
		});
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.status).toBe("stopped");
	});

	test("returns 1 when agent not found (404)", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Agent not found" }), { status: 404 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentUpdate(manager, "agt_nonexistent", {
			nickname: "test",
		});
		expect(exitCode).toBe(1);
	});

	test("clearRole sends null for role", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ ...MOCK_AGENT, role: null }), { status: 200 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentUpdate(manager, "agt_abc123", {
			clearRole: true,
		});
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.role).toBeNull();
	});
});

// --- agent delete ---

describe("runAgentDelete", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentDelete(manager, "agt_abc");
		expect(exitCode).toBe(1);
	});

	test("returns 0 on successful delete", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentDelete(manager, "agt_abc123");
		expect(exitCode).toBe(0);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/agents/agt_abc123");
		expect(init.method).toBe("DELETE");
	});

	test("returns 1 when agent not found (404)", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Agent not found" }), { status: 404 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentDelete(manager, "agt_nonexistent");
		expect(exitCode).toBe(1);
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentDelete(manager, "agt_abc123");
		expect(exitCode).toBe(1);
	});

	test("returns 1 on network error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentDelete(manager, "agt_abc123");
		expect(exitCode).toBe(1);
	});
});

// --- agent heartbeat ---

describe("runAgentHeartbeat", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, "agent1:running");
		expect(exitCode).toBe(1);
	});

	test("returns 0 on successful heartbeat", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ updated: 1, created: 0, missing: 0 }), { status: 200 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, "agent1:running");
		expect(exitCode).toBe(0);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/agents/heartbeat");
		expect(init.method).toBe("POST");
		const body = JSON.parse(init.body as string);
		expect(body.source_key).toBe(VALID_CONFIG.source_key);
		expect(body.agents).toHaveLength(1);
		expect(body.agents[0].match_key).toBe("agent1");
		expect(body.agents[0].status).toBe("running");
	});

	test("sends multiple agents", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ updated: 2, created: 0, missing: 1 }), { status: 200 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, "agent1:running,agent2:stopped");
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.agents).toHaveLength(2);
		expect(body.agents[0].match_key).toBe("agent1");
		expect(body.agents[0].status).toBe("running");
		expect(body.agents[1].match_key).toBe("agent2");
		expect(body.agents[1].status).toBe("stopped");
	});

	test("returns 1 for invalid status", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, "agent1:missing");
		expect(exitCode).toBe(1);
		// Should not have called fetch
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("returns 1 for invalid format (no colon)", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, "agent1running");
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("returns 1 for empty agents string", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, "");
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("returns 1 for duplicate match_key", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, "agent1:running,agent1:stopped");
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, "agent1:running");
		expect(exitCode).toBe(1);
	});

	test("returns 1 on network error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, "agent1:running");
		expect(exitCode).toBe(1);
	});

	test("trims whitespace in agents string", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ updated: 2, created: 0, missing: 0 }), { status: 200 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAgentHeartbeat(manager, " agent1 : running , agent2 : stopped ");
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.agents[0].match_key).toBe("agent1");
		expect(body.agents[1].match_key).toBe("agent2");
	});
});
