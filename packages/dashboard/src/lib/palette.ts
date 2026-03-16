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
