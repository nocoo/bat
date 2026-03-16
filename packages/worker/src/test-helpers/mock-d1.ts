// Mock D1 database backed by bun:sqlite for tests
import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(import.meta.dir, "../../migrations/0001_initial.sql");
const MIGRATION_TIER2_PATH = resolve(import.meta.dir, "../../migrations/0003_tier2_tables.sql");

/**
 * D1PreparedStatement mock wrapping bun:sqlite Statement.
 * Mirrors the D1 interface: bind(), first(), all(), run(), raw().
 */
class MockD1PreparedStatement implements D1PreparedStatement {
	#db: Database;
	#sql: string;
	#bindings: unknown[] = [];

	constructor(db: Database, sql: string) {
		this.#db = db;
		this.#sql = sql;
	}

	bind(...values: unknown[]): D1PreparedStatement {
		this.#bindings = values;
		return this;
	}

	async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
		const stmt = this.#db.prepare(this.#sql);
		const row = stmt.get(...this.#bindings) as Record<string, unknown> | null;
		if (!row) return null;
		if (colName) return (row[colName] as T) ?? null;
		return row as T;
	}

	async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
		const stmt = this.#db.prepare(this.#sql);
		const rows = stmt.all(...this.#bindings) as T[];
		return {
			results: rows,
			success: true,
			meta: {
				served_by: "mock-d1",
				duration: 0,
				changes: 0,
				last_row_id: 0,
				changed_db: false,
				size_after: 0,
				rows_read: rows.length,
				rows_written: 0,
			},
		};
	}

	async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
		const stmt = this.#db.prepare(this.#sql);
		const info = stmt.run(...this.#bindings);
		return {
			results: [] as T[],
			success: true,
			meta: {
				served_by: "mock-d1",
				duration: 0,
				changes: info.changes,
				last_row_id: Number(info.lastInsertRowid),
				changed_db: info.changes > 0,
				size_after: 0,
				rows_read: 0,
				rows_written: info.changes,
			},
		};
	}

	async raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[]> {
		const stmt = this.#db.prepare(this.#sql);
		const rows = stmt.values(...this.#bindings);
		if (options?.columnNames) {
			const columns = stmt.columnNames;
			return [columns as unknown as T, ...(rows as T[])];
		}
		return rows as T[];
	}
}

/**
 * Create an in-memory D1Database mock backed by bun:sqlite.
 * Applies the initial migration schema automatically.
 */
export function createMockD1(): D1Database {
	const db = new Database(":memory:");
	// WAL mode not needed for in-memory, but matches production
	db.run("PRAGMA journal_mode = WAL");
	db.run("PRAGMA foreign_keys = ON");

	// Apply migration schema
	const schema = readFileSync(MIGRATION_PATH, "utf-8");
	db.run(schema);

	// Apply Tier 2 migration
	const tier2Schema = readFileSync(MIGRATION_TIER2_PATH, "utf-8");
	// Execute statements one by one (bun:sqlite doesn't support multi-statement exec)
	for (const stmt of tier2Schema
		.split(";")
		.map((s) => s.trim())
		.filter(Boolean)) {
		db.run(`${stmt};`);
	}

	return {
		prepare(sql: string): D1PreparedStatement {
			return new MockD1PreparedStatement(db, sql);
		},

		async exec(sql: string): Promise<D1ExecResult> {
			db.run(sql);
			return {
				count: 1,
				duration: 0,
			};
		},

		async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
			const results: D1Result<T>[] = [];
			for (const stmt of statements) {
				results.push(await (stmt as MockD1PreparedStatement).run<T>());
			}
			return results;
		},

		async dump(): Promise<ArrayBuffer> {
			return new ArrayBuffer(0);
		},
	};
}
