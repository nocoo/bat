import { describe, expect, test } from "bun:test";
import { maintenanceAreas } from "./maintenance-overlay";

const HOUR = 3600;
const DAY = 86400;
// Pick a UTC midnight for repeatable arithmetic
const MIDNIGHT = 1_700_000_000 - (1_700_000_000 % DAY);

describe("maintenanceAreas", () => {
	test("returns the single same-day window inside the chart range", () => {
		const out = maintenanceAreas("02:00", "04:00", MIDNIGHT, MIDNIGHT + DAY);
		expect(out).toEqual([{ x1: MIDNIGHT + 2 * HOUR, x2: MIDNIGHT + 4 * HOUR }]);
	});

	test("clamps the start when the window begins before the range", () => {
		const out = maintenanceAreas("02:00", "04:00", MIDNIGHT + 3 * HOUR, MIDNIGHT + 5 * HOUR);
		expect(out).toEqual([{ x1: MIDNIGHT + 3 * HOUR, x2: MIDNIGHT + 4 * HOUR }]);
	});

	test("emits one area per day across multi-day ranges", () => {
		const out = maintenanceAreas("02:00", "04:00", MIDNIGHT, MIDNIGHT + 3 * DAY);
		expect(out).toHaveLength(3);
		expect(out[0]).toEqual({ x1: MIDNIGHT + 2 * HOUR, x2: MIDNIGHT + 4 * HOUR });
		expect(out[2]).toEqual({
			x1: MIDNIGHT + 2 * DAY + 2 * HOUR,
			x2: MIDNIGHT + 2 * DAY + 4 * HOUR,
		});
	});

	test("handles cross-midnight windows (end < start)", () => {
		// 23:00 → 01:00, range covers exactly one such window
		const out = maintenanceAreas("23:00", "01:00", MIDNIGHT + 22 * HOUR, MIDNIGHT + 26 * HOUR);
		// Window begins at day 0 23:00 and ends at day 1 01:00
		expect(out).toEqual([{ x1: MIDNIGHT + 23 * HOUR, x2: MIDNIGHT + 25 * HOUR }]);
	});

	test("returns [] when range falls outside any window", () => {
		const out = maintenanceAreas("02:00", "04:00", MIDNIGHT + 10 * HOUR, MIDNIGHT + 12 * HOUR);
		expect(out).toEqual([]);
	});
});
