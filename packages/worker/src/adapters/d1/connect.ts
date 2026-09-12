import { CONNECT_LIMITS, type ConnectSensitiveAction, type ConnectServer } from "@bat/shared";
import { ConnectFault, type ConnectTokenRow } from "../../domain/connect.js";
import type { ConnectAudit, ConnectRepository, ConnectRequest } from "../../repos/connect.js";

type StoredToken = Omit<ConnectTokenRow, "server_ids"> & { server_ids: string };
type StoredAudit = Omit<ConnectAudit, "server_ids" | "previous_server_ids"> & {
	server_ids: string;
	previous_server_ids: string | null;
};
const tokenSelect = `SELECT t.*, (SELECT json_group_array(server_id) FROM
  (SELECT server_id FROM connect_token_servers WHERE token_id = t.id ORDER BY server_id)) AS server_ids
  FROM connect_tokens t`;
const tokenRow = (row: StoredToken): ConnectTokenRow => ({
	...row,
	server_ids: JSON.parse(row.server_ids),
});
const auditRow = (row: StoredAudit): ConnectAudit => ({
	...row,
	server_ids: JSON.parse(row.server_ids),
	previous_server_ids:
		row.previous_server_ids === null ? null : JSON.parse(row.previous_server_ids),
});
const belowServerLimit = `NOT EXISTS (SELECT 1 FROM json_each(?) selected WHERE
  (SELECT COUNT(*) FROM connect_token_servers s JOIN connect_tokens t ON t.id = s.token_id
   WHERE s.server_id = selected.value AND t.revoked_at IS NULL AND t.id != ?) >= ?)`;

export class D1ConnectRepository implements ConnectRepository {
	constructor(private readonly db: D1Database) {}

	async servers(principal: string, globalManager: boolean): Promise<ConnectServer[]> {
		const result = await this.db
			.prepare(
				`SELECT h.host_id AS id, h.hostname AS name FROM hosts h WHERE h.is_active = 1 AND (? = 1 OR EXISTS (SELECT 1 FROM connect_server_grants g WHERE g.server_id = h.host_id AND g.principal = ? AND g.revoked_at IS NULL)) ORDER BY h.hostname, h.host_id`,
			)
			.bind(Number(globalManager), principal)
			.all<ConnectServer>();
		return result.results;
	}

	async authorized(serverId: string, principal: string, globalManager: boolean): Promise<boolean> {
		return !!(await this.db
			.prepare(
				`SELECT 1 FROM hosts h WHERE h.host_id = ? AND h.is_active = 1 AND (? = 1 OR EXISTS (SELECT 1 FROM connect_server_grants g WHERE g.server_id = h.host_id AND g.principal = ? AND g.revoked_at IS NULL))`,
			)
			.bind(serverId, Number(globalManager), principal)
			.first());
	}

	async tokens(serverId?: string): Promise<ConnectTokenRow[]> {
		return (
			await this.db
				.prepare(
					`${tokenSelect} WHERE (? IS NULL OR EXISTS (SELECT 1 FROM connect_token_servers s WHERE s.token_id = t.id AND s.server_id = ?)) ORDER BY t.created_at DESC, t.id DESC`,
				)
				.bind(serverId ?? null, serverId ?? null)
				.all<StoredToken>()
		).results.map(tokenRow);
	}

	async token(id: string, serverId?: string): Promise<ConnectTokenRow | null> {
		const row = await this.db
			.prepare(
				`${tokenSelect} WHERE t.id = ? AND (? IS NULL OR EXISTS (SELECT 1 FROM connect_token_servers s WHERE s.token_id = t.id AND s.server_id = ?))`,
			)
			.bind(id, serverId ?? null, serverId ?? null)
			.first<StoredToken>();
		return row ? tokenRow(row) : null;
	}

	async findToken(hash: string): Promise<ConnectTokenRow | null> {
		const row = await this.db
			.prepare(`${tokenSelect} WHERE t.token_hash = ?`)
			.bind(hash)
			.first<StoredToken>();
		return row ? tokenRow(row) : null;
	}

	async createToken(row: ConnectTokenRow, audit: ConnectAudit): Promise<boolean> {
		const results = await this.db.batch([
			this.db
				.prepare(
					`INSERT INTO connect_tokens(id, server_id, name, scope, prefix, token_hash, ciphertext, owner, created_at, expires_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM connect_tokens WHERE owner = ? AND revoked_at IS NULL) < ? AND ${belowServerLimit}`,
				)
				.bind(
					row.id,
					row.server_id,
					row.name,
					row.scope,
					row.prefix,
					row.token_hash,
					row.ciphertext,
					row.owner,
					row.created_at,
					row.expires_at,
					row.owner,
					CONNECT_LIMITS.tokensPerOwner,
					JSON.stringify(row.server_ids),
					row.id,
					CONNECT_LIMITS.tokensPerServer,
				),
			this.auditStatement(audit, true),
			this.grantsStatement(row, audit.id),
		]);
		return (results[0]?.meta.changes ?? 0) === 1;
	}

	async changeToken(
		row: ConnectTokenRow,
		expectedVersion: number,
		audit: ConnectAudit,
	): Promise<boolean> {
		const results = await this.db.batch([
			this.db
				.prepare(
					`UPDATE connect_tokens SET name = ?, scope = ?, expires_at = ?, prefix = ?, token_hash = ?, ciphertext = ?, revoked_at = ?, last_used_at = ?, version = version + 1 WHERE id = ? AND version = ? AND revoked_at IS NULL AND ${belowServerLimit}`,
				)
				.bind(
					row.name,
					row.scope,
					row.expires_at,
					row.prefix,
					row.token_hash,
					row.ciphertext,
					row.revoked_at,
					row.last_used_at,
					row.id,
					expectedVersion,
					JSON.stringify(row.server_ids),
					row.id,
					CONNECT_LIMITS.tokensPerServer,
				),
			this.auditStatement(audit, true),
			// The unique audit row is the CAS success marker. A concurrent winner
			// with the same next version must never authorize this request's grants.
			this.db
				.prepare(
					`DELETE FROM connect_token_servers WHERE token_id = ? AND server_id NOT IN (SELECT value FROM json_each(?)) AND EXISTS (SELECT 1 FROM connect_audit WHERE id = ?)`,
				)
				.bind(row.id, JSON.stringify(row.server_ids), audit.id),
			this.grantsStatement(row, audit.id),
		]);
		if ((results[0]?.meta.changes ?? 0) === 1) return true;
		const current = await this.token(row.id);
		if (current?.version === expectedVersion && current.revoked_at === null)
			throw new ConnectFault(422, "token_limit", "A selected server already has 50 active tokens.");
		return false;
	}

	private grantsStatement(row: ConnectTokenRow, auditId: string): D1PreparedStatement {
		return this.db
			.prepare(
				`INSERT OR IGNORE INTO connect_token_servers(token_id, server_id) SELECT ?, value FROM json_each(?) WHERE EXISTS (SELECT 1 FROM connect_audit WHERE id = ?)`,
			)
			.bind(row.id, JSON.stringify(row.server_ids), auditId);
	}

	async touchToken(id: string, now: number): Promise<void> {
		await this.db
			.prepare("UPDATE connect_tokens SET last_used_at = ? WHERE id = ? AND revoked_at IS NULL")
			.bind(now, id)
			.run();
	}

	async confirm(
		hash: string,
		token: ConnectTokenRow,
		principal: string,
		action: ConnectSensitiveAction,
		expiresAt: number,
	): Promise<void> {
		await this.db.batch([
			this.db
				.prepare(
					"DELETE FROM connect_confirmations WHERE token_id = ? AND principal = ? AND action = ?",
				)
				.bind(token.id, principal, action),
			this.db
				.prepare(
					"INSERT INTO connect_confirmations(nonce_hash, token_id, principal, action, version, expires_at) VALUES (?,?,?,?,?,?)",
				)
				.bind(hash, token.id, principal, action, token.version, expiresAt),
		]);
	}

	async consumeConfirmation(
		hash: string,
		token: ConnectTokenRow,
		principal: string,
		action: ConnectSensitiveAction,
		now: number,
	): Promise<boolean> {
		return !!(await this.db
			.prepare(
				"DELETE FROM connect_confirmations WHERE nonce_hash = ? AND token_id = ? AND principal = ? AND action = ? AND version = ? AND expires_at > ? RETURNING token_id",
			)
			.bind(hash, token.id, principal, action, token.version, now)
			.first());
	}

	async rate(key: string, maximum: number, now: number): Promise<boolean> {
		const window = Math.floor(now / 60);
		const row = await this.db
			.prepare(
				`INSERT INTO connect_rate_windows(key, window, count) VALUES (?,?,1) ON CONFLICT(key) DO UPDATE SET window = excluded.window, count = CASE WHEN connect_rate_windows.window = excluded.window THEN connect_rate_windows.count + 1 ELSE 1 END RETURNING count`,
			)
			.bind(key, window)
			.first<{ count: number }>();
		return !!row && row.count <= maximum;
	}

	async revision(serverId: string): Promise<number> {
		const row = await this.db
			.prepare("SELECT revision FROM connect_server_versions WHERE server_id = ?")
			.bind(serverId)
			.first<{ revision: number }>();
		return row?.revision ?? 0;
	}

	request(tokenId: string, keyHash: string): Promise<ConnectRequest | null> {
		return this.db
			.prepare("SELECT * FROM connect_requests WHERE token_id = ? AND key_hash = ?")
			.bind(tokenId, keyHash)
			.first<ConnectRequest>();
	}

	async beginRequest(row: ConnectRequest): Promise<boolean> {
		const result = await this.db
			.prepare(
				"INSERT OR IGNORE INTO connect_requests(token_id, server_id, key_hash, fingerprint, request_id, state, created_at) VALUES (?,?,?,?,?, 'pending',?)",
			)
			.bind(
				row.token_id,
				row.server_id,
				row.key_hash,
				row.fingerprint,
				row.request_id,
				row.created_at,
			)
			.run();
		return result.meta.changes === 1;
	}

	async finishRequest(row: ConnectRequest, audit: ConnectAudit): Promise<void> {
		await this.db.batch([
			this.db
				.prepare(
					"UPDATE connect_requests SET state = 'complete', status = ?, response = ?, etag = ? WHERE token_id = ? AND key_hash = ? AND request_id = ?",
				)
				.bind(row.status, row.response, row.etag, row.token_id, row.key_hash, row.request_id),
			this.auditStatement(audit),
		]);
	}

	async audit(row: ConnectAudit): Promise<void> {
		await this.auditStatement(row).run();
	}

	private auditStatement(row: ConnectAudit, ifChanged = false): D1PreparedStatement {
		return this.db
			.prepare(
				`INSERT INTO connect_audit(id, request_id, server_id, token_id, actor, operation, status, code, created_at, server_ids, previous_server_ids) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${ifChanged ? "changes() = 1" : "1 = 1"}`,
			)
			.bind(
				row.id,
				row.request_id,
				row.server_id,
				row.token_id,
				row.actor,
				row.operation,
				row.status,
				row.code,
				row.created_at,
				JSON.stringify(row.server_ids ?? (row.server_id ? [row.server_id] : [])),
				row.previous_server_ids ? JSON.stringify(row.previous_server_ids) : null,
			);
	}

	async audits(
		serverId: string,
		before: number,
		beforeId: string,
		limit: number,
	): Promise<ConnectAudit[]> {
		return (
			await this.db
				.prepare(
					`SELECT * FROM connect_audit WHERE (server_id = ? OR EXISTS (SELECT 1 FROM json_each(server_ids) WHERE value = ?) OR EXISTS (SELECT 1 FROM json_each(previous_server_ids) WHERE value = ?)) AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?`,
				)
				.bind(serverId, serverId, serverId, before, before, beforeId, limit)
				.all<StoredAudit>()
		).results.map((stored) => {
			const row = auditRow(stored);
			// A server reader must not learn the other servers of a shared key.
			return {
				...row,
				server_id: serverId,
				server_ids: row.server_ids?.filter((id) => id === serverId) ?? [],
				previous_server_ids: row.previous_server_ids?.filter((id) => id === serverId) ?? null,
			};
		});
	}

	async tokenAudits(tokenId: string): Promise<ConnectAudit[]> {
		return (
			await this.db
				.prepare(
					"SELECT * FROM connect_audit WHERE token_id = ? ORDER BY created_at DESC, id DESC LIMIT 100",
				)
				.bind(tokenId)
				.all<StoredAudit>()
		).results.map(auditRow);
	}

	async maintenance(now: number): Promise<void> {
		await this.db.batch([
			this.db.prepare("DELETE FROM connect_confirmations WHERE expires_at <= ?").bind(now),
			this.db
				.prepare("DELETE FROM connect_rate_windows WHERE window < ?")
				.bind(Math.floor(now / 60) - 2),
			this.db
				.prepare("DELETE FROM connect_audit WHERE created_at < ?")
				.bind(now - CONNECT_LIMITS.auditRetentionDays * 86400),
			// Retain key tombstones: an old retry must never execute a destructive action again.
			this.db
				.prepare(
					"UPDATE connect_requests SET response = NULL WHERE created_at < ? AND response IS NOT NULL",
				)
				.bind(now - CONNECT_LIMITS.idempotencyResponseDays * 86400),
		]);
	}
}
