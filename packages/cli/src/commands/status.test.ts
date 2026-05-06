// Tests for bat-cli status command

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BatCliConfig } from "../lib/config.js";
import { createConfigManager } from "../lib/config.js";
import { runStatus } from "./status.js";

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

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "bat-cli-status-"));
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

const VALID_CONFIG: BatCliConfig = {
	worker_url: "https://bat.hexly.ai",
	api_key: "test-cli-token",
	source_key: "550e8400-e29b-41d4-a716-446655440000",
};

describe("runStatus", () => {
	test("returns 1 when no config exists", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runStatus(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 0 when config valid and API responds OK", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runStatus(manager);

		expect(exitCode).toBe(0);

		// Should have called GET /api/agents
		const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat.hexly.ai/api/agents");
	});

	test("returns 1 when token is invalid (401)", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 401 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runStatus(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 1 when token scope insufficient (403)", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Token scope insufficient" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runStatus(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 1 when network error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const manager = createConfigManager(tempDir);
		const exitCode = await runStatus(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 1 when config is incomplete", async () => {
		const manager = createConfigManager(tempDir);
		manager.write({ worker_url: "https://bat.hexly.ai" } as BatCliConfig);

		const exitCode = await runStatus(manager);
		expect(exitCode).toBe(1);
	});
});
