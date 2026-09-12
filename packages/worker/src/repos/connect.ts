import type { ConnectSensitiveAction, ConnectServer } from "@bat/shared";
import type { ConnectTokenRow } from "../domain/connect.js";

export interface ConnectAudit {
	id: string;
	request_id: string;
	server_id: string | null;
	token_id: string | null;
	actor: string;
	operation: string;
	status: number;
	code: string | null;
	created_at: number;
}

export interface ConnectRequest {
	token_id: string;
	key_hash: string;
	fingerprint: string;
	request_id: string;
	state: "pending" | "complete";
	status: number | null;
	response: string | null;
	etag: string | null;
	created_at: number;
}

export interface ConnectRepository {
	servers(principal: string, globalManager: boolean): Promise<ConnectServer[]>;
	authorized(serverId: string, principal: string, globalManager: boolean): Promise<boolean>;
	tokens(serverId: string): Promise<ConnectTokenRow[]>;
	token(id: string, serverId: string): Promise<ConnectTokenRow | null>;
	findToken(hash: string): Promise<ConnectTokenRow | null>;
	createToken(row: ConnectTokenRow, audit: ConnectAudit): Promise<boolean>;
	changeToken(row: ConnectTokenRow, expectedVersion: number, audit: ConnectAudit): Promise<boolean>;
	touchToken(id: string, now: number): Promise<void>;
	confirm(
		hash: string,
		token: ConnectTokenRow,
		principal: string,
		action: ConnectSensitiveAction,
		expiresAt: number,
	): Promise<void>;
	consumeConfirmation(
		hash: string,
		token: ConnectTokenRow,
		principal: string,
		action: ConnectSensitiveAction,
		now: number,
	): Promise<boolean>;
	rate(key: string, maximum: number, now: number): Promise<boolean>;
	revision(serverId: string): Promise<number>;
	request(tokenId: string, keyHash: string): Promise<ConnectRequest | null>;
	beginRequest(row: ConnectRequest): Promise<boolean>;
	finishRequest(row: ConnectRequest, audit: ConnectAudit): Promise<void>;
	audit(row: ConnectAudit): Promise<void>;
	audits(
		serverId: string,
		before: number,
		beforeId: string,
		limit: number,
	): Promise<ConnectAudit[]>;
	maintenance(now: number): Promise<void>;
}
