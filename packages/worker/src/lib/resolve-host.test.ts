import { describe, expect, test } from "bun:test";
import { hashHostId } from "@bat/shared";
import { isOpaqueHid, resolveHostIdByHash, resolveHostRecord } from "./resolve-host";

describe("isOpaqueHid", () => {
	test("recognizes 8-char lowercase hex", () => {
		expect(isOpaqueHid("deadbeef")).toBe(true);
		expect(isOpaqueHid("00000000")).toBe(true);
		expect(isOpaqueHid("ffffffff")).toBe(true);
	});

	test("rejects wrong length", () => {
		expect(isOpaqueHid("deadbee")).toBe(false);
		expect(isOpaqueHid("deadbeef0")).toBe(false);
		expect(isOpaqueHid("")).toBe(false);
	});

	test("rejects non-hex chars and uppercase", () => {
		expect(isOpaqueHid("DEADBEEF")).toBe(false);
		expect(isOpaqueHid("dead-bee")).toBe(false);
		expect(isOpaqueHid("xyz12345")).toBe(false);
	});

	test("rejects hostnames / common host_id formats", () => {
		expect(isOpaqueHid("web-01.example.com")).toBe(false);
		expect(isOpaqueHid("i-0123456789abcdef0")).toBe(false);
	});
});

// --- D1 stub for resolveHostIdByHash tests ---
interface StubRow {
	host_id: string;
}
function makeDb(rows: StubRow[]): D1Database {
	const db: Partial<D1Database> = {
		prepare(_sql: string) {
			// biome-ignore lint/suspicious/noExplicitAny: minimal stub for unit test
			return {
				all: async <T = StubRow>() => ({ results: rows as T[], success: true, meta: {} }),
				// biome-ignore lint/suspicious/noExplicitAny: not used in these tests
			} as any;
		},
	};
	return db as D1Database;
}

describe("resolveHostIdByHash", () => {
	test("returns raw id unchanged when it's not an 8-char hex", async () => {
		const db = makeDb([]);
		expect(await resolveHostIdByHash(db, "web-01")).toBe("web-01");
		expect(await resolveHostIdByHash(db, "i-0123456789abcdef0")).toBe(
			"i-0123456789abcdef0",
		);
	});

	test("resolves a hid to the matching host_id", async () => {
		const hostId = "web-01.example.com";
		const hid = hashHostId(hostId);
		const db = makeDb([{ host_id: hostId }, { host_id: "other.example.com" }]);
		expect(await resolveHostIdByHash(db, hid)).toBe(hostId);
	});

	test("returns null when no active host matches the hid", async () => {
		const db = makeDb([{ host_id: "web-01" }, { host_id: "db-01" }]);
		expect(await resolveHostIdByHash(db, "deadbeef")).toBeNull();
	});

	test("returns null when the active-hosts table is empty", async () => {
		const db = makeDb([]);
		expect(await resolveHostIdByHash(db, "deadbeef")).toBeNull();
	});
});

describe("resolveHostRecord", () => {
	type Row = { host_id: string; is_active: number };
	function makeRecordDb(rows: Row[]): D1Database {
		const db: Partial<D1Database> = {
			prepare(sql: string) {
				// biome-ignore lint/suspicious/noExplicitAny: minimal stub
				const isFilter = sql.includes("WHERE host_id = ?");
				let bound: string | undefined;
				const stmt: any = {
					bind: (v: string) => {
						bound = v;
						return stmt;
					},
					first: async () =>
						isFilter ? (rows.find((r) => r.host_id === bound) ?? null) : null,
					all: async () => ({ results: rows, success: true, meta: {} }),
				};
				return stmt;
			},
		};
		return db as D1Database;
	}

	test("returns raw host record by direct host_id match", async () => {
		const db = makeRecordDb([
			{ host_id: "web-01", is_active: 1 },
			{ host_id: "db-01", is_active: 0 },
		]);
		expect(await resolveHostRecord(db, "web-01")).toEqual({ host_id: "web-01", is_active: 1 });
		expect(await resolveHostRecord(db, "db-01")).toEqual({ host_id: "db-01", is_active: 0 });
	});

	test("returns null when raw host_id is unknown", async () => {
		const db = makeRecordDb([{ host_id: "web-01", is_active: 1 }]);
		expect(await resolveHostRecord(db, "missing")).toBeNull();
	});

	test("resolves hid to the matching host record (including retired hosts)", async () => {
		const hostId = "retired.example.com";
		const hid = hashHostId(hostId);
		const db = makeRecordDb([
			{ host_id: "other", is_active: 1 },
			{ host_id: hostId, is_active: 0 },
		]);
		expect(await resolveHostRecord(db, hid)).toEqual({ host_id: hostId, is_active: 0 });
	});

	test("returns null when hid matches no host", async () => {
		const db = makeRecordDb([{ host_id: "web-01", is_active: 1 }]);
		expect(await resolveHostRecord(db, "deadbeef")).toBeNull();
	});
});
