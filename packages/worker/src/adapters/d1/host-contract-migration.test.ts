// 0037 adds the three independent contract columns next to the billing
// trio. It is additive only: nothing is copied, nothing is rewritten, and a
// database that already carries billing data keeps it untouched.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { describe, expect, test } from "vitest";

const MIGRATION = "0037_host_contract.sql";
const migrationsDir = fileURLToPath(new URL("../../../migrations/", import.meta.url));

/** A database exactly as production looked before 0037 was applied — the
 *  billing columns of 0036 are already in place. */
function databaseBeforeContract(): BetterSqlite3.Database {
	const db = new BetterSqlite3(":memory:");
	for (const file of readdirSync(migrationsDir).sort()) {
		if (file >= MIGRATION) {
			break;
		}
		db.exec(readFileSync(join(migrationsDir, file), "utf8"));
	}
	return db;
}

function applyMigration(db: BetterSqlite3.Database): void {
	db.exec(readFileSync(join(migrationsDir, MIGRATION), "utf8"));
}

type ContractRow = {
	cost_amount_cny: number | null;
	paid_at: string | null;
	renews_at: string | null;
	bandwidth_mbps: number | null;
	traffic_quota_gb: number | null;
	traffic_reset_day: number | null;
};

function insertBilledHost(db: BetterSqlite3.Database, hostId: string): void {
	db.prepare(
		"INSERT INTO hosts (host_id, hostname, last_seen, is_active, cost_amount_cny, paid_at, renews_at) VALUES (?, ?, ?, 1, 365, '2026-01-01', '2027-01-01')",
	).run(hostId, hostId, 1_730_000_000);
}

function readContract(db: BetterSqlite3.Database, hostId: string): ContractRow {
	return db
		.prepare(
			"SELECT cost_amount_cny, paid_at, renews_at, bandwidth_mbps, traffic_quota_gb, traffic_reset_day FROM hosts WHERE host_id = ?",
		)
		.get(hostId) as ContractRow;
}

describe("0037 host contract", () => {
	test("adds the three columns as nulls on a database that already has billing", () => {
		const db = databaseBeforeContract();
		insertBilledHost(db, "legacy");

		applyMigration(db);

		expect(readContract(db, "legacy")).toEqual({
			cost_amount_cny: 365,
			paid_at: "2026-01-01",
			renews_at: "2027-01-01",
			bandwidth_mbps: null,
			traffic_quota_gb: null,
			traffic_reset_day: null,
		});
		db.close();
	});

	test("stores and clears each contract field independently", () => {
		const db = databaseBeforeContract();
		db.prepare(
			"INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES ('h', 'h', 1, 1)",
		).run();
		applyMigration(db);

		db.prepare(
			"UPDATE hosts SET bandwidth_mbps = 2500, traffic_quota_gb = 500, traffic_reset_day = 1 WHERE host_id = 'h'",
		).run();
		expect(readContract(db, "h")).toEqual({
			cost_amount_cny: null,
			paid_at: null,
			renews_at: null,
			bandwidth_mbps: 2500,
			traffic_quota_gb: 500,
			traffic_reset_day: 1,
		});

		db.prepare("UPDATE hosts SET traffic_quota_gb = NULL WHERE host_id = 'h'").run();
		expect(readContract(db, "h")?.traffic_quota_gb).toBeNull();
		expect(readContract(db, "h")?.bandwidth_mbps).toBe(2500);
		db.close();
	});
});
