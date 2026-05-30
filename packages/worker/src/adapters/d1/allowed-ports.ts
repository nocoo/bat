// D1-backed PortAllowlistRepository. SQL lifted verbatim from
// `routes/allowed-ports.ts` (the inline statements + `hostExists` helper).

import { type AllowedPort, MAX_ALLOWED_PORTS_PER_HOST } from "@bat/shared";
import type { PortAllowlistRepository } from "../../repos/types.js";

export class D1PortAllowlistRepository implements PortAllowlistRepository {
	private readonly db: D1Database;

	constructor(db: D1Database) {
		this.db = db;
	}

	async listAllByHost(): Promise<Record<string, number[]>> {
		const result = await this.db
			.prepare("SELECT host_id, port FROM port_allowlist ORDER BY host_id, port")
			.all<{ host_id: string; port: number }>();
		const map: Record<string, number[]> = {};
		for (const row of result.results) {
			const list = map[row.host_id];
			if (list) {
				list.push(row.port);
			} else {
				map[row.host_id] = [row.port];
			}
		}
		return map;
	}

	async listForHost(
		hostId: string,
	): Promise<{ ok: true; rows: AllowedPort[] } | { ok: "host_not_found" }> {
		if (!(await this.hostExists(hostId))) {
			return { ok: "host_not_found" };
		}
		const result = await this.db
			.prepare(
				"SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? ORDER BY port ASC",
			)
			.bind(hostId)
			.all<AllowedPort>();
		return { ok: true, rows: result.results };
	}

	async addToHost(
		hostId: string,
		port: number,
		reason: string,
	): Promise<
		| { ok: true; row: AllowedPort; created: boolean }
		| { ok: "host_not_found" }
		| { ok: "limit_exceeded"; max: number }
	> {
		if (!(await this.hostExists(hostId))) {
			return { ok: "host_not_found" };
		}

		// Idempotent: if the port already exists, return it without touching counts.
		const existing = await this.db
			.prepare("SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? AND port = ?")
			.bind(hostId, port)
			.first<AllowedPort>();
		if (existing) {
			return { ok: true, row: existing, created: false };
		}

		// Enforce per-host limit only when adding a genuinely new port.
		const countRow = await this.db
			.prepare("SELECT COUNT(*) as cnt FROM port_allowlist WHERE host_id = ?")
			.bind(hostId)
			.first<{ cnt: number }>();
		if ((countRow?.cnt ?? 0) >= MAX_ALLOWED_PORTS_PER_HOST) {
			return { ok: "limit_exceeded", max: MAX_ALLOWED_PORTS_PER_HOST };
		}

		await this.db
			.prepare("INSERT OR IGNORE INTO port_allowlist (host_id, port, reason) VALUES (?, ?, ?)")
			.bind(hostId, port, reason)
			.run();

		const row = await this.db
			.prepare("SELECT port, reason, created_at FROM port_allowlist WHERE host_id = ? AND port = ?")
			.bind(hostId, port)
			.first<AllowedPort>();
		if (!row) {
			throw new Error("Failed to read inserted port_allowlist row");
		}
		return { ok: true, row, created: true };
	}

	async removeFromHost(hostId: string, port: number): Promise<boolean> {
		const result = await this.db
			.prepare("DELETE FROM port_allowlist WHERE host_id = ? AND port = ?")
			.bind(hostId, port)
			.run();
		return (result.meta?.changes ?? 0) > 0;
	}

	async listForHosts(hostIds: string[]): Promise<Map<string, Set<number>>> {
		if (hostIds.length === 0) {
			return new Map();
		}
		const placeholders = hostIds.map(() => "?").join(", ");
		const result = await this.db
			.prepare(`SELECT host_id, port FROM port_allowlist WHERE host_id IN (${placeholders})`)
			.bind(...hostIds)
			.all<{ host_id: string; port: number }>();
		const map = new Map<string, Set<number>>();
		for (const row of result.results) {
			let set = map.get(row.host_id);
			if (!set) {
				set = new Set();
				map.set(row.host_id, set);
			}
			set.add(row.port);
		}
		return map;
	}

	private async hostExists(hostId: string): Promise<boolean> {
		const row = await this.db
			.prepare("SELECT host_id FROM hosts WHERE host_id = ? LIMIT 1")
			.bind(hostId)
			.first<{ host_id: string }>();
		return row !== null;
	}
}
