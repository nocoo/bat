import { CONNECT_LIMITS, type ConnectSensitiveAction, type ConnectServer } from "@bat/shared";
import type { ConnectTokenRow } from "../../domain/connect.js";
import type { ConnectAudit, ConnectRepository, ConnectRequest } from "../../repos/connect.js";

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

	async tokens(serverId: string): Promise<ConnectTokenRow[]> {
		return (
			await this.db
				.prepare(
					"SELECT * FROM connect_tokens WHERE server_id = ? ORDER BY created_at DESC, id DESC",
				)
				.bind(serverId)
				.all<ConnectTokenRow>()
		).results;
	}

	token(id: string, serverId: string): Promise<ConnectTokenRow | null> {
		return this.db
			.prepare("SELECT * FROM connect_tokens WHERE id = ? AND server_id = ?")
			.bind(id, serverId)
			.first<ConnectTokenRow>();
	}

	findToken(hash: string): Promise<ConnectTokenRow | null> {
		return this.db
			.prepare("SELECT * FROM connect_tokens WHERE token_hash = ?")
			.bind(hash)
			.first<ConnectTokenRow>();
	}

	async createToken(row: ConnectTokenRow, audit: ConnectAudit): Promise<boolean> {
		const results = await this.db.batch([
			this.db
				.prepare(
					`INSERT INTO connect_tokens(id, server_id, name, scope, prefix, token_hash, ciphertext, owner, created_at, expires_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM connect_tokens WHERE server_id = ? AND revoked_at IS NULL) < ?`,
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
					row.server_id,
					CONNECT_LIMITS.tokensPerServer,
				),
			this.auditStatement(audit, true),
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
					`UPDATE connect_tokens SET name = ?, prefix = ?, token_hash = ?, ciphertext = ?, revoked_at = ?, last_used_at = ?, version = version + 1 WHERE id = ? AND server_id = ? AND version = ? AND revoked_at IS NULL`,
				)
				.bind(
					row.name,
					row.prefix,
					row.token_hash,
					row.ciphertext,
					row.revoked_at,
					row.last_used_at,
					row.id,
					row.server_id,
					expectedVersion,
				),
			this.auditStatement(audit, true),
		]);
		return (results[0]?.meta.changes ?? 0) === 1;
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
				"INSERT OR IGNORE INTO connect_requests(token_id, key_hash, fingerprint, request_id, state, created_at) VALUES (?,?,?,?, 'pending',?)",
			)
			.bind(row.token_id, row.key_hash, row.fingerprint, row.request_id, row.created_at)
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
				`INSERT INTO connect_audit(id, request_id, server_id, token_id, actor, operation, status, code, created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${ifChanged ? "changes() = 1" : "1 = 1"}`,
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
					"SELECT * FROM connect_audit WHERE server_id = ? AND (created_at < ? OR (created_at = ? AND id < ?)) ORDER BY created_at DESC, id DESC LIMIT ?",
				)
				.bind(serverId, before, before, beforeId, limit)
				.all<ConnectAudit>()
		).results;
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
