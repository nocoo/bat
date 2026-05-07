// Tests for bat-cli binding commands (list, create, delete)

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager } from "../../lib/config.js";
import { runBindingCreate } from "./create.js";
import { runBindingDelete } from "./delete.js";
import { runBindingList } from "./list.js";

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

const MOCK_BINDING = {
	agent_id: "agt_abc123",
	agent_nickname: "Test Agent",
	asset_id: "ast_xyz789",
	asset_name: "S3 Bucket",
	asset_type: "cloud_service",
	created_at: 1700000000,
};

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "bat-cli-binding-"));
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

// --- binding list ---

describe("runBindingList", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingList(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 0 and prints table when bindings exist", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([MOCK_BINDING]), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingList(manager);
		expect(exitCode).toBe(0);

		const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/bindings");
	});

	test("returns 0 when no bindings", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingList(manager);
		expect(exitCode).toBe(0);
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingList(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 1 on network error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingList(manager);
		expect(exitCode).toBe(1);
	});
});

// --- binding create ---

describe("runBindingCreate", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingCreate(manager, {
			agentId: "agt_abc",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(1);
	});

	test("creates binding successfully", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ agent_id: "agt_abc", asset_id: "ast_xyz" }), { status: 201 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingCreate(manager, {
			agentId: "agt_abc",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(0);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/bindings");
		expect(init.method).toBe("POST");
		const body = JSON.parse(init.body as string);
		expect(body.agent_id).toBe("agt_abc");
		expect(body.asset_id).toBe("ast_xyz");
	});

	test("returns 0 on idempotent create (200)", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ agent_id: "agt_abc", asset_id: "ast_xyz" }), { status: 200 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingCreate(manager, {
			agentId: "agt_abc",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(0);
	});

	test("returns 1 on 400 (invalid agent/asset)", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "agent_id not found" }), { status: 400 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingCreate(manager, {
			agentId: "agt_nonexistent",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(1);
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingCreate(manager, {
			agentId: "agt_abc",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(1);
	});

	test("returns 1 on network error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingCreate(manager, {
			agentId: "agt_abc",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(1);
	});
});

// --- binding delete ---

describe("runBindingDelete", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingDelete(manager, {
			agentId: "agt_abc",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(1);
	});

	test("deletes binding successfully", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingDelete(manager, {
			agentId: "agt_abc",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(0);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/bindings/agt_abc/ast_xyz");
		expect(init.method).toBe("DELETE");
	});

	test("returns 1 on 404", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Binding not found" }), { status: 404 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingDelete(manager, {
			agentId: "agt_nonexistent",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(1);
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingDelete(manager, {
			agentId: "agt_abc",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(1);
	});

	test("returns 1 on network error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const manager = createConfigManager(tempDir);
		const exitCode = await runBindingDelete(manager, {
			agentId: "agt_abc",
			assetId: "ast_xyz",
		});
		expect(exitCode).toBe(1);
	});
});
