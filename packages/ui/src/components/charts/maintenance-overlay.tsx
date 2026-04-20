/**
 * Compute time ranges for maintenance window overlay on charts.
 * For a daily repeating HH:MM→HH:MM window, returns unix-second
 * intervals that fall within the given chart range.
 */
export function maintenanceAreas(
	start: string, // "HH:MM" UTC
	end: string, // "HH:MM" UTC
	rangeFrom: number, // unix seconds (chart X axis start)
	rangeTo: number, // unix seconds (chart X axis end)
): { x1: number; x2: number }[] {
	const [startH = 0, startM = 0] = start.split(":").map(Number);
	const [endH = 0, endM = 0] = end.split(":").map(Number);

	const areas: { x1: number; x2: number }[] = [];

	// Iterate day by day from rangeFrom-1day to rangeTo+1day (to catch cross-midnight)
	const dayStart = Math.floor(rangeFrom / 86400) * 86400 - 86400;
	const dayEnd = Math.floor(rangeTo / 86400) * 86400 + 86400;

	for (let dayTs = dayStart; dayTs <= dayEnd; dayTs += 86400) {
		const windowStart = dayTs + startH * 3600 + startM * 60;
		let windowEnd: number;

		if (start < end) {
			// Same-day window
			windowEnd = dayTs + endH * 3600 + endM * 60;
		} else {
			// Cross-midnight: end is the next day
			windowEnd = dayTs + 86400 + endH * 3600 + endM * 60;
		}

		// Clamp to chart range
		const x1 = Math.max(windowStart, rangeFrom);
		const x2 = Math.min(windowEnd, rangeTo);

		if (x1 < x2) {
			areas.push({ x1, x2 });
		}
	}

	return areas;
}
