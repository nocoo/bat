// Workstation HTTP calls: login exchange, target discovery and report upload.
// Machine traffic always goes to the locally derived ingest origin, never to a
// host extracted from browser callback data.

import {
	isUuid,
	isWorkstationToken,
	validateWorkstationLoginExchange,
	validateWorkstationTargetsResponse,
	type WorkstationLoginExchangeInput,
	type WorkstationReportInput,
	type WorkstationTargetsResponse,
} from "@bat/shared";
import { ApiError, HttpClient, NetworkError } from "../lib/http.js";
import { isExpectedWorkerUrl, type WorkstationOrigins } from "./origins.js";
import type { WorkstationCredential } from "./store.js";

const REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_ATTEMPTS = 3;
const RETRY_BASE_MS = 500;

export interface RequestOptions {
	/** Cancels the request, body read included. */
	signal?: AbortSignal;
	/** Timeout for the whole request, body read included. */
	timeoutMs?: number;
}

/** Exchange a PKCE authorization code for a workstation credential. */
export async function exchangeLogin(
	origins: WorkstationOrigins,
	input: WorkstationLoginExchangeInput,
	options: RequestOptions = {},
): Promise<WorkstationCredential> {
	const validated = validateWorkstationLoginExchange(input);
	if (!validated.ok) {
		throw new Error(`invalid exchange request: ${validated.error}`);
	}
	const client = new HttpClient(
		origins.machine,
		undefined,
		options.timeoutMs ?? REQUEST_TIMEOUT_MS,
		options.signal,
	);
	const raw = await client.post<unknown>("/api/workstation-auth/exchange", validated.value);
	return parseExchangeOutput(raw, origins.machine);
}

/** Validate the exchange response against the locally trusted machine origin. */
export function parseExchangeOutput(input: unknown, expectedOrigin: string): WorkstationCredential {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		throw new Error("login exchange returned no object");
	}
	const record = input as Record<string, unknown>;
	const workstationId = record.workstation_id;
	const token = record.token;
	const workerUrl = record.worker_url;
	if (typeof workstationId !== "string" || !isUuid(workstationId)) {
		throw new Error("login exchange returned no valid workstation_id");
	}
	if (typeof token !== "string" || !isWorkstationToken(token)) {
		throw new Error("login exchange returned no valid batw_ token");
	}
	if (typeof workerUrl !== "string") {
		throw new Error("login exchange returned no worker_url");
	}
	if (!isExpectedWorkerUrl(workerUrl, expectedOrigin)) {
		throw new Error(`login exchange returned an untrusted worker_url: ${workerUrl}`);
	}
	return { workstation_id: workstationId, worker_url: workerUrl, token };
}

/** Fetch and strictly validate the target list for this workstation. */
export async function fetchTargets(
	workerUrl: string,
	token: string,
	options: RequestOptions = {},
): Promise<WorkstationTargetsResponse> {
	const client = new HttpClient(
		workerUrl,
		token,
		options.timeoutMs ?? REQUEST_TIMEOUT_MS,
		options.signal,
	);
	const raw = await client.get<unknown>("/api/workstation-probe/targets");
	const parsed = validateWorkstationTargetsResponse(raw);
	if (!parsed.ok) {
		throw new Error(`targets response rejected: ${parsed.error}`);
	}
	return parsed.value;
}

export interface UploadDeps extends RequestOptions {
	/** Retry attempts including the first try. */
	attempts?: number;
	/** Backoff sleep, injectable so tests stay fast. */
	sleep?: (ms: number) => Promise<void>;
}

function isRetryable(err: unknown): boolean {
	if (err instanceof ApiError) {
		return err.status === 429 || err.status >= 500;
	}
	return err instanceof NetworkError;
}

/**
 * Upload one report. Retries reuse the exact same report_id and body; nothing is
 * queued or persisted. A 409 means the id was reused with different content and
 * is never retried.
 */
export async function uploadReport(
	workerUrl: string,
	token: string,
	report: WorkstationReportInput,
	deps: UploadDeps = {},
): Promise<void> {
	const attempts = deps.attempts ?? UPLOAD_ATTEMPTS;
	const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const body = JSON.stringify(report);
	const client = new HttpClient(
		workerUrl,
		token,
		deps.timeoutMs ?? REQUEST_TIMEOUT_MS,
		deps.signal,
	);
	let lastError: unknown;
	for (let attempt = 0; attempt < attempts; attempt += 1) {
		try {
			await client.post<unknown>("/api/workstation-probe/reports", JSON.parse(body));
			return;
		} catch (err) {
			lastError = err;
			if (err instanceof ApiError && err.status === 409) {
				throw new Error("report_id was already used with different content (409)");
			}
			if (!isRetryable(err) || attempt === attempts - 1) {
				break;
			}
			await sleep(RETRY_BASE_MS * 2 ** attempt);
			if (deps.signal?.aborted) {
				break;
			}
		}
	}
	throw lastError as Error;
}

/**
 * Revoke the workstation key this machine holds.
 * The Worker accepts the current key only; a revoked key can never be used again.
 */
export async function revokeWorkstationKey(
	workerUrl: string,
	token: string,
	options: RequestOptions = {},
): Promise<void> {
	const client = new HttpClient(
		workerUrl,
		token,
		options.timeoutMs ?? REQUEST_TIMEOUT_MS,
		options.signal,
	);
	try {
		await client.post<unknown>("/api/workstation-probe/revoke");
	} catch (err) {
		if (err instanceof ApiError && err.status === 404) {
			throw new Error("the server does not support key revocation (404)");
		}
		throw err;
	}
}
