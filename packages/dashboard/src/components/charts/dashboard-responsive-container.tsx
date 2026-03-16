"use client";

import type { ComponentProps } from "react";
import { ResponsiveContainer } from "recharts";

/**
 * Thin wrapper around recharts ResponsiveContainer that adds a debounce
 * to avoid excessive re-renders when the browser window is being resized.
 */
export function DashboardResponsiveContainer({
	debounce = 180,
	...props
}: ComponentProps<typeof ResponsiveContainer>) {
	return <ResponsiveContainer debounce={debounce} {...props} />;
}
