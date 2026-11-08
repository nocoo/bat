// 0034 splits the public address into per-family columns. Hosts observed before
// the split only have `public_ip`, so the migration backfills each stored
// literal into its own family column: without it an existing fleet would render
// without any public address.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { describe, expect, test } from "vitest";

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
	test("backfills an IPv4 address into the IPv4 column and leaves public_ip alone", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "legacy-v4", "203.0.113.10");

		applyMigration(db);

		expect(readHost(db, "legacy-v4")).toEqual({
			public_ip: "203.0.113.10",
			public_ip_v4: "203.0.113.10",
			public_ip_v6: null,
		});
		db.close();
	});

	test("backfills an IPv6 address into the IPv6 column", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "legacy-v6", "2001:db8::10");

		applyMigration(db);

		expect(readHost(db, "legacy-v6")).toEqual({
			public_ip: "2001:db8::10",
			public_ip_v4: null,
			public_ip_v6: "2001:db8::10",
		});
		db.close();
	});

	test("a host without a stored address gains no family value", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "legacy-none", null);

		applyMigration(db);

		expect(readHost(db, "legacy-none")).toEqual({
			public_ip: null,
			public_ip_v4: null,
			public_ip_v6: null,
		});
		db.close();
	});

	test("empty and invalid historical values stay in public_ip only", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "legacy-empty", "");
		insertHost(db, "legacy-whitespace", "   ");
		insertHost(db, "legacy-junk", "not-an-ip");

		applyMigration(db);

		expect(readHost(db, "legacy-empty")).toEqual({
			public_ip: "",
			public_ip_v4: null,
			public_ip_v6: null,
		});
		expect(readHost(db, "legacy-whitespace")).toEqual({
			public_ip: "   ",
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

	test("junk migration stays junk but a later valid IPv6 becomes preferred", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "legacy-mixed", "");
		insertHost(db, "legacy-junk", "garbage");

		applyMigration(db);

		expect(readHost(db, "legacy-mixed")).toEqual({
			public_ip: "",
			public_ip_v4: null,
			public_ip_v6: null,
		});

		db.prepare("UPDATE hosts SET public_ip_v6 = ? WHERE host_id = ?").run(
			"2001:db8::20",
			"legacy-mixed",
		);
		db.prepare(
			"UPDATE hosts SET public_ip = COALESCE(NULLIF(public_ip_v4, ''), NULLIF(public_ip_v6, '')) WHERE host_id = ?",
		).run("legacy-mixed");

		expect(readHost(db, "legacy-mixed")).toEqual({
			public_ip: "2001:db8::20",
			public_ip_v4: null,
			public_ip_v6: "2001:db8::20",
		});
		db.close();
	});

	test("the backfill keeps every row and leaves no host without its address", () => {
		const db = databaseBeforeSplit();
		insertHost(db, "host-a", "203.0.113.1");
		insertHost(db, "host-b", "2001:db8::2");
		insertHost(db, "host-c", "198.51.100.3");

		applyMigration(db);

		const rows = db
			.prepare("SELECT host_id, public_ip, public_ip_v4, public_ip_v6 FROM hosts ORDER BY host_id")
			.all() as {
			host_id: string;
			public_ip: string;
			public_ip_v4: string | null;
			public_ip_v6: string | null;
		}[];
		expect(rows).toHaveLength(3);
		for (const row of rows) {
			// Each address is still visible through exactly one family column.
			expect(row.public_ip_v4 ?? row.public_ip_v6).toBe(row.public_ip);
		}
		db.close();
	});
});
