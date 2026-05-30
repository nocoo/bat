// Port allowlist repository contract tests. SQL behaviour is unchanged
// from the prior inline route statements.

import { MAX_ALLOWED_PORTS_PER_HOST } from "@bat/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1PortAllowlistRepository } from "./allowed-ports";

const HOST_A = "host-a";
const HOST_B = "host-b";
const NOW = 1_730_000_000;

async function seedHosts(db: D1Database) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_A, "a.example.com", NOW)
		.run();
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_B, "b.example.com", NOW)
		.run();
}

describe("D1PortAllowlistRepository", () => {
	let db: D1Database;
	let repo: D1PortAllowlistRepository;
	beforeEach(async () => {
		db = createMockD1();
		await seedHosts(db);
		repo = new D1PortAllowlistRepository(db);
	});

	describe("listAllByHost", () => {
		test("returns empty object when no ports anywhere", async () => {
			expect(await repo.listAllByHost()).toEqual({});
		});

		test("groups ports by host_id, ordered by host_id then port", async () => {
			expect((await repo.addToHost(HOST_B, 443, "")).ok).toBe(true);
			expect((await repo.addToHost(HOST_A, 22, "ssh")).ok).toBe(true);
			expect((await repo.addToHost(HOST_A, 80, "")).ok).toBe(true);
			expect(await repo.listAllByHost()).toEqual({
				[HOST_A]: [22, 80],
				[HOST_B]: [443],
			});
		});
	});

	describe("listForHost", () => {
		test("returns rows ordered by port for an existing host", async () => {
			expect((await repo.addToHost(HOST_A, 80, "web")).ok).toBe(true);
			expect((await repo.addToHost(HOST_A, 22, "ssh")).ok).toBe(true);
			const result = await repo.listForHost(HOST_A);
			expect(result.ok).toBe(true);
			if (result.ok !== true) {
				return;
			}
			expect(result.rows.map((r) => r.port)).toEqual([22, 80]);
			expect(result.rows[0]?.reason).toBe("ssh");
		});

		test("returns host_not_found for missing host", async () => {
			expect((await repo.listForHost("ghost")).ok).toBe("host_not_found");
		});
	});

	describe("addToHost", () => {
		test("inserts a fresh port and returns created=true", async () => {
			const result = await repo.addToHost(HOST_A, 22, "ssh");
			expect(result.ok).toBe(true);
			if (result.ok !== true) {
				return;
			}
			expect(result.created).toBe(true);
			expect(result.row.port).toBe(22);
			expect(result.row.reason).toBe("ssh");
		});

		test("idempotent: re-adding the same port returns the existing row with created=false", async () => {
			const first = await repo.addToHost(HOST_A, 22, "ssh");
			expect(first.ok).toBe(true);
			const second = await repo.addToHost(HOST_A, 22, "different reason");
			expect(second.ok).toBe(true);
			if (second.ok !== true) {
				return;
			}
			expect(second.created).toBe(false);
			// idempotent: existing reason preserved
			expect(second.row.reason).toBe("ssh");
		});

		test("returns host_not_found for missing host", async () => {
			const result = await repo.addToHost("ghost", 22, "ssh");
			expect(result.ok).toBe("host_not_found");
		});

		test("rejects new ports beyond MAX_ALLOWED_PORTS_PER_HOST", async () => {
			for (let i = 0; i < MAX_ALLOWED_PORTS_PER_HOST; i++) {
				const r = await repo.addToHost(HOST_A, 1000 + i, "");
				expect(r.ok).toBe(true);
			}
			const result = await repo.addToHost(HOST_A, 9000, "overflow");
			expect(result.ok).toBe("limit_exceeded");
			if (result.ok !== "limit_exceeded") {
				return;
			}
			expect(result.max).toBe(MAX_ALLOWED_PORTS_PER_HOST);
		});

		test("re-adding an existing port at the limit still succeeds (idempotent path bypasses the cap)", async () => {
			for (let i = 0; i < MAX_ALLOWED_PORTS_PER_HOST; i++) {
				const r = await repo.addToHost(HOST_A, 1000 + i, "");
				expect(r.ok).toBe(true);
			}
			const result = await repo.addToHost(HOST_A, 1000, "duplicate");
			expect(result.ok).toBe(true);
			if (result.ok !== true) {
				return;
			}
			expect(result.created).toBe(false);
		});
	});

	describe("removeFromHost", () => {
		test("returns true on hit, false on miss", async () => {
			expect((await repo.addToHost(HOST_A, 22, "")).ok).toBe(true);
			expect(await repo.removeFromHost(HOST_A, 22)).toBe(true);
			expect(await repo.removeFromHost(HOST_A, 22)).toBe(false);
			expect(await repo.removeFromHost(HOST_A, 9999)).toBe(false);
		});

		test("removing from a missing host returns false (not host_not_found)", async () => {
			expect(await repo.removeFromHost("ghost", 22)).toBe(false);
		});
	});

	describe("listForHosts (read-model for hosts list/detail/fleet/monitoring)", () => {
		test("returns ports grouped by host_id as Sets", async () => {
			await repo.addToHost(HOST_A, 80, "web");
			await repo.addToHost(HOST_A, 443, "web-tls");
			await repo.addToHost(HOST_B, 22, "ssh");
			const map = await repo.listForHosts([HOST_A, HOST_B]);
			expect(map.get(HOST_A)).toEqual(new Set([80, 443]));
			expect(map.get(HOST_B)).toEqual(new Set([22]));
		});
		test("absent hosts (no rows) are not in the map", async () => {
			await repo.addToHost(HOST_A, 80, "web");
			const map = await repo.listForHosts([HOST_A, HOST_B]);
			expect(map.has(HOST_B)).toBe(false);
		});
		test("empty input → empty map without DB call", async () => {
			expect((await repo.listForHosts([])).size).toBe(0);
		});
	});
});
