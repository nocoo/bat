// Tests for bat-cli asset commands (list, create, update, delete, tags)

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager } from "../../lib/config.js";
import { runAssetCreate } from "./create.js";
import { runAssetDelete } from "./delete.js";
import { runAssetList } from "./list.js";
import { runAssetTags } from "./tags.js";
import { runAssetUpdate } from "./update.js";

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
	tempDir = mkdtempSync(join(tmpdir(), "bat-cli-asset-"));
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

// --- asset list ---

describe("runAssetList", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetList(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 0 and prints table when assets exist", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([MOCK_ASSET]), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetList(manager);
		expect(exitCode).toBe(0);

		const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/assets");
	});

	test("returns 0 when no assets", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetList(manager);
		expect(exitCode).toBe(0);
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetList(manager);
		expect(exitCode).toBe(1);
	});

	test("returns 1 on network error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetList(manager);
		expect(exitCode).toBe(1);
	});
});

// --- asset create ---

describe("runAssetCreate", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, { type: "domain", name: "example.com" });
		expect(exitCode).toBe(1);
	});

	test("creates asset with required fields", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 201 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, { type: "cloud_service", name: "S3 Bucket" });
		expect(exitCode).toBe(0);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/assets");
		expect(init.method).toBe("POST");
		const body = JSON.parse(init.body as string);
		expect(body.type).toBe("cloud_service");
		expect(body.name).toBe("S3 Bucket");
	});

	test("creates asset with all optional fields", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 201 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, {
			type: "cloud_service",
			name: "S3 Bucket",
			hostId: "hst_abc",
			subtype: "storage",
			provider: "AWS",
			status: "active",
			metadata: '{"region":"us-east-1"}',
		});
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.host_id).toBe("hst_abc");
		expect(body.subtype).toBe("storage");
		expect(body.provider).toBe("AWS");
		expect(body.status).toBe("active");
		expect(body.metadata).toEqual({ region: "us-east-1" });
	});

	test("rejects invalid type", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, { type: "invalid", name: "test" });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects invalid status", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, {
			type: "domain",
			name: "test",
			status: "bogus",
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects invalid metadata JSON", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, {
			type: "domain",
			name: "test",
			metadata: "not-json",
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects metadata that is an array", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, {
			type: "domain",
			name: "test",
			metadata: "[1,2,3]",
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects metadata that is null", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, {
			type: "domain",
			name: "test",
			metadata: "null",
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects metadata that is a primitive", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, {
			type: "domain",
			name: "test",
			metadata: '"hello"',
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects oversized metadata", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		// 4096 byte limit — create a value that exceeds it
		const big = JSON.stringify({ data: "x".repeat(5000) });
		const exitCode = await runAssetCreate(manager, {
			type: "domain",
			name: "test",
			metadata: big,
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetCreate(manager, { type: "domain", name: "test" });
		expect(exitCode).toBe(1);
	});
});

// --- asset update ---

describe("runAssetUpdate", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { name: "new" });
		expect(exitCode).toBe(1);
	});

	test("updates asset name", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ ...MOCK_ASSET, name: "New Name" }), { status: 200 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { name: "New Name" });
		expect(exitCode).toBe(0);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/assets/ast_abc");
		expect(init.method).toBe("PATCH");
		const body = JSON.parse(init.body as string);
		expect(body.name).toBe("New Name");
	});

	test("clears host_id with --clear-host-id", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { clearHostId: true });
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.host_id).toBeNull();
	});

	test("clears subtype with --clear-subtype", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { clearSubtype: true });
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.subtype).toBeNull();
	});

	test("clears provider with --clear-provider", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { clearProvider: true });
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.provider).toBeNull();
	});

	test("clears metadata with --clear-metadata", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { clearMetadata: true });
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.metadata).toEqual({});
	});

	// Mutual exclusion tests
	test("rejects --host-id and --clear-host-id together", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", {
			hostId: "hst_x",
			clearHostId: true,
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects --subtype and --clear-subtype together", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", {
			subtype: "x",
			clearSubtype: true,
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects --provider and --clear-provider together", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", {
			provider: "x",
			clearProvider: true,
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects --metadata and --clear-metadata together", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", {
			metadata: "{}",
			clearMetadata: true,
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	// Status validation
	test("accepts valid status values", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { status: "inactive" });
		expect(exitCode).toBe(0);
	});

	test("rejects invalid status", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { status: "bogus" });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects invalid metadata JSON", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { metadata: "not-json" });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects metadata that is an array", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { metadata: "[1,2]" });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects metadata that is null", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { metadata: "null" });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects metadata that is a primitive", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { metadata: "42" });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects oversized metadata", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const big = JSON.stringify({ data: "x".repeat(5000) });
		const exitCode = await runAssetUpdate(manager, "ast_abc", { metadata: big });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("returns 1 on 404", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Asset not found" }), { status: 404 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_nonexistent", { name: "x" });
		expect(exitCode).toBe(1);
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetUpdate(manager, "ast_abc", { name: "x" });
		expect(exitCode).toBe(1);
	});
});

// --- asset delete ---

describe("runAssetDelete", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetDelete(manager, "ast_abc");
		expect(exitCode).toBe(1);
	});

	test("deletes asset successfully", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetDelete(manager, "ast_abc");
		expect(exitCode).toBe(0);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/assets/ast_abc");
		expect(init.method).toBe("DELETE");
	});

	test("returns 1 on 404", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Asset not found" }), { status: 404 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetDelete(manager, "ast_nonexistent");
		expect(exitCode).toBe(1);
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetDelete(manager, "ast_abc");
		expect(exitCode).toBe(1);
	});

	test("returns 1 on network error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetDelete(manager, "ast_abc");
		expect(exitCode).toBe(1);
	});
});

// --- asset tags ---

describe("runAssetTags", () => {
	test("returns 1 when no config", async () => {
		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", { tagIds: "1,2" });
		expect(exitCode).toBe(1);
	});

	test("sets tag IDs on asset", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		const assetWithTags = {
			...MOCK_ASSET,
			tags: [
				{ id: 1, name: "web", color: 0 },
				{ id: 3, name: "prod", color: 1 },
			],
		};
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(assetWithTags), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", { tagIds: "1,3" });
		expect(exitCode).toBe(0);

		const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://bat-ingest.worker.hexly.ai/api/assets/ast_abc/tags");
		expect(init.method).toBe("PUT");
		const body = JSON.parse(init.body as string);
		expect(body.tag_ids).toEqual([1, 3]);
	});

	test("deduplicates tag IDs", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(new Response(JSON.stringify(MOCK_ASSET), { status: 200 }));

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", { tagIds: "1,2,1,3,2" });
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.tag_ids).toEqual([1, 2, 3]);
	});

	test("clears all tags with --clear", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ ...MOCK_ASSET, tags: [] }), { status: 200 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", { clear: true });
		expect(exitCode).toBe(0);

		const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
		const body = JSON.parse(init.body as string);
		expect(body.tag_ids).toEqual([]);
	});

	test("rejects --tag-ids and --clear together", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", { tagIds: "1,2", clear: true });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects non-integer tag IDs", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", { tagIds: "1,abc" });
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("rejects more than MAX_TAGS_PER_ASSET unique IDs", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", {
			tagIds: "1,2,3,4,5,6,7,8,9,10,11",
		});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("returns 1 when no --tag-ids and no --clear", async () => {
		writeConfig(tempDir, VALID_CONFIG);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", {});
		expect(exitCode).toBe(1);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	test("returns 1 on 404", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Asset not found" }), { status: 404 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_nonexistent", { tagIds: "1" });
		expect(exitCode).toBe(1);
	});

	test("returns 1 on auth error", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Invalid API key" }), { status: 403 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", { tagIds: "1" });
		expect(exitCode).toBe(1);
	});

	test("returns 1 on 400 (invalid tag IDs)", async () => {
		writeConfig(tempDir, VALID_CONFIG);
		mockFetch.mockResolvedValueOnce(
			new Response(JSON.stringify({ error: "Tag IDs not found: 999" }), { status: 400 }),
		);

		const manager = createConfigManager(tempDir);
		const exitCode = await runAssetTags(manager, "ast_abc", { tagIds: "999" });
		expect(exitCode).toBe(1);
	});
});
