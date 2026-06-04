// Tier2 repository contract tests. SQL behaviour is unchanged from
// `services/tier2-metrics.ts`. The pure shaper `rowToTier2Snapshot`
// continues to be exercised by `services/tier2-metrics.test.ts`.

import type { Tier2Payload } from "@bat/shared";
import { beforeEach, describe, expect, test } from "vitest";
import { createMockD1 } from "../../test-helpers/mock-d1";
import { D1Tier2Repository } from "./tier2";

const HOST_A = "host-a";
const NOW = 1_730_000_000;

async function seedHost(db: D1Database) {
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 1)")
		.bind(HOST_A, "a.example.com", NOW)
		.run();
}

function makePayload(ts: number, overrides: Partial<Tier2Payload> = {}): Tier2Payload {
	return {
		host_id: HOST_A,
		timestamp: ts,
		...overrides,
	};
}

describe("D1Tier2Repository", () => {
	let db: D1Database;
	let repo: D1Tier2Repository;
	beforeEach(async () => {
		db = createMockD1();
		await seedHost(db);
		repo = new D1Tier2Repository(db);
	});

	describe("insertSnapshot", () => {
		test("returns true on first insert", async () => {
			expect(await repo.insertSnapshot(HOST_A, makePayload(NOW))).toBe(true);
		});

		test("returns false on duplicate (host_id, ts)", async () => {
			expect(await repo.insertSnapshot(HOST_A, makePayload(NOW))).toBe(true);
			expect(await repo.insertSnapshot(HOST_A, makePayload(NOW))).toBe(false);
		});

		test("serializes JSON sections that are present and stores nulls otherwise", async () => {
			const ports = { listening: [{ port: 22, bind: "0.0.0.0", protocol: "tcp" }] };
			expect(await repo.insertSnapshot(HOST_A, makePayload(NOW, { ports }))).toBe(true);
			const row = await db
				.prepare(
					"SELECT ports_json, systemd_json FROM tier2_snapshots WHERE host_id = ? AND ts = ?",
				)
				.bind(HOST_A, NOW)
				.first<{ ports_json: string | null; systemd_json: string | null }>();
			expect(row?.ports_json).toBe(JSON.stringify(ports));
			expect(row?.systemd_json).toBeNull();
		});
	});

	describe("getLatestForHost", () => {
		test("returns null when no snapshots exist", async () => {
			expect(await repo.getLatestForHost(HOST_A)).toBeNull();
		});

		test("returns the most recent snapshot, joining host inventory", async () => {
			expect(
				await repo.insertSnapshot(HOST_A, makePayload(NOW, { ports: { listening: [] } })),
			).toBe(true);
			expect(
				await repo.insertSnapshot(
					HOST_A,
					makePayload(NOW + 60, {
						security: {
							ssh_password_auth: false,
							ssh_root_login: "no",
							firewall_active: true,
							firewall_default_policy: "deny",
						},
					}),
				),
			).toBe(true);

			await db
				.prepare("UPDATE hosts SET timezone = ?, dns_resolvers = ? WHERE host_id = ?")
				.bind("UTC", JSON.stringify(["1.1.1.1"]), HOST_A)
				.run();

			const snap = await repo.getLatestForHost(HOST_A);
			expect(snap).not.toBeNull();
			expect(snap?.ts).toBe(NOW + 60);
			expect(snap?.security?.ssh_root_login).toBe("no");
			expect(snap?.timezone).toBe("UTC");
			expect(snap?.dns_resolvers).toEqual(["1.1.1.1"]);
			// section without payload should remain null
			expect(snap?.ports).toBeNull();
		});

		test("returns null for an unknown host", async () => {
			expect(await repo.getLatestForHost("ghost")).toBeNull();
		});

		test("disk_deep uses latest-non-null semantics across rows", async () => {
			// Simulate heavy cycle at T=0: includes disk_deep
			const diskDeep = {
				top_dirs: [{ path: "/usr", size_bytes: 1_000_000_000 }],
				journal_bytes: 256_000_000,
				large_files: [],
			};
			await repo.insertSnapshot(HOST_A, makePayload(NOW, { disk_deep: diskDeep }));

			// Simulate light cycle at T+30min: disk_deep is null (not collected)
			await repo.insertSnapshot(
				HOST_A,
				makePayload(NOW + 1800, {
					ports: { listening: [{ port: 80, bind: "0.0.0.0", protocol: "tcp" }] },
				}),
			);

			const snap = await repo.getLatestForHost(HOST_A);
			expect(snap).not.toBeNull();
			// Latest row's timestamp
			expect(snap?.ts).toBe(NOW + 1800);
			// ports from the latest row
			expect(snap?.ports?.listening).toHaveLength(1);
			// disk_deep should COALESCE to the earlier non-null row
			expect(snap?.disk_deep).not.toBeNull();
			expect(snap?.disk_deep?.top_dirs?.[0]?.path).toBe("/usr");
		});
	});
});
