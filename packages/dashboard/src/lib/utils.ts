import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Generate a stable hash from a string.
 * Uses a simple but effective algorithm that works well with Chinese characters.
 */
export function hashString(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash);
}

/**
 * Avatar color palette - carefully selected for good contrast with white text.
 * Uses HSL for consistent saturation and lightness.
 */
const AVATAR_COLORS = [
	"bg-badge-red", // 0
	"bg-purple", // 1
	"bg-purple/85", // 2
	"bg-purple/70", // 3
	"bg-info", // 4
	"bg-info/85", // 5
	"bg-primary", // 6
	"bg-info/70", // 7
	"bg-teal", // 8
	"bg-teal/85", // 9
	"bg-success", // 10
	"bg-success/85", // 11
	"bg-muted-foreground", // 12
	"bg-warning", // 13
	"bg-primary/85", // 14
	"bg-destructive", // 15
] as const;

/**
 * Get a consistent avatar background color based on name.
 * Same name always returns the same color.
 */
export function getAvatarColor(name: string): string {
	const hash = hashString(name);
	const index = hash % AVATAR_COLORS.length;
	return AVATAR_COLORS[index] ?? AVATAR_COLORS[0];
}
