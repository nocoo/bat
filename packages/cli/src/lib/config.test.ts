// Tests for CLI configuration management

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { BatCliConfig } from "./config.js";
import {
	createConfigManager,
	generateSourceKey,
	getConfigDir,
	getHeartbeatInterval,
	validateConfig,
} from "./config.js";

let tempDir: string;

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "bat-cli-config-"));
});

afterEach(() => {
	rmSync(tempDir, { recursive: true, force: true });
});

describe("createConfigManager", () => {
	test("creates manager with custom config dir", () => {
		const manager = createConfigManager(tempDir);
		expect(manager.configDir).toBe(tempDir);
	});

	test("creates manager with default config dir", () => {
		const manager = createConfigManager();
		expect(manager.configDir).toBe(getConfigDir());
	});

	test("uses dev filename when isDev=true", () => {
		const manager = createConfigManager(tempDir, true);
		expect(manager.configPath).toContain("config.dev.json");
	});

	test("uses prod filename by default", () => {
		const manager = createConfigManager(tempDir);
		expect(manager.configPath).toContain("config.json");
	});
});

describe("config read/write roundtrip", () => {
	test("write + read preserves all fields", () => {
		const manager = createConfigManager(tempDir);
		const config: BatCliConfig = {
			worker_url: "https://bat.hexly.ai",
			api_key: "bat_test_token_123",
			source_key: "550e8400-e29b-41d4-a716-446655440000",
			heartbeat_interval: 120,
		};
		manager.write(config);
		const loaded = manager.read();
		expect(loaded).toEqual(config);
	});

	test("read returns empty object when no config file", () => {
		const manager = createConfigManager(tempDir);
		const loaded = manager.read();
		expect(loaded).toEqual({});
	});

	test("write merges with existing config", () => {
		const manager = createConfigManager(tempDir);
		manager.write({
			worker_url: "https://bat.hexly.ai",
			api_key: "token1",
			source_key: "sk1",
		} as BatCliConfig);
		manager.write({ api_key: "token2" } as Partial<BatCliConfig>);
		const loaded = manager.read();
		expect(loaded.worker_url).toBe("https://bat.hexly.ai");
		expect(loaded.api_key).toBe("token2");
		expect(loaded.source_key).toBe("sk1");
	});

	test("exists() returns false before write, true after", () => {
		const manager = createConfigManager(tempDir);
		expect(manager.exists()).toBe(false);
		manager.write({
			worker_url: "https://bat.hexly.ai",
			api_key: "t",
			source_key: "s",
		} as BatCliConfig);
		expect(manager.exists()).toBe(true);
	});

	test("delete() removes config file", () => {
		const manager = createConfigManager(tempDir);
		manager.write({
			worker_url: "https://bat.hexly.ai",
			api_key: "t",
			source_key: "s",
		} as BatCliConfig);
		expect(manager.exists()).toBe(true);
		manager.delete();
		expect(manager.exists()).toBe(false);
	});
});

describe("generateSourceKey", () => {
	test("returns a valid UUID string", () => {
		const key = generateSourceKey();
		expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
	});

	test("generates unique values", () => {
		const keys = new Set(Array.from({ length: 10 }, () => generateSourceKey()));
		expect(keys.size).toBe(10);
	});
});

describe("getHeartbeatInterval", () => {
	test("returns config value when set", () => {
		const config: BatCliConfig = {
			worker_url: "https://bat.hexly.ai",
			api_key: "t",
			source_key: "s",
			heartbeat_interval: 120,
		};
		expect(getHeartbeatInterval(config)).toBe(120);
	});

	test("returns default 60 when not set", () => {
		const config: BatCliConfig = {
			worker_url: "https://bat.hexly.ai",
			api_key: "t",
			source_key: "s",
		};
		expect(getHeartbeatInterval(config)).toBe(60);
	});
});

describe("validateConfig", () => {
	test("returns null for valid config", () => {
		const config: BatCliConfig = {
			worker_url: "https://bat.hexly.ai",
			api_key: "bat_token",
			source_key: "550e8400-e29b-41d4-a716-446655440000",
		};
		expect(validateConfig(config)).toBeNull();
	});

	test("returns error when worker_url is missing", () => {
		const config = {
			api_key: "t",
			source_key: "s",
		} as unknown as BatCliConfig;
		expect(validateConfig(config)).toContain("worker_url");
	});

	test("returns error when api_key is missing", () => {
		const config = {
			worker_url: "https://bat.hexly.ai",
			source_key: "s",
		} as unknown as BatCliConfig;
		expect(validateConfig(config)).toContain("api_key");
	});

	test("returns error when source_key is missing", () => {
		const config = {
			worker_url: "https://bat.hexly.ai",
			api_key: "t",
		} as unknown as BatCliConfig;
		expect(validateConfig(config)).toContain("source_key");
	});
});
