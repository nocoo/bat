/** Connect v1: a server is an existing Bat host, never an arbitrary tenant ID. */
export type ConnectScope = "read" | "write";
export type ConnectSensitiveAction = "reveal" | "rotate" | "revoke";
export const CONNECT_API_ORIGIN = "https://bat-ingest.worker.hexly.ai";

export interface ConnectToken {
	id: string;
	serverId: string;
	name: string;
	scope: ConnectScope;
	prefix: string;
	createdAt: string;
	lastUsedAt: string | null;
	expiresAt: string | null;
	revokedAt: string | null;
	version: number;
}

export interface ConnectServer {
	id: string;
	name: string;
}

export interface ConnectError {
	error: { code: string; message: string; requestId: string };
}

export interface ConnectPage<T> {
	data: T[];
	page: { limit: number; nextCursor: string | null };
	requestId: string;
}

export const CONNECT_LIMITS = {
	bodyBytes: 65_536,
	responseBytes: 2_097_152,
	requestTimeoutMs: 15_000,
	bodyTimeoutMs: 5_000,
	pageDefault: 50,
	pageMax: 100,
	readPerMinute: 120,
	writePerMinute: 30,
	tokensPerServer: 50,
	confirmationSeconds: 60,
	auditRetentionDays: 90,
	idempotencyResponseDays: 7,
} as const;
