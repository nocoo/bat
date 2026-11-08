import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import { describe, expect, test } from "vitest";

const MIGRATION = "0035_drop_maintenance_window.sql";
const migrationsDir = fileURLToPath(new URL("../../../migrations/", import.meta.url));

function databaseBeforeRemoval(): BetterSqlite3.Database {
	const db = new BetterSqlite3(":memory:");
	for (const file of readdirSync(migrationsDir).sort()) {
		if (file >= MIGRATION) break;
		db.exec(readFileSync(join(migrationsDir, file), "utf8"));
	}
	return db;
}

describe("0035 maintenance window removal", () => {
	test("drops columns, recreates the connect trigger, and records the migration", () => {
		const db = databaseBeforeRemoval();
		db.prepare(
			"INSERT INTO hosts(host_id, hostname, last_seen, is_active, maintenance_start, maintenance_end, maintenance_reason) VALUES (?, ?, 1, 1, '01:00', '02:00', 'patch')",
		).run("host-1", "host-1");

		db.exec(readFileSync(join(migrationsDir, MIGRATION), "utf8"));

		const columns = db.prepare("PRAGMA table_info(hosts)").all() as Array<{ name: string }>;
		const names = new Set(columns.map((column) => column.name));
		expect(names.has("maintenance_start")).toBe(false);
		expect(names.has("maintenance_end")).toBe(false);
		expect(names.has("maintenance_reason")).toBe(false);

		const trigger = db
			.prepare(
				"SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'connect_host_configuration'",
			)
			.get() as { sql: string };
		expect(trigger.sql).not.toContain("maintenance");
		expect(
			db.prepare("SELECT name FROM _migrations WHERE name = '0035_drop_maintenance_window'").get(),
		).toBeDefined();

		db.prepare("UPDATE hosts SET description = 'updated' WHERE host_id = 'host-1'").run();
		expect(
			db.prepare("SELECT revision FROM connect_server_versions WHERE server_id = 'host-1'").get(),
		).toEqual({ revision: 1 });
		db.close();
	});
});
