// Tests for bat-cli login command

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BatCliConfig } from "../lib/config.js";
import { createConfigManager } from "../lib/config.js";
import { runLogin } from "./login.js";

// Mock @nocoo/base-cli login flow
vi.mock("@nocoo/base-cli", async (importOriginal) => {
	const original = await importOriginal<typeof import("@nocoo/base-cli")>();
	return {
		...original,
		performLogin: vi.fn(),
		openBrowser: vi.fn(),
	};
});

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
	tempDir = mkdtempSync(join(tmpdir(), "bat-cli-login-"));
	vi.clearAllMocks();
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe("runLogin", () => {
	test("saves config on successful login", async () => {
		const { performLogin } = await import("@nocoo/base-cli");
		const mockPerformLogin = vi.mocked(performLogin);

		mockPerformLogin.mockImplementation(async (deps) => {
			deps.onSaveToken("test-token-abc123");
			return {
				success: true,
				email: "user@example.com",
				params: { worker_url: "https://bat.hexly.ai", api_key: "test-token-abc123", state: "x" },
			};
		});

		const manager = createConfigManager(tempDir);
		const exitCode = await runLogin(manager, "https://bat.hexly.ai");

		expect(exitCode).toBe(0);
		expect(manager.exists()).toBe(true);

		const config = manager.read();
		expect(config.worker_url).toBe("https://bat.hexly.ai");
		expect(config.api_key).toBe("test-token-abc123");
		expect(config.source_key).toBeTruthy();
		// source_key should be a UUID
		expect(config.source_key).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	test("preserves existing source_key on re-login", async () => {
		const { performLogin } = await import("@nocoo/base-cli");
		const mockPerformLogin = vi.mocked(performLogin);

		// Pre-create config with an existing source_key
		const manager = createConfigManager(tempDir);
		manager.write({
			worker_url: "https://old.hexly.ai",
			api_key: "old-token",
			source_key: "existing-source-key-uuid",
		} as BatCliConfig);

		mockPerformLogin.mockImplementation(async (deps) => {
			deps.onSaveToken("new-token");
			return {
				success: true,
				params: { worker_url: "https://bat.hexly.ai", api_key: "new-token", state: "x" },
			};
		});

		const exitCode = await runLogin(manager, "https://bat.hexly.ai");

		expect(exitCode).toBe(0);
		const config = manager.read();
		expect(config.api_key).toBe("new-token");
		expect(config.source_key).toBe("existing-source-key-uuid");
	});

	test("returns 1 when login fails", async () => {
		const { performLogin } = await import("@nocoo/base-cli");
		const mockPerformLogin = vi.mocked(performLogin);

		mockPerformLogin.mockResolvedValue({
			success: false,
			error: "Login timeout",
		});

		const manager = createConfigManager(tempDir);
		const exitCode = await runLogin(manager, "https://bat.hexly.ai");

		expect(exitCode).toBe(1);
		expect(manager.exists()).toBe(false);
	});

	test("returns 1 when no worker_url in response", async () => {
		const { performLogin } = await import("@nocoo/base-cli");
		const mockPerformLogin = vi.mocked(performLogin);

		mockPerformLogin.mockImplementation(async (deps) => {
			deps.onSaveToken("token");
			return { success: true, params: { state: "x" } };
		});

		const manager = createConfigManager(tempDir);
		const exitCode = await runLogin(manager, "https://bat.hexly.ai");

		expect(exitCode).toBe(1);
	});

	test("passes correct login parameters to performLogin", async () => {
		const { performLogin } = await import("@nocoo/base-cli");
		const mockPerformLogin = vi.mocked(performLogin);

		mockPerformLogin.mockImplementation(async (deps) => {
			deps.onSaveToken("tok");
			return {
				success: true,
				params: { worker_url: "https://bat.hexly.ai", api_key: "tok", state: "x" },
			};
		});

		const manager = createConfigManager(tempDir);
		await runLogin(manager, "https://bat.hexly.ai");

		expect(mockPerformLogin).toHaveBeenCalledOnce();
		const callArgs = mockPerformLogin.mock.calls[0]?.[0];
		expect(callArgs?.apiUrl).toBe("https://bat.hexly.ai");
		expect(callArgs?.loginPath).toBe("/api/auth/cli");
		expect(callArgs?.tokenParam).toBe("api_key");
		expect(callArgs?.timeoutMs).toBe(120_000);
	});
});
