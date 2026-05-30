import { hashHostId } from "@bat/shared";
import { describe, expect, test } from "vitest";
import type { HostsRepository } from "../repos/types.js";
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

function stubRepo(rows: { host_id: string; is_active?: number }[]): HostsRepository {
	const repo: Partial<HostsRepository> = {
		listActiveHostIds: async () =>
			rows.filter((r) => (r.is_active ?? 1) === 1).map((r) => ({ host_id: r.host_id })),
		listAllHostIdsWithActive: async () =>
			rows.map((r) => ({ host_id: r.host_id, is_active: r.is_active ?? 1 })),
		getActiveFlag: async (hostId: string) => {
			const row = rows.find((r) => r.host_id === hostId);
			return row ? { host_id: row.host_id, is_active: row.is_active ?? 1 } : null;
		},
	};
	return repo as HostsRepository;
}

describe("resolveHostIdByHash", () => {
	test("returns raw id unchanged when it's not an 8-char hex", async () => {
		const repo = stubRepo([]);
		expect(await resolveHostIdByHash(repo, "web-01")).toBe("web-01");
		expect(await resolveHostIdByHash(repo, "i-0123456789abcdef0")).toBe("i-0123456789abcdef0");
	});

	test("resolves a hid to the matching host_id", async () => {
		const hostId = "web-01.example.com";
		const hid = hashHostId(hostId);
		const repo = stubRepo([{ host_id: hostId }, { host_id: "other.example.com" }]);
		expect(await resolveHostIdByHash(repo, hid)).toBe(hostId);
	});

	test("returns null when no active host matches the hid", async () => {
		const repo = stubRepo([{ host_id: "web-01" }, { host_id: "db-01" }]);
		expect(await resolveHostIdByHash(repo, "deadbeef")).toBeNull();
	});

	test("returns null when the active-hosts table is empty", async () => {
		const repo = stubRepo([]);
		expect(await resolveHostIdByHash(repo, "deadbeef")).toBeNull();
	});
});

describe("resolveHostRecord", () => {
	test("returns raw host record by direct host_id match", async () => {
		const repo = stubRepo([
			{ host_id: "web-01", is_active: 1 },
			{ host_id: "db-01", is_active: 0 },
		]);
		expect(await resolveHostRecord(repo, "web-01")).toEqual({ host_id: "web-01", is_active: 1 });
		expect(await resolveHostRecord(repo, "db-01")).toEqual({ host_id: "db-01", is_active: 0 });
	});

	test("returns null when raw host_id is unknown", async () => {
		const repo = stubRepo([{ host_id: "web-01", is_active: 1 }]);
		expect(await resolveHostRecord(repo, "missing")).toBeNull();
	});

	test("resolves hid to the matching host record (including retired hosts)", async () => {
		const hostId = "retired.example.com";
		const hid = hashHostId(hostId);
		const repo = stubRepo([
			{ host_id: "other", is_active: 1 },
			{ host_id: hostId, is_active: 0 },
		]);
		expect(await resolveHostRecord(repo, hid)).toEqual({ host_id: hostId, is_active: 0 });
	});

	test("returns null when hid matches no host", async () => {
		const repo = stubRepo([{ host_id: "web-01", is_active: 1 }]);
		expect(await resolveHostRecord(repo, "deadbeef")).toBeNull();
	});
});
