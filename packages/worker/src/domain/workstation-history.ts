// Pure request-shaping helpers for workstation reads. Bounds are shared so the
// browser and the Worker cannot disagree about paging or retention windows.

import {
	isPublicIp,
	WORKSTATION_HISTORY_DEFAULT_WINDOW_SECONDS,
	WORKSTATION_HISTORY_MAX_LIMIT,
	WORKSTATION_HISTORY_MAX_WINDOW_SECONDS,
	WORKSTATION_RATE_LIMITS,
} from "@bat/shared";

export interface HistoryQuery {
	from: number;
	to: number;
	limit: number;
	offset: number;
}

function integer(raw: string, min: number, max: number): number | null {
	if (!/^\d+$/.test(raw)) {
		return null;
	}
	const value = Number.parseInt(raw, 10);
	return value >= min && value <= max ? value : null;
}

/**
 * Parse `from`, `to`, `limit` and `offset` for history reads. `null` means the
 * client sent an unsupported value: callers must reject instead of clamping.
 */
export function parseHistoryQuery(
	params: { from?: string; to?: string; limit?: string; offset?: string },
	now: number,
): HistoryQuery | null {
	const to = params.to === undefined ? now : integer(params.to, 0, Number.MAX_SAFE_INTEGER);
	if (to === null) {
		return null;
	}
	const from =
		params.from === undefined
			? to - WORKSTATION_HISTORY_DEFAULT_WINDOW_SECONDS
			: integer(params.from, 0, Number.MAX_SAFE_INTEGER);
	if (from === null) {
		return null;
	}
	if (from > to || to - from > WORKSTATION_HISTORY_MAX_WINDOW_SECONDS) {
		return null;
	}
	const limit =
		params.limit === undefined
			? WORKSTATION_HISTORY_MAX_LIMIT
			: integer(params.limit, 1, WORKSTATION_HISTORY_MAX_LIMIT);
	if (limit === null) {
		return null;
	}
	const offset =
		params.offset === undefined ? 0 : integer(params.offset, 0, Number.MAX_SAFE_INTEGER);
	if (offset === null) {
		return null;
	}
	return { from, to, limit, offset };
}

export interface RttSummary {
	avg: number | null;
	min: number | null;
	max: number | null;
}

/** Unavailable probes stay null; a genuine zero RTT counts as a sample. */
export function rttSummary(rtts: ReadonlyArray<number | null>): RttSummary {
	const answered = rtts.filter((rtt): rtt is number => rtt !== null);
	if (answered.length === 0) {
		return { avg: null, min: null, max: null };
	}
	let min = answered[0] as number;
	let max = min;
	let total = 0;
	for (const rtt of answered) {
		total += rtt;
		if (rtt < min) min = rtt;
		if (rtt > max) max = rtt;
	}
	return { avg: total / answered.length, min, max };
}

/** Local isolated runs may raise the per-key budget; production always uses the shared default. */
export function rateLimit(
	environment: string | undefined,
	raw: string | undefined,
	fallback: number,
): number {
	if (environment === "production") {
		return fallback;
	}
	const override = Number(raw);
	return Number.isInteger(override) && override > 0 ? override : fallback;
}

export const WORKSTATION_DEFAULT_RATE_LIMITS = WORKSTATION_RATE_LIMITS;

/**
 * Only the platform-observed client address is trusted, and only in production.
 * Development and E2E requests store no public address instead of trusting a header.
 */
export function observedPublicIp(
	environment: string | undefined,
	header: string | null,
): string | null {
	if (environment !== "production" || !header) {
		return null;
	}
	return isPublicIp(header) ? header : null;
}

export function machineOrigin(environment: string | undefined, origin: string): string {
	return environment === "production" ? "https://bat-ingest.worker.hexly.ai" : origin;
}
