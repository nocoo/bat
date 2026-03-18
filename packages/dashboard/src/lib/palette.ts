/**
 * Chart color palette — maps CSS custom properties to JS constants.
 * Keeps chart colors centralized instead of scattered across components.
 */

const v = (token: string) => `hsl(var(--${token}))`;

export const chart = {
	pink: v("chart-1"),
	sky: v("chart-2"),
	teal: v("chart-3"),
	green: v("chart-4"),
	lime: v("chart-5"),
	amber: v("chart-6"),
	purple: v("chart-7"),
	orange: v("chart-8"),
	indigo: v("chart-9"),
	red: v("chart-10"),
} as const;

export const chartAxis = v("chart-axis");
export const chartMuted = v("chart-muted");

/**
 * Tag color palette — maps color index (0-9) to CSS custom property.
 * Used by TagChip component and tag management UI.
 */
export const TAG_COLORS: readonly string[] = [
	v("chart-1"), // 0: pink
	v("chart-2"), // 1: sky
	v("chart-3"), // 2: teal
	v("chart-4"), // 3: green
	v("chart-5"), // 4: lime
	v("chart-6"), // 5: amber
	v("chart-7"), // 6: purple
	v("chart-8"), // 7: orange
	v("chart-9"), // 8: indigo
	v("chart-10"), // 9: red
] as const;

/** Get tag color by palette index (wraps around) */
export function getTagColor(colorIndex: number): string {
	const idx = ((colorIndex % TAG_COLORS.length) + TAG_COLORS.length) % TAG_COLORS.length;
	// biome-ignore lint: TAG_COLORS is a fixed 10-element array, idx is always 0-9
	return TAG_COLORS[idx]!;
}
