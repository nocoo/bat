import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { MAX_TAGS_PER_HOST, TAG_COLOR_COUNT, TAG_NAME_REGEX } from "@bat/shared";

// --- Test tag name regex ---

describe("TAG_NAME_REGEX", () => {
	test("accepts valid names", () => {
		expect(TAG_NAME_REGEX.test("production")).toBe(true);
		expect(TAG_NAME_REGEX.test("us-east")).toBe(true);
		expect(TAG_NAME_REGEX.test("web_server")).toBe(true);
		expect(TAG_NAME_REGEX.test("db01")).toBe(true);
		expect(TAG_NAME_REGEX.test("a")).toBe(true);
	});

	test("rejects invalid names", () => {
		expect(TAG_NAME_REGEX.test("")).toBe(false);
		expect(TAG_NAME_REGEX.test("-leading")).toBe(false);
		expect(TAG_NAME_REGEX.test("_leading")).toBe(false);
		expect(TAG_NAME_REGEX.test("UPPERCASE")).toBe(false);
		expect(TAG_NAME_REGEX.test("has space")).toBe(false);
		expect(TAG_NAME_REGEX.test("has.dot")).toBe(false);
		expect(TAG_NAME_REGEX.test("a".repeat(33))).toBe(false);
	});

	test("allows max length (32 chars)", () => {
		expect(TAG_NAME_REGEX.test("a".repeat(32))).toBe(true);
	});
});

describe("tag constants", () => {
	test("MAX_TAGS_PER_HOST is 10", () => {
		expect(MAX_TAGS_PER_HOST).toBe(10);
	});

	test("TAG_COLOR_COUNT is 10", () => {
		expect(TAG_COLOR_COUNT).toBe(10);
	});
});

// --- Test tag API route logic ---
// We test the auth and validation logic by importing handlers directly.
// d1Query and auth are mocked.

// Mock modules
const mockAuth = mock(() => Promise.resolve({ user: { email: "test@test.com" } }));
const mockD1Query = mock(() =>
	Promise.resolve({
		results: [],
		success: true,
		meta: { changes: 0, last_row_id: 0, rows_read: 0, rows_written: 0 },
	}),
);

mock.module("@/auth", () => ({ auth: mockAuth }));
mock.module("@/lib/d1", () => ({ d1Query: mockD1Query }));

describe("GET /api/tags", () => {
	beforeEach(() => {
		mockAuth.mockClear();
		mockD1Query.mockClear();
	});

	afterEach(() => {
		mockAuth.mockReset();
		mockD1Query.mockReset();
	});

	test("returns 401 when unauthenticated", async () => {
		mockAuth.mockResolvedValueOnce(null);
		const { GET } = await import("./route");
		const res = await GET();
		expect(res.status).toBe(401);
	});

	test("returns tags list from D1", async () => {
		mockAuth.mockResolvedValueOnce({ user: { email: "test@test.com" } });
		mockD1Query.mockResolvedValueOnce({
			results: [
				{ id: 1, name: "production", color: 0, host_count: 3 },
				{ id: 2, name: "database", color: 1, host_count: 1 },
			],
			success: true,
			meta: { changes: 0, last_row_id: 0, rows_read: 2, rows_written: 0 },
		});

		const { GET } = await import("./route");
		const res = await GET();
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body).toHaveLength(2);
		expect(body[0].name).toBe("production");
	});
});

describe("POST /api/tags", () => {
	beforeEach(() => {
		mockAuth.mockClear();
		mockD1Query.mockClear();
	});

	afterEach(() => {
		mockAuth.mockReset();
		mockD1Query.mockReset();
	});

	test("returns 401 when unauthenticated", async () => {
		mockAuth.mockResolvedValueOnce(null);
		const { POST } = await import("./route");
		const req = new Request("http://localhost/api/tags", {
			method: "POST",
			body: JSON.stringify({ name: "test" }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(401);
	});

	test("returns 400 for invalid tag name", async () => {
		mockAuth.mockResolvedValueOnce({ user: { email: "test@test.com" } });
		const { POST } = await import("./route");
		const req = new Request("http://localhost/api/tags", {
			method: "POST",
			body: JSON.stringify({ name: "INVALID NAME!" }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	test("returns 400 for empty name", async () => {
		mockAuth.mockResolvedValueOnce({ user: { email: "test@test.com" } });
		const { POST } = await import("./route");
		const req = new Request("http://localhost/api/tags", {
			method: "POST",
			body: JSON.stringify({ name: "" }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(400);
	});

	test("creates tag with auto-assigned color", async () => {
		mockAuth.mockResolvedValueOnce({ user: { email: "test@test.com" } });
		mockD1Query.mockResolvedValueOnce({
			results: [{ id: 1, name: "production", color: 0 }],
			success: true,
			meta: { changes: 1, last_row_id: 1, rows_read: 0, rows_written: 1 },
		});

		const { POST } = await import("./route");
		const req = new Request("http://localhost/api/tags", {
			method: "POST",
			body: JSON.stringify({ name: "production" }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.name).toBe("production");
		expect(body.host_count).toBe(0);
	});

	test("creates tag with explicit color", async () => {
		mockAuth.mockResolvedValueOnce({ user: { email: "test@test.com" } });
		mockD1Query.mockResolvedValueOnce({
			results: [{ id: 2, name: "database", color: 5 }],
			success: true,
			meta: { changes: 1, last_row_id: 2, rows_read: 0, rows_written: 1 },
		});

		const { POST } = await import("./route");
		const req = new Request("http://localhost/api/tags", {
			method: "POST",
			body: JSON.stringify({ name: "database", color: 5 }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.color).toBe(5);
	});

	test("normalizes name to lowercase", async () => {
		mockAuth.mockResolvedValueOnce({ user: { email: "test@test.com" } });
		mockD1Query.mockResolvedValueOnce({
			results: [{ id: 3, name: "web", color: 0 }],
			success: true,
			meta: { changes: 1, last_row_id: 3, rows_read: 0, rows_written: 1 },
		});

		const { POST } = await import("./route");
		const req = new Request("http://localhost/api/tags", {
			method: "POST",
			body: JSON.stringify({ name: "  Web  " }),
			headers: { "Content-Type": "application/json" },
		});
		const res = await POST(req);
		// name "web" after trim+lowercase passes TAG_NAME_REGEX
		expect(res.status).toBe(201);
	});
});
