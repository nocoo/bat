// 0034 splits the public address into per-family columns.
//
// The migration only adds the two columns: deciding which family a historical
// `public_ip` belongs to needs a real address parser, so the split happens on
// read instead (see `lib/public-address.ts`). A legacy row therefore keeps its
// `public_ip` and has no family value until the probe reports one.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { describe, expect, test } from "vitest";
import { resolvePublicAddresses } from "../../lib/public-address.js";

const MIGRATION = "0034_public_ip_families.sql";
const migrationsDir = fileURLToPath(new URL("../../../migrations/", import.meta.url));

/** A database exactly as production looked before 0034 was applied. */
function databaseBeforeSplit(): BetterSqlite3.Database {
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

function insertHost(db: BetterSqlite3.Database, hostId: string, publicIp: string | null): void {
	db.prepare(
		"INSERT INTO hosts (host_id, hostname, last_seen, is_active, public_ip) VALUES (?, ?, ?, 1, ?)",
	).run(hostId, hostId, 1_730_000_000, publicIp);
}

function readHost(
	db: BetterSqlite3.Database,
	hostId: string,
): { public_ip: string | null; public_ip_v4: string | null; public_ip_v6: string | null } {
	return db
		.prepare("SELECT public_ip, public_ip_v4, public_ip_v6 FROM hosts WHERE host_id = ?")
		.get(hostId) as {
		public_ip: string | null;
		public_ip_v4: string | null;
		public_ip_v6: string | null;
	};
}

describe("0034 public address families", () => {
	test("adds the family columns without touching the legacy address", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "legacy", "203.0.113.10");

		applyMigration(db);

		// The migration is additive only: no value is copied, nothing is rewritten.
		expect(readHost(db, "legacy")).toEqual({
			public_ip: "203.0.113.10",
			public_ip_v4: null,
			public_ip_v6: null,
		});
		db.close();
	});

	test("leaves every historical value untouched, valid or not", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "legacy-v4", "203.0.113.10");
		insertHost(db, "legacy-v6", "2001:db8::10");
		insertHost(db, "legacy-none", null);
		insertHost(db, "legacy-empty", "");
		insertHost(db, "legacy-junk", "not-an-ip");

		applyMigration(db);

		expect(readHost(db, "legacy-v4")).toEqual({
			public_ip: "203.0.113.10",
			public_ip_v4: null,
			public_ip_v6: null,
		});
		expect(readHost(db, "legacy-v6")).toEqual({
			public_ip: "2001:db8::10",
			public_ip_v4: null,
			public_ip_v6: null,
		});
		expect(readHost(db, "legacy-none")).toEqual({
			public_ip: null,
			public_ip_v4: null,
			public_ip_v6: null,
		});
		expect(readHost(db, "legacy-empty")).toEqual({
			public_ip: "",
			public_ip_v4: null,
			public_ip_v6: null,
		});
		expect(readHost(db, "legacy-junk")).toEqual({
			public_ip: "not-an-ip",
			public_ip_v4: null,
			public_ip_v6: null,
		});
		db.close();
	});

	test("the read path derives a family from a valid legacy address", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "legacy-v4", "203.0.113.10");
		insertHost(db, "legacy-v6", "2001:db8::10");

		applyMigration(db);

		expect(resolvePublicAddresses(readHost(db, "legacy-v4"))).toEqual({
			public_ip: "203.0.113.10",
			public_ip_v4: "203.0.113.10",
			public_ip_v6: null,
		});
		expect(resolvePublicAddresses(readHost(db, "legacy-v6"))).toEqual({
			public_ip: "2001:db8::10",
			public_ip_v4: null,
			public_ip_v6: "2001:db8::10",
		});
		db.close();
	});

	test("an invalid legacy address never surfaces and never wins", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "legacy-empty", "");
		insertHost(db, "legacy-junk", "not-an-ip");

		applyMigration(db);

		for (const hostId of ["legacy-empty", "legacy-junk"]) {
			expect(resolvePublicAddresses(readHost(db, hostId))).toEqual({
				public_ip: null,
				public_ip_v4: null,
				public_ip_v6: null,
			});
		}
		db.close();
	});
});
