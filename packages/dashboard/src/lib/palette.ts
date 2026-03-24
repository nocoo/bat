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
 * Badge color palette — soft/tinted style following Basalt design system.
 * Each entry: [bg class, text class] using chart CSS custom properties.
 * Style: bg-color/12 (light tint) + text-color (vivid foreground).
 */
export const BADGE_PALETTE = [
	{ bg: "chart-1", label: "pink" }, // 0: pink 340°
	{ bg: "chart-2", label: "sky" }, // 1: sky 200°
	{ bg: "chart-3", label: "teal" }, // 2: teal 186°
	{ bg: "chart-4", label: "green" }, // 3: green 166°
	{ bg: "chart-5", label: "lime" }, // 4: lime 142°
	{ bg: "chart-6", label: "amber" }, // 5: amber 84°
	{ bg: "chart-7", label: "purple" }, // 6: purple 270°
	{ bg: "chart-8", label: "orange" }, // 7: orange 30°
	{ bg: "chart-9", label: "indigo" }, // 8: indigo 220°
	{ bg: "chart-10", label: "red" }, // 9: red 14°
] as const;

/**
 * Stable hash for any string (supports CJK / Unicode).
 * Same input always returns the same number (djb2 algorithm).
 */
function hashText(str: string): number {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
	}
	return Math.abs(hash);
}

/**
 * Get soft/tinted badge style by text content — deterministic hash-based.
 * Returns inline style object with backgroundColor and color using CSS vars.
 */
export function getBadgeStyle(text: string): {
	backgroundColor: string;
	color: string;
} {
	const idx = hashText(text) % BADGE_PALETTE.length;
	// biome-ignore lint/style/noNonNullAssertion: BADGE_PALETTE is a fixed 10-element array, idx is always 0-9
	const token = BADGE_PALETTE[idx]!.bg;
	return {
		backgroundColor: `hsl(var(--${token}) / 0.12)`,
		color: `hsl(var(--${token}))`,
	};
}

/**
 * Get soft/tinted badge style by numeric palette index (for tags with stored color).
 * Uses the same BADGE_PALETTE as hash-based version.
 */
export function getBadgeStyleByIndex(colorIndex: number): {
	backgroundColor: string;
	color: string;
} {
	const idx = ((colorIndex % BADGE_PALETTE.length) + BADGE_PALETTE.length) % BADGE_PALETTE.length;
	// biome-ignore lint/style/noNonNullAssertion: BADGE_PALETTE is a fixed 10-element array, idx is always 0-9
	const token = BADGE_PALETTE[idx]!.bg;
	return {
		backgroundColor: `hsl(var(--${token}) / 0.12)`,
		color: `hsl(var(--${token}))`,
	};
}

/** @deprecated Use getBadgeStyleByIndex instead */
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

/** @deprecated Use getBadgeStyleByIndex instead */
export function getTagColor(colorIndex: number): string {
	const idx = ((colorIndex % TAG_COLORS.length) + TAG_COLORS.length) % TAG_COLORS.length;
	// biome-ignore lint/style/noNonNullAssertion: TAG_COLORS is a fixed 10-element array, idx is always 0-9
	return TAG_COLORS[idx]!;
}
