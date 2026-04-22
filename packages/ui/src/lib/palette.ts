/**
 * Chart + badge color palette — single source of truth for chart line/area
 * colors and tag/badge soft-tinted backgrounds.
 *
 * All colors are CSS custom properties (chart-1 .. chart-10) so they can be
 * themed via index.css.
 */

const v = (token: string) => `hsl(var(--${token}))`;

/** Named chart colors, used by recharts series. */
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

/** Ten tokens used for badges, tag dots, and the tag color picker. */
const BADGE_TOKENS = [
	"chart-1", // 0 pink 340°
	"chart-2", // 1 sky 200°
	"chart-3", // 2 teal 186°
	"chart-4", // 3 green 166°
	"chart-5", // 4 lime 142°
	"chart-6", // 5 amber 84°
	"chart-7", // 6 purple 270°
	"chart-8", // 7 orange 30°
	"chart-9", // 8 indigo 220°
	"chart-10", // 9 red 14°
] as const;

const PALETTE_LEN = BADGE_TOKENS.length;

/** Pick a palette token, wrapping negatives correctly. */
function tokenAt(idx: number): string {
	const n = ((idx % PALETTE_LEN) + PALETTE_LEN) % PALETTE_LEN;
	return BADGE_TOKENS[n] as string;
}

/** djb2 hash for any string (works with CJK / Unicode). Always non-negative. */
function hashText(str: string): number {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
	}
	return Math.abs(hash);
}

interface BadgeStyle {
	backgroundColor: string;
	color: string;
}
const styleFor = (token: string): BadgeStyle => ({
	backgroundColor: `hsl(var(--${token}) / 0.12)`,
	color: `hsl(var(--${token}))`,
});

/** Soft/tinted badge style derived from the text content (deterministic). */
export const getBadgeStyle = (text: string): BadgeStyle => styleFor(tokenAt(hashText(text)));

/** Soft/tinted badge style derived from a stored palette index. */
export const getBadgeStyleByIndex = (colorIndex: number): BadgeStyle =>
	styleFor(tokenAt(colorIndex));

/** Solid swatch color for the tag color picker (hsl, no alpha). */
export const getSwatchColor = (colorIndex: number): string => v(tokenAt(colorIndex));

/** Number of palette colors (used by UI to render the swatch grid). */
export const PALETTE_SIZE = PALETTE_LEN;
