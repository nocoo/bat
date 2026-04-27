// Pure helpers for the maintenance-window UI. The backend stores window times
// as "HH:MM" UTC; users pick wall-clock local times. Keeping the conversion
// here (rather than in the component) means it's unit-testable and the View
// stays presentation-only.

const HHMM_RE = /^\d{2}:\d{2}$/;

function pad2(n: number): string {
	return n.toString().padStart(2, "0");
}

function parseHHMM(time: string): { h: number; m: number } | null {
	if (!HHMM_RE.test(time)) {
		return null;
	}
	const [hStr, mStr] = time.split(":");
	const h = Number(hStr);
	const m = Number(mStr);
	if (h < 0 || h > 23 || m < 0 || m > 59) {
		return null;
	}
	return { h, m };
}

/**
 * Convert a local "HH:MM" (in the browser's tz) to "HH:MM" UTC. Uses an
 * arbitrary reference date so DST is irrelevant for daily windows — only the
 * tz offset matters. Returns the input if invalid.
 */
export function localHHMMToUtc(local: string, offsetMinutes: number): string {
	const parsed = parseHHMM(local);
	if (!parsed) {
		return local;
	}
	const total = parsed.h * 60 + parsed.m - offsetMinutes;
	// Normalize into [0, 1440)
	const normalized = ((total % 1440) + 1440) % 1440;
	return `${pad2(Math.floor(normalized / 60))}:${pad2(normalized % 60)}`;
}

/** Inverse of localHHMMToUtc. */
export function utcHHMMToLocal(utc: string, offsetMinutes: number): string {
	return localHHMMToUtc(utc, -offsetMinutes);
}

/** "21:30 → 04:30 UTC" — the helper line shown next to a local time input. */
export function describeLocalAsUtc(local: string, offsetMinutes: number): string {
	return `${localHHMMToUtc(local, offsetMinutes)} UTC`;
}

/**
 * Browser's current tz offset in MINUTES east of UTC (positive for east).
 * `Date.prototype.getTimezoneOffset` returns the opposite sign — wrap it so
 * callers don't trip on the convention.
 */
export function currentTzOffsetMinutes(now: Date = new Date()): number {
	return -now.getTimezoneOffset();
}

export type WindowValidation =
	| { ok: true }
	| { ok: false; field: "start" | "end" | "range" | "reason"; message: string };

/**
 * Validates the user-facing form (local times). Backend re-validates UTC
 * times, but mirroring the rules here gives instant feedback and avoids a
 * round-trip for obviously invalid input.
 */
export function validateWindow(
	startLocal: string,
	endLocal: string,
	reason: string,
): WindowValidation {
	if (!parseHHMM(startLocal)) {
		return { ok: false, field: "start", message: "Invalid start time" };
	}
	if (!parseHHMM(endLocal)) {
		return { ok: false, field: "end", message: "Invalid end time" };
	}
	if (startLocal === endLocal) {
		return { ok: false, field: "range", message: "Start and end must differ" };
	}
	if (reason.length > 200) {
		return { ok: false, field: "reason", message: "Reason must be ≤ 200 chars" };
	}
	return { ok: true };
}
