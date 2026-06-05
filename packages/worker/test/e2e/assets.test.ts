// L2 — Asset CRUD routes (POST/GET/PATCH/DELETE /api/assets)
// These use the localhost bypass for auth. Validates full round-trip through
// the worker including route registration, body parsing, and DB operations.

import type { AssetItem } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { assertStatus, BASE, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HOST_ID = "e2e-assets-host";
let assetId = "";

describe("L2: assets CRUD", () => {
	beforeAll(async () => {
		// Create a host for FK tests
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HOST_ID)),
		});
		assertStatus(res.status, 204, "assets beforeAll identity");
	});

	test("GET /api/assets → 200 (empty list)", async () => {
		const res = await fetch(`${BASE}/api/assets`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const data = (await res.json()) as AssetItem[];
		expect(Array.isArray(data)).toBe(true);
	});

	test("POST /api/assets → 201 (create)", async () => {
		const res = await fetch(`${BASE}/api/assets`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				type: "cloud_service",
				name: "e2e-worker",
				host_id: HOST_ID,
				subtype: "workers",
				provider: "cloudflare",
				status: "active",
			}),
		});
		expect(res.status).toBe(201);
		const data = (await res.json()) as AssetItem;
		expect(data.id).toMatch(/^ast_/);
		expect(data.type).toBe("cloud_service");
		expect(data.name).toBe("e2e-worker");
		expect(data.host_id).toBe(HOST_ID);
		expect(data.subtype).toBe("workers");
		expect(data.provider).toBe("cloudflare");
		expect(data.status).toBe("active");
		expect(data.metadata).toEqual({});
		expect(data.tags).toEqual([]);
		assetId = data.id;
	});

	test("GET /api/assets/:id → 200", async () => {
		const res = await fetch(`${BASE}/api/assets/${assetId}`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AssetItem;
		expect(data.id).toBe(assetId);
		expect(data.name).toBe("e2e-worker");
	});

	test("GET /api/assets/:id → 404 (non-existent)", async () => {
		const res = await fetch(`${BASE}/api/assets/ast_nonexistent`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("PATCH /api/assets/:id → 200 (update)", async () => {
		const res = await fetch(`${BASE}/api/assets/${assetId}`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({
				name: "e2e-patched",
				metadata: { version: "2.0" },
			}),
		});
		expect(res.status).toBe(200);
		const data = (await res.json()) as AssetItem;
		expect(data.name).toBe("e2e-patched");
		expect(data.metadata).toEqual({ version: "2.0" });
	});

	test("PATCH /api/assets/:id → 404 (non-existent)", async () => {
		const res = await fetch(`${BASE}/api/assets/ast_ghost`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({ name: "nope" }),
		});
		expect(res.status).toBe(404);
	});

	test("PATCH /api/assets/:id → 400 (invalid status)", async () => {
		const res = await fetch(`${BASE}/api/assets/${assetId}`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({ status: "bogus" }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/assets → 400 (missing required fields)", async () => {
		const res = await fetch(`${BASE}/api/assets`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ name: "only-name" }),
		});
		expect(res.status).toBe(400);
	});

	test("POST /api/assets → 400 (invalid host_id FK)", async () => {
		const res = await fetch(`${BASE}/api/assets`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				type: "domain",
				name: "fk-test",
				host_id: "nonexistent_host",
			}),
		});
		expect(res.status).toBe(400);
		const data = await res.json();
		expect((data as { error: string }).error).toContain("host_id");
	});

	test("PATCH /api/assets/:id — clear nullable field with null", async () => {
		// Create a fresh asset with subtype
		const createRes = await fetch(`${BASE}/api/assets`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				type: "domain",
				name: "nullable-test",
				subtype: "will-clear",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as AssetItem;
		expect(created.subtype).toBe("will-clear");

		try {
			// PATCH to null
			const patchRes = await fetch(`${BASE}/api/assets/${created.id}`, {
				method: "PATCH",
				headers: writeHeaders(),
				body: JSON.stringify({ subtype: null }),
			});
			expect(patchRes.status).toBe(200);
			const patched = (await patchRes.json()) as AssetItem;
			expect(patched.subtype).toBeNull();
		} finally {
			await fetch(`${BASE}/api/assets/${created.id}`, {
				method: "DELETE",
				headers: writeHeaders(),
			});
		}
	});

	test("PUT /api/assets/:id/tags → 200 (assign tags)", async () => {
		// Create a tag first (unique name to avoid 409 on re-runs)
		const tagName = `e2e-asset-tag-${Date.now()}`;
		const tagRes = await fetch(`${BASE}/api/tags`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ name: tagName }),
		});
		expect(tagRes.status).toBe(201);
		const tag = (await tagRes.json()) as { id: number; name: string };

		// Create asset
		const createRes = await fetch(`${BASE}/api/assets`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				type: "cli_tool",
				name: "tag-test-asset",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as AssetItem;

		try {
			// Assign tag
			const putRes = await fetch(`${BASE}/api/assets/${created.id}/tags`, {
				method: "PUT",
				headers: writeHeaders(),
				body: JSON.stringify({ tag_ids: [tag.id] }),
			});
			expect(putRes.status).toBe(200);
			const tagged = (await putRes.json()) as AssetItem;
			expect(tagged.tags).toHaveLength(1);
			expect(tagged.tags[0].name).toBe(tagName);

			// Clear tags
			const clearRes = await fetch(`${BASE}/api/assets/${created.id}/tags`, {
				method: "PUT",
				headers: writeHeaders(),
				body: JSON.stringify({ tag_ids: [] }),
			});
			expect(clearRes.status).toBe(200);
			const cleared = (await clearRes.json()) as AssetItem;
			expect(cleared.tags).toEqual([]);
		} finally {
			await fetch(`${BASE}/api/assets/${created.id}`, {
				method: "DELETE",
				headers: writeHeaders(),
			});
			await fetch(`${BASE}/api/tags/${tag.id}`, {
				method: "DELETE",
				headers: writeHeaders(),
			});
		}
	});

	test("PUT /api/assets/:id/tags → 400 (non-existent tags)", async () => {
		// Create asset
		const createRes = await fetch(`${BASE}/api/assets`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				type: "container",
				name: "badtag-test",
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as AssetItem;

		try {
			const putRes = await fetch(`${BASE}/api/assets/${created.id}/tags`, {
				method: "PUT",
				headers: writeHeaders(),
				body: JSON.stringify({ tag_ids: [99999] }),
			});
			expect(putRes.status).toBe(400);
		} finally {
			await fetch(`${BASE}/api/assets/${created.id}`, {
				method: "DELETE",
				headers: writeHeaders(),
			});
		}
	});

	test("DELETE /api/assets/:id → 204 (hard delete)", async () => {
		const res = await fetch(`${BASE}/api/assets/${assetId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(204);
	});

	test("DELETE /api/assets/:id → 404 (already deleted)", async () => {
		const res = await fetch(`${BASE}/api/assets/${assetId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("GET /api/assets/:id → 404 (after delete)", async () => {
		const res = await fetch(`${BASE}/api/assets/${assetId}`, {
			headers: readHeaders(),
		});
		expect(res.status).toBe(404);
	});
});
