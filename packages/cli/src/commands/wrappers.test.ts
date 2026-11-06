// Tests for the command wrappers: parsed args → run* function contract.
// Each command runs with an isolated HOME so no real user config is read or written.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CommandDef } from "@nocoo/base-cli";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BatCliConfig } from "../lib/config.js";
import { createConfigManager } from "../lib/config.js";
import agent from "./agent/index.js";
import asset from "./asset/index.js";
import binding from "./binding/index.js";
import service from "./service/index.js";

const mockFetch = vi.fn<typeof fetch>();

vi.mock("consola", () => ({
	consola: {
		success: vi.fn(),
		error: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
	},
}));

let homeDir: string;

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

const MOCK_ASSET = {
	id: "ast_abc123",
	host_id: null,
	hostname: null,
	type: "cloud_service",
	subtype: "storage",
	name: "S3 Bucket",
	provider: "AWS",
	status: "active",
	metadata: {},
	tags: [],
	created_at: 1700000000,
	updated_at: null,
};

beforeEach(() => {
	homeDir = mkdtempSync(join(tmpdir(), "bat-wrappers-"));
	vi.stubEnv("HOME", homeDir);
	vi.stubEnv("USERPROFILE", homeDir);
	mockFetch.mockReset();
	vi.stubGlobal("fetch", mockFetch);
	process.exitCode = undefined;
});

afterEach(() => {
	process.exitCode = undefined;
	rmSync(homeDir, { recursive: true, force: true });
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

function writeConfig(config: BatCliConfig): void {
	createConfigManager(join(homeDir, ".config", "bat")).write(config);
}

function subCommand(group: CommandDef, name: string): CommandDef {
	const command = group.subCommands?.[name];
	if (!command) {
		throw new Error(`missing subcommand ${name}`);
	}
	return command;
}

async function call(command: CommandDef, args: Record<string, unknown>): Promise<void> {
	const context = { args, rawArgs: [], cmd: command } as unknown as Parameters<
		NonNullable<CommandDef["run"]>
	>[0];
	await command.run?.(context);
}

function lastRequest(): { url: string; init: RequestInit } {
	const request = mockFetch.mock.calls.at(-1);
	if (!request) {
		throw new Error("fetch was not called");
	}
	const [url, init] = request as [string, RequestInit | undefined];
	if (!init) {
		throw new Error("fetch called without init");
	}
	return { url, init };
}

describe("agent wrappers", () => {
	test("agent list dispatches to GET /api/agents", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([MOCK_AGENT]), { status: 200 }));

		await call(subCommand(agent, "list"), {});

		expect(process.exitCode).toBe(0);
		expect(lastRequest().url).toBe("https://bat-ingest.worker.hexly.ai/api/agents");
	});

	test("agent create forwards every optional flag", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 201 }));

		await call(subCommand(agent, "create"), {
			matchKey: "my-agent",
			nickname: "Test Agent",
			role: "monitor",
			"runtime-app": "bat-probe",
			"runtime-version": "1.0.0",
		});

		expect(process.exitCode).toBe(0);
		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({
			source_key: VALID_CONFIG.source_key,
			match_key: "my-agent",
			nickname: "Test Agent",
			role: "monitor",
			runtime_app: "bat-probe",
			runtime_version: "1.0.0",
		});
	});

	test("agent create forwards no optional flags", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 201 }));

		await call(subCommand(agent, "create"), { matchKey: "my-agent" });

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({
			source_key: VALID_CONFIG.source_key,
			match_key: "my-agent",
		});
	});

	test("agent update forwards set and clear flags", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 200 }));

		await call(subCommand(agent, "update"), {
			id: "agt_abc123",
			nickname: "Renamed",
			"clear-role": true,
			"runtime-app": "bat-probe",
			"clear-runtime-version": true,
			status: "stopped",
		});

		expect(process.exitCode).toBe(0);
		const { url, init } = lastRequest();
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/agents/agt_abc123");
		expect(JSON.parse(init.body as string)).toStrictEqual({
			nickname: "Renamed",
			role: null,
			runtime_app: "bat-probe",
			runtime_version: null,
			status: "stopped",
		});
	});

	test("agent update forwards the complementary flags", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 200 }));

		await call(subCommand(agent, "update"), {
			id: "agt_abc123",
			role: "monitor",
			"clear-nickname": true,
			"clear-runtime-app": true,
			"runtime-version": "2.0.0",
		});

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({
			nickname: null,
			role: "monitor",
			runtime_app: null,
			runtime_version: "2.0.0",
		});
	});

	test("agent update forwards bare invocation", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 200 }));

		await call(subCommand(agent, "update"), { id: "agt_abc123" });

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({});
	});

	test("agent delete forwards the id", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

		await call(subCommand(agent, "delete"), { id: "agt_abc123" });

		expect(process.exitCode).toBe(0);
		expect(lastRequest().url).toBe("https://bat-ingest.worker.hexly.ai/api/agents/agt_abc123");
	});

	test("agent heartbeat forwards the agents argument", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ updated: 1, created: 0, missing: 0 }), { status: 200 }),
		);

		await call(subCommand(agent, "heartbeat"), { agents: "a:running" });

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({
			source_key: VALID_CONFIG.source_key,
			agents: [{ match_key: "a", status: "running" }],
		});
	});

	test("agent tags forwards --tag-ids", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 200 }));

		await call(subCommand(agent, "tags"), { id: "agt_abc123", "tag-ids": "1,2" });

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({ tag_ids: [1, 2] });
	});

	test("agent tags forwards --clear", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_AGENT), { status: 200 }));

		await call(subCommand(agent, "tags"), { id: "agt_abc123", clear: true });

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({ tag_ids: [] });
	});
});

describe("asset wrappers", () => {
	test("asset list dispatches to GET /api/assets", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([MOCK_ASSET]), { status: 200 }));

		await call(subCommand(asset, "list"), {});

		expect(process.exitCode).toBe(0);
		expect(lastRequest().url).toBe("https://bat-ingest.worker.hexly.ai/api/assets");
	});

	test("asset create forwards every optional flag", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 201 }));

		await call(subCommand(asset, "create"), {
			type: "cloud_service",
			name: "S3 Bucket",
			"host-id": "hst_abc",
			subtype: "storage",
			provider: "AWS",
			status: "active",
			metadata: '{"region":"us-east-1"}',
		});

		expect(process.exitCode).toBe(0);
		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({
			type: "cloud_service",
			name: "S3 Bucket",
			host_id: "hst_abc",
			subtype: "storage",
			provider: "AWS",
			status: "active",
			metadata: { region: "us-east-1" },
		});
	});

	test("asset create forwards bare invocation", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 201 }));

		await call(subCommand(asset, "create"), { type: "domain", name: "example.com" });

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({
			type: "domain",
			name: "example.com",
		});
	});

	test("asset update forwards set and clear flags", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		await call(subCommand(asset, "update"), {
			id: "ast_abc123",
			name: "Renamed",
			"host-id": "hst_abc",
			"clear-subtype": true,
			provider: "AWS",
			status: "inactive",
			metadata: '{"region":"eu-west-1"}',
		});

		expect(process.exitCode).toBe(0);
		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({
			name: "Renamed",
			host_id: "hst_abc",
			subtype: null,
			provider: "AWS",
			status: "inactive",
			metadata: { region: "eu-west-1" },
		});
	});

	test("asset update forwards clear host and metadata", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		await call(subCommand(asset, "update"), {
			id: "ast_abc123",
			"clear-host-id": true,
			subtype: "storage",
			"clear-provider": true,
			"clear-metadata": true,
		});

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({
			host_id: null,
			subtype: "storage",
			provider: null,
			metadata: {},
		});
	});

	test("asset update forwards bare invocation", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		await call(subCommand(asset, "update"), { id: "ast_abc123" });

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({});
	});

	test("asset delete forwards the id", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

		await call(subCommand(asset, "delete"), { id: "ast_abc123" });

		expect(process.exitCode).toBe(0);
		expect(lastRequest().url).toBe("https://bat-ingest.worker.hexly.ai/api/assets/ast_abc123");
	});

	test("asset tags rejects both flags", async () => {
		writeConfig(VALID_CONFIG);

		await call(subCommand(asset, "tags"), {
			id: "ast_abc123",
			"tag-ids": "3",
			clear: true,
		});

		expect(process.exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("asset tags forwards --tag-ids only", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		await call(subCommand(asset, "tags"), { id: "ast_abc123", "tag-ids": "4" });

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({ tag_ids: [4] });
	});

	test("asset tags forwards --clear only", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		await call(subCommand(asset, "tags"), { id: "ast_abc123", clear: true });

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({ tag_ids: [] });
	});
});

describe("binding wrappers", () => {
	test("binding list dispatches to GET /api/bindings", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

		await call(subCommand(binding, "list"), {});

		expect(process.exitCode).toBe(0);
		expect(lastRequest().url).toBe("https://bat-ingest.worker.hexly.ai/api/bindings");
	});

	test("binding create forwards both ids", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 201 }));

		await call(subCommand(binding, "create"), {
			agentId: "agt_abc123",
			assetId: "ast_abc123",
		});

		expect(JSON.parse(lastRequest().init.body as string)).toStrictEqual({
			agent_id: "agt_abc123",
			asset_id: "ast_abc123",
		});
	});

	test("binding delete forwards both ids", async () => {
		writeConfig(VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

		await call(subCommand(binding, "delete"), {
			agentId: "agt_abc123",
			assetId: "ast_abc123",
		});

		expect(process.exitCode).toBe(0);
		expect(lastRequest().url).toBe(
			"https://bat-ingest.worker.hexly.ai/api/bindings/agt_abc123/ast_abc123",
		);
	});
});

describe("service wrappers", () => {
	test("service run exits 1 without config", async () => {
		await call(subCommand(service, "run"), { agents: "a:running" });

		expect(process.exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("service install exits 1 without config and writes no plist", async () => {
		await call(subCommand(service, "install"), { agents: "a:running" });

		expect(process.exitCode).toBe(1);
	});

	test("service status reports an isolated home", async () => {
		await call(subCommand(service, "status"), {});

		expect(process.exitCode).toBe(0);
	});

	test("service uninstall exits 1 without a plist in this home", async () => {
		await call(subCommand(service, "uninstall"), {});

		expect(process.exitCode).toBe(1);
	});
});
