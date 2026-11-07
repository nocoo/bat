// Domain repository contract for workstations. All SQL lives in
// `adapters/d1/workstations.ts`; routes and middleware consume only this
// interface so the storage engine stays replaceable.

import type {
	WorkstationConnectivityHistory,
	WorkstationMetricPoint,
	WorkstationRecord,
	WorkstationReportInput,
} from "@bat/shared";

export interface WorkstationRow {
	id: string;
	owner: string;
	installation_id: string;
	name: string;
	created_at: number;
	last_seen_at: number | null;
	public_ip: string | null;
	disabled: number;
	revoked_at: number | null;
	token_hash: string;
	token_prefix: string;
	version: number;
	rotated_at: number | null;
}

export interface WorkstationCodeRow {
	code_hash: string;
	owner: string;
	installation_id: string;
	challenge: string;
	name: string;
	created_at: number;
	expires_at: number;
	consumed_at: number | null;
}

export interface WorkstationServerTarget {
	server_id: string;
	name: string;
	address: string;
	family: 4 | 6;
}

export interface InsertReportInput {
	workstationId: string;
	report: WorkstationReportInput;
	bodyHash: string;
	receivedAt: number;
	publicIp: string | null;
}

export type InsertReportResult =
	| { ok: true; duplicate: boolean; received_at: number }
	| { ok: "conflict" }
	| { ok: "disabled" };

export type ExchangeResult =
	| { ok: true; row: WorkstationRow }
	| { ok: "code_invalid" }
	| { ok: "owner_mismatch" }
	| { ok: "disabled" };

export interface WorkstationSparklineRow {
	workstation_id: string;
	ts: number;
	cpu: number | null;
	mem: number | null;
}

export interface WorkstationGrant {
	id: string;
	name: string;
}

export interface WorkstationsRepository {
	/** Exact-digest lookup. Disabled rows are returned so callers can answer 403. */
	findByTokenHash(tokenHash: string): Promise<WorkstationRow | null>;
	/** Active workstations the principal owns, or all active ones for a global manager. */
	listAuthorizedFor(principal: string, globalManager: boolean): Promise<WorkstationGrant[]>;
	/**
	 * Workstations the principal may manage on an existing credential, including
	 * disabled ones. New grants still require `listAuthorizedFor` (active only).
	 */
	listManageableFor(principal: string, globalManager: boolean): Promise<WorkstationGrant[]>;
	getById(id: string): Promise<WorkstationRow | null>;
	getCode(codeHash: string): Promise<WorkstationCodeRow | null>;
	createCode(row: WorkstationCodeRow): Promise<void>;
	/**
	 * Atomic PKCE consumption + rotation + registration. The code is consumed
	 * only once; the workstation row is created or its key rotated in the same
	 * batch, keyed by the unique installation ID. Disabled rows stay disabled.
	 */
	exchange(params: {
		codeHash: string;
		installationId: string;
		owner: string;
		name: string;
		tokenHash: string;
		tokenPrefix: string;
		now: number;
	}): Promise<ExchangeResult>;
	/**
	 * Atomic report + connectivity insert with last-seen bump. A repeated
	 * `report_id` with the same body returns the original success result; a
	 * different body is a conflict. Disabled workstations accept nothing.
	 */
	insertReport(input: InsertReportInput): Promise<InsertReportResult>;
	/**
	 * Revoke only the presented credential. The workstation row, its reports and
	 * its installation binding stay intact, so a later re-login rotates the key
	 * for the same workstation ID.
	 */
	revokeKey(workstationId: string, tokenHash: string, now: number): Promise<boolean>;
	list(): Promise<WorkstationRecord[]>;
	/** Hourly CPU and memory samples for the workstation list sparklines. */
	listSparklineRowsSince(ids: string[], sinceSeconds: number): Promise<WorkstationSparklineRow[]>;
	get(id: string): Promise<WorkstationRecord | null>;
	/** Delete the workstation and expire every pending code for its installation. */
	delete(id: string, installationId: string): Promise<boolean>;
	metrics(
		id: string,
		from: number,
		to: number,
		limit: number,
		offset: number,
	): Promise<WorkstationMetricPoint[]>;
	connectivity(
		id: string,
		from: number,
		to: number,
		limit: number,
	): Promise<WorkstationConnectivityHistory[]>;
	rate(key: string, maximum: number, windowSeconds: number, now: number): Promise<boolean>;
	/** Current authorized server addresses for target discovery and report verification. */
	listServerTargets(serverIds: string[]): Promise<WorkstationServerTarget[]>;
	/** Drop report history older than `cutoff`, expired codes and stale rate windows. */
	purgeOlderThan(cutoff: number, now: number): Promise<void>;
}
