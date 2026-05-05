// @bat/shared — Data retention settings

/** Allowed retention window values (in days). */
export const RETENTION_OPTIONS = [1, 7, 30] as const;

/** The type for a valid retention_days value. */
export type RetentionDays = (typeof RETENTION_OPTIONS)[number];

/** Default retention window when no setting exists or the stored value is invalid. */
export const DEFAULT_RETENTION_DAYS: RetentionDays = 7;

/** Settings response shape returned by GET /api/settings. */
export interface SettingsResponse {
	retention_days: RetentionDays;
}

/** Settings update body accepted by PUT /api/settings. */
export interface SettingsUpdateBody {
	retention_days: RetentionDays;
}

/**
 * Parse and validate a retention_days value from any source (DB string, API body, etc.).
 * Returns one of 1 | 7 | 30 if valid, or null if invalid.
 * This is the single source of truth for validation — all call sites must use it.
 */
export function parseRetentionDays(value: unknown): RetentionDays | null {
	const num =
		typeof value === "string" ? Number(value) : typeof value === "number" ? value : Number.NaN;
	if (RETENTION_OPTIONS.includes(num as RetentionDays)) {
		return num as RetentionDays;
	}
	return null;
}
