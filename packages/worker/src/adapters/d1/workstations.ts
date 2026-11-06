// D1 adapter for workstations. All workstation SQL lives here; routes only see
// the `WorkstationsRepository` contract.

import type {
	WorkstationConnectivityHistory,
	WorkstationConnectivityStatus,
	WorkstationMetricPoint,
	WorkstationRecord,
	WorkstationReportInput,
	WorkstationReportRecord,
} from "@bat/shared";
import { isIpv4, isPublicIp } from "@bat/shared";
import { rttSummary } from "../../domain/workstation-history.js";
import type {
	ExchangeResult,
	InsertReportInput,
	InsertReportResult,
	WorkstationCodeRow,
	WorkstationGrant,
	WorkstationRow,
	WorkstationServerTarget,
	WorkstationsRepository,
} from "../../repos/workstations.js";

const REPORT_COLUMNS =
	"received_at, started_at, finished_at, cpu_usage_pct, mem_used_pct, mem_total_bytes, mem_available_bytes, uptime_seconds";

interface WorkstationListRow extends WorkstationRow {
	payload: string | null;
	report_received_at: number | null;
}

function toRecord(row: WorkstationListRow): WorkstationRecord {
	let latest: WorkstationReportRecord | null = null;
	if (row.payload !== null && row.report_received_at !== null) {
		latest = {
			...(JSON.parse(row.payload) as WorkstationReportInput),
			received_at: row.report_received_at,
		};
	}
	return {
		id: row.id,
		owner: row.owner,
		name: row.name,
		created_at: row.created_at,
		last_seen_at: row.last_seen_at,
		public_ip: row.public_ip,
		disabled: row.disabled === 1,
		latest_report: latest,
	};
}

const LIST_SQL = `SELECT w.*, r.payload AS payload, r.received_at AS report_received_at
FROM workstations w
LEFT JOIN workstation_reports r ON (r.workstation_id, r.report_id) = (
  SELECT workstation_id, report_id FROM workstation_reports
  WHERE workstation_id = w.id
  ORDER BY finished_at DESC, received_at DESC, report_id DESC LIMIT 1
)`;

export class D1WorkstationsRepository implements WorkstationsRepository {
	constructor(private readonly db: D1Database) {}

	async findByTokenHash(tokenHash: string): Promise<WorkstationRow | null> {
		return this.db
			.prepare("SELECT * FROM workstations WHERE token_hash = ?")
			.bind(tokenHash)
			.first<WorkstationRow>();
	}

	async listAuthorizedFor(principal: string, globalManager: boolean): Promise<WorkstationGrant[]> {
		const { results } = await this.db
			.prepare(
				"SELECT id, name FROM workstations WHERE disabled = 0 AND (? = 1 OR owner = ?) ORDER BY name, id",
			)
			.bind(Number(globalManager), principal)
			.all<WorkstationGrant>();
		return results;
	}

	async listManageableFor(principal: string, globalManager: boolean): Promise<WorkstationGrant[]> {
		const { results } = await this.db
			.prepare("SELECT id, name FROM workstations WHERE (? = 1 OR owner = ?) ORDER BY name, id")
			.bind(Number(globalManager), principal)
			.all<WorkstationGrant>();
		return results;
	}

	async getById(id: string): Promise<WorkstationRow | null> {
		return this.db
			.prepare("SELECT * FROM workstations WHERE id = ?")
			.bind(id)
			.first<WorkstationRow>();
	}

	async getCode(codeHash: string): Promise<WorkstationCodeRow | null> {
		return this.db
			.prepare("SELECT * FROM workstation_codes WHERE code_hash = ?")
			.bind(codeHash)
			.first<WorkstationCodeRow>();
	}

	async createCode(row: WorkstationCodeRow): Promise<void> {
		await this.db
			.prepare(
				"INSERT INTO workstation_codes(code_hash, owner, installation_id, challenge, name, created_at, expires_at, consumed_at) VALUES (?,?,?,?,?,?,?,NULL)",
			)
			.bind(
				row.code_hash,
				row.owner,
				row.installation_id,
				row.challenge,
				row.name,
				row.created_at,
				row.expires_at,
			)
			.run();
	}

	async exchange(params: {
		codeHash: string;
		installationId: string;
		owner: string;
		name: string;
		tokenHash: string;
		tokenPrefix: string;
		now: number;
	}): Promise<ExchangeResult> {
		// The consume marker is unique per attempt. A replay in the same second
		// updates zero rows and therefore never satisfies the registration guard,
		// so the first successful credential stays valid.
		const nonce = crypto.randomUUID();
		const results = await this.db.batch([
			this.db
				.prepare(
					"UPDATE workstation_codes SET consumed_at = ?, consume_nonce = ? WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > ?",
				)
				.bind(params.now, nonce, params.codeHash, params.now),
			this.db
				.prepare(
					`INSERT INTO workstations(id, owner, installation_id, name, created_at, last_seen_at, public_ip, disabled, token_hash, token_prefix, version, rotated_at)
SELECT ?, ?, ?, ?, ?, NULL, NULL, 0, ?, ?, 1, NULL
WHERE EXISTS (SELECT 1 FROM workstation_codes WHERE code_hash = ? AND consume_nonce = ? AND owner = ? AND installation_id = ?)
ON CONFLICT(installation_id) DO UPDATE SET
  token_hash = excluded.token_hash,
  token_prefix = excluded.token_prefix,
  revoked_at = NULL,
  version = workstations.version + 1,
  rotated_at = ?
WHERE workstations.disabled = 0 AND workstations.owner = excluded.owner`,
				)
				.bind(
					crypto.randomUUID(),
					params.owner,
					params.installationId,
					params.name,
					params.now,
					params.tokenHash,
					params.tokenPrefix,
					params.codeHash,
					nonce,
					params.owner,
					params.installationId,
					params.now,
				),
			this.db
				.prepare("SELECT * FROM workstations WHERE installation_id = ?")
				.bind(params.installationId),
		]);
		const consumed = (results[0] as D1Result<unknown>).meta.changes;
		const existing = (results[2] as D1Result<WorkstationRow>).results[0];
		if (consumed === 0) {
			if (existing && existing.disabled === 1) return { ok: "disabled" };
			if (existing && existing.owner !== params.owner) return { ok: "owner_mismatch" };
			return { ok: "code_invalid" };
		}
		// The guarded upsert guarantees the row exists once the code was consumed.
		const row = existing as WorkstationRow;
		if (row.disabled === 1) return { ok: "disabled" };
		if (row.owner !== params.owner) return { ok: "owner_mismatch" };
		return { ok: true, row };
	}

	async insertReport(input: InsertReportInput): Promise<InsertReportResult> {
		const { report, receivedAt } = input;
		const payload = JSON.stringify(report);
		// The insert marker is unique per attempt: a duplicate or late report keeps
		// the original row untouched, so liveness, the public address and the
		// latest snapshot only move for a genuinely new sample.
		const nonce = crypto.randomUUID();
		const results = await this.db.batch([
			this.db
				.prepare(
					`INSERT INTO workstation_reports(workstation_id, report_id, body_hash, received_at, started_at, finished_at, cpu_usage_pct, mem_used_pct, mem_total_bytes, mem_available_bytes, uptime_seconds, payload, insert_nonce)
SELECT w.id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM workstations w
WHERE w.id = ? AND w.disabled = 0 AND w.revoked_at IS NULL
ON CONFLICT(workstation_id, report_id) DO NOTHING`,
				)
				.bind(
					report.report_id,
					input.bodyHash,
					receivedAt,
					report.started_at,
					report.finished_at,
					report.cpu.usage_pct,
					report.mem.used_pct,
					report.mem.total_bytes,
					report.mem.available_bytes,
					report.uptime_seconds,
					payload,
					nonce,
					input.workstationId,
				),
			this.db
				.prepare(
					`INSERT OR IGNORE INTO workstation_connectivity(workstation_id, report_id, received_at, server_id, address, family, sent, received, rtts, status)
SELECT r.workstation_id, r.report_id, r.received_at, json_extract(j.value, '$.server_id'), json_extract(j.value, '$.address'), json_extract(j.value, '$.family'), json_extract(j.value, '$.sent'), json_extract(j.value, '$.received'), json_extract(j.value, '$.rtts_ms'), json_extract(j.value, '$.status')
FROM workstation_reports r, json_each(?) j
WHERE r.workstation_id = ? AND r.report_id = ? AND r.body_hash = ? AND r.insert_nonce = ?`,
				)
				.bind(
					JSON.stringify(report.connectivity),
					input.workstationId,
					report.report_id,
					input.bodyHash,
					nonce,
				),
			this.db
				.prepare(
					`UPDATE workstations SET
  last_seen_at = MAX(COALESCE(last_seen_at, -1), ?),
  public_ip = CASE WHEN ? = (SELECT MAX(finished_at) FROM workstation_reports WHERE workstation_id = ?)
    THEN COALESCE(?, public_ip) ELSE public_ip END
WHERE id = ? AND disabled = 0 AND revoked_at IS NULL
  AND EXISTS (SELECT 1 FROM workstation_reports WHERE workstation_id = ? AND report_id = ? AND body_hash = ? AND insert_nonce = ?)`,
				)
				.bind(
					report.finished_at,
					report.finished_at,
					input.workstationId,
					input.publicIp,
					input.workstationId,
					input.workstationId,
					report.report_id,
					input.bodyHash,
					nonce,
				),
			this.db
				.prepare(
					"SELECT workstation_id, body_hash, received_at FROM workstation_reports WHERE workstation_id = ? AND report_id = ?",
				)
				.bind(input.workstationId, report.report_id),
		]);
		const inserted = (results[0] as D1Result<unknown>).meta.changes > 0;
		const row = (results[3] as D1Result<{ body_hash: string; received_at: number }>).results[0];
		if (!row) return { ok: "disabled" };
		if (row.body_hash !== input.bodyHash) return { ok: "conflict" };
		return { ok: true, duplicate: !inserted, received_at: row.received_at };
	}

	async revokeKey(workstationId: string, tokenHash: string, now: number): Promise<boolean> {
		// Revoking the credential also expires every pending code for that
		// installation in the same transaction, so a code issued before the
		// revoke cannot silently re-key the workstation.
		const results = await this.db.batch([
			this.db
				.prepare(
					"UPDATE workstations SET revoked_at = ?, version = version + 1, rotated_at = ? WHERE id = ? AND token_hash = ? AND revoked_at IS NULL",
				)
				.bind(now, now, workstationId, tokenHash),
			this.db
				.prepare(
					`UPDATE workstation_codes SET consumed_at = ?
WHERE installation_id = (SELECT installation_id FROM workstations WHERE id = ?)
  AND consumed_at IS NULL
  AND EXISTS (SELECT 1 FROM workstations WHERE id = ? AND revoked_at IS NOT NULL)`,
				)
				.bind(now, workstationId, workstationId),
		]);
		return (results[0] as D1Result<unknown>).meta.changes > 0;
	}

	async list(): Promise<WorkstationRecord[]> {
		const { results } = await this.db
			.prepare(`${LIST_SQL} ORDER BY w.created_at DESC, w.id DESC`)
			.all<WorkstationListRow>();
		return results.map(toRecord);
	}

	async get(id: string): Promise<WorkstationRecord | null> {
		const row = await this.db
			.prepare(`${LIST_SQL} WHERE w.id = ?`)
			.bind(id)
			.first<WorkstationListRow>();
		return row ? toRecord(row) : null;
	}

	async delete(id: string, installationId: string): Promise<boolean> {
		// The delete and the pending-code invalidation are one transaction, so a
		// code issued before the delete cannot recreate the credential.
		const results = await this.db.batch([
			this.db.prepare("DELETE FROM workstations WHERE id = ?").bind(id),
			this.db
				.prepare(
					"UPDATE workstation_codes SET consumed_at = ? WHERE installation_id = ? AND consumed_at IS NULL",
				)
				.bind(Math.floor(Date.now() / 1000), installationId),
		]);
		return (results[0] as D1Result<unknown>).meta.changes > 0;
	}

	async metrics(
		id: string,
		from: number,
		to: number,
		limit: number,
		offset: number,
	): Promise<WorkstationMetricPoint[]> {
		const { results } = await this.db
			.prepare(
				`SELECT ${REPORT_COLUMNS} FROM workstation_reports
WHERE workstation_id = ? AND received_at >= ? AND received_at <= ?
ORDER BY finished_at DESC, received_at DESC, report_id DESC
LIMIT ? OFFSET ?`,
			)
			.bind(id, from, to, limit, offset)
			.all<WorkstationMetricPoint>();
		return results.reverse();
	}

	async connectivity(
		id: string,
		from: number,
		to: number,
		limit: number,
	): Promise<WorkstationConnectivityHistory[]> {
		const { results } = await this.db
			.prepare(
				`SELECT server_id, address, family, received_at, received, rtts, status FROM (
  SELECT c.server_id, c.address, c.family, c.received_at, c.received, c.rtts, c.status,
         ROW_NUMBER() OVER (PARTITION BY c.server_id ORDER BY c.received_at DESC, c.report_id DESC) AS rn
  FROM workstation_connectivity c
  WHERE c.workstation_id = ? AND c.received_at >= ? AND c.received_at <= ?
) WHERE rn <= ?
ORDER BY server_id ASC, received_at ASC`,
			)
			.bind(id, from, to, limit)
			.all<{
				server_id: string;
				address: string;
				family: 4 | 6;
				received_at: number;
				received: number;
				rtts: string;
				status: WorkstationConnectivityStatus;
			}>();
		const byServer = new Map<string, WorkstationConnectivityHistory>();
		for (const row of results) {
			let history = byServer.get(row.server_id);
			if (!history) {
				history = {
					server_id: row.server_id,
					address: row.address,
					family: row.family,
					data: [],
				};
				byServer.set(row.server_id, history);
			}
			const summary = rttSummary(JSON.parse(row.rtts) as Array<number | null>);
			history.data.push({
				received_at: row.received_at,
				received: row.received,
				rtt_avg_ms: summary.avg,
				rtt_min_ms: summary.min,
				rtt_max_ms: summary.max,
				status: row.status,
			});
		}
		return [...byServer.values()];
	}

	async rate(key: string, maximum: number, windowSeconds: number, now: number): Promise<boolean> {
		const window = Math.floor(now / windowSeconds);
		const row = await this.db
			.prepare(
				`INSERT INTO workstation_rate_windows(key, window, count) VALUES (?,?,1)
ON CONFLICT(key) DO UPDATE SET window = excluded.window,
  count = CASE WHEN workstation_rate_windows.window = excluded.window THEN workstation_rate_windows.count + 1 ELSE 1 END
RETURNING count`,
			)
			.bind(key, window)
			.first<{ count: number }>();
		return row !== null && row.count <= maximum;
	}

	async listServerTargets(serverIds: string[]): Promise<WorkstationServerTarget[]> {
		if (serverIds.length === 0) {
			return [];
		}
		const { results } = await this.db
			.prepare(
				`SELECT h.host_id, h.hostname, h.public_ip FROM hosts h, json_each(?) j
WHERE h.host_id = j.value AND h.is_active = 1
ORDER BY h.host_id ASC`,
			)
			.bind(JSON.stringify(serverIds))
			.all<{ host_id: string; hostname: string; public_ip: string | null }>();
		const targets: WorkstationServerTarget[] = [];
		for (const row of results) {
			if (row.public_ip === null || !isPublicIp(row.public_ip)) continue;
			const family = isIpv4(row.public_ip) ? 4 : 6;
			targets.push({ server_id: row.host_id, name: row.hostname, address: row.public_ip, family });
		}
		return targets;
	}

	async purgeOlderThan(cutoff: number, now: number): Promise<void> {
		await this.db.batch([
			this.db.prepare("DELETE FROM workstation_reports WHERE received_at < ?").bind(cutoff),
			this.db.prepare("DELETE FROM workstation_codes WHERE expires_at < ?").bind(now),
			this.db
				.prepare("DELETE FROM workstation_rate_windows WHERE window < ?")
				.bind(Math.floor(now / 60) - 10),
		]);
	}
}
