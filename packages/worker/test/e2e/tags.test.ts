// L2 — Tags CRUD + host tag association.

import type { HostTag, TagItem } from "@bat/shared";
import { beforeAll, describe, expect, test } from "vitest";
import { BASE, assertStatus, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const HID = "e2e-tags-host";

let tagId = 0;
let tag2Id = 0;

describe("L2: tags CRUD", () => {
	beforeAll(async () => {
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload(HID)),
		});
		assertStatus(res.status, 204, "tags beforeAll identity");
	});

	test("POST /api/tags → 201 (create tag)", async () => {
		const res = await fetch(`${BASE}/api/tags`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ name: "production-e2e-tags", color: 0 }),
		});
		expect(res.status).toBe(201);
		const tag = (await res.json()) as TagItem;
		expect(tag.name).toBe("production-e2e-tags");
		expect(tag.color).toBe(0);
		expect(tag.host_count).toBe(0);
		tagId = tag.id;
	});

	test("POST /api/tags → 201 (create second tag)", async () => {
		const res = await fetch(`${BASE}/api/tags`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ name: "staging-e2e-tags" }),
		});
		expect(res.status).toBe(201);
		const tag = (await res.json()) as TagItem;
		expect(tag.name).toBe("staging-e2e-tags");
		tag2Id = tag.id;
	});

	test("POST /api/tags duplicate name → 409", async () => {
		const res = await fetch(`${BASE}/api/tags`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ name: "production-e2e-tags" }),
		});
		expect(res.status).toBe(409);
	});

	test("GET /api/tags → lists tags with host_count", async () => {
		const res = await fetch(`${BASE}/api/tags`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const tags = (await res.json()) as TagItem[];
		const prod = tags.find((t) => t.name === "production-e2e-tags");
		expect(prod).toBeDefined();
		expect(prod?.host_count).toBe(0);
	});

	test("PUT /api/tags/:id → update name", async () => {
		const res = await fetch(`${BASE}/api/tags/${tagId}`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ name: "prod-e2e-tags", color: 3 }),
		});
		expect(res.status).toBe(200);
		const tag = (await res.json()) as { id: number; name: string; color: number };
		expect(tag.name).toBe("prod-e2e-tags");
		expect(tag.color).toBe(3);
	});

	test("PUT /api/tags/:id rename to existing name → 409", async () => {
		const res = await fetch(`${BASE}/api/tags/${tagId}`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ name: "staging-e2e-tags" }),
		});
		expect(res.status).toBe(409);
	});

	test("POST /api/hosts/:id/tags → 201 (add tag to host)", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/tags`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ tag_id: tagId }),
		});
		expect(res.status).toBe(201);
		const tag = (await res.json()) as HostTag;
		expect(tag.name).toBe("prod-e2e-tags");
	});

	test("GET /api/hosts/:id/tags → lists host tags", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/tags`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const tags = (await res.json()) as HostTag[];
		expect(tags.length).toBe(1);
		expect(tags[0].name).toBe("prod-e2e-tags");
	});

	test("GET /api/tags/by-hosts → maps host_id to tags", async () => {
		const res = await fetch(`${BASE}/api/tags/by-hosts`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const map = (await res.json()) as Record<string, HostTag[]>;
		expect(map[HID]).toBeDefined();
		expect(map[HID].length).toBe(1);
	});

	test("PUT /api/hosts/:id/tags → replace tags", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/tags`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ tag_ids: [tagId, tag2Id] }),
		});
		expect(res.status).toBe(200);
		const tags = (await res.json()) as HostTag[];
		expect(tags.length).toBe(2);
	});

	test("DELETE /api/hosts/:id/tags/:tagId → 204", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/tags/${tagId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(204);
	});

	test("DELETE /api/hosts/:id/tags/:tagId already removed → 404", async () => {
		const res = await fetch(`${BASE}/api/hosts/${HID}/tags/${tagId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("DELETE /api/tags/:id → 204", async () => {
		const res = await fetch(`${BASE}/api/tags/${tagId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(204);
	});

	test("DELETE /api/tags/:id already deleted → 404", async () => {
		const res = await fetch(`${BASE}/api/tags/${tagId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(404);
	});

	test("DELETE /api/tags/:id (cleanup tag2) → 204", async () => {
		const res = await fetch(`${BASE}/api/tags/${tag2Id}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(res.status).toBe(204);
	});
});
