// @bat/shared — Maintenance window utilities
// Source of truth: docs/17-maintenance-window.md

/**
 * Validate "HH:MM" format (00:00-23:59).
 * Requires exactly 2-digit hour and 2-digit minute, zero-padded.
 */
export function isValidTimeHHMM(time: string): boolean {
	if (!/^\d{2}:\d{2}$/.test(time)) {
		return false;
	}
	const parts = time.split(":");
	const h = Number(parts[0]);
	const m = Number(parts[1]);
	return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

/**
 * Check if a UTC time falls within a daily maintenance window.
 * Handles cross-midnight windows (start > end).
 *
 * Boundary rule: start is inclusive, end is exclusive.
 * e.g. window "03:00"-"05:00" includes 03:00 but excludes 05:00.
 *
 * @param nowHHMM  Current UTC time as "HH:MM"
 * @param start    Window start "HH:MM" UTC
 * @param end      Window end "HH:MM" UTC
 */
export function isInMaintenanceWindow(nowHHMM: string, start: string, end: string): boolean {
	if (start < end) {
		// Same-day window: start <= now < end
		return nowHHMM >= start && nowHHMM < end;
	}
	// Cross-midnight window: now >= start OR now < end
	return nowHHMM >= start || nowHHMM < end;
}

/**
 * Convert unix seconds to "HH:MM" UTC string.
 * Zero-padded, 24-hour format.
 */
export function toUtcHHMM(unixSeconds: number): string {
	const d = new Date(unixSeconds * 1000);
	const h = d.getUTCHours().toString().padStart(2, "0");
	const m = d.getUTCMinutes().toString().padStart(2, "0");
	return `${h}:${m}`;
}
