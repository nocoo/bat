// Pure helpers for deriving user avatar presentation from email/name.
// Extracted from sidebar.tsx so they can be unit-tested.

const AVATAR_COLORS = [
	"bg-red-500",
	"bg-orange-500",
	"bg-amber-500",
	"bg-yellow-500",
	"bg-lime-500",
	"bg-green-500",
	"bg-emerald-500",
	"bg-teal-500",
	"bg-cyan-500",
	"bg-sky-500",
	"bg-blue-500",
	"bg-indigo-500",
	"bg-violet-500",
	"bg-purple-500",
	"bg-fuchsia-500",
	"bg-pink-500",
] as const;

const FALLBACK_COLOR = "bg-muted-foreground";

/**
 * Deterministic Tailwind background color for an avatar, derived from the
 * user's email. Returns a muted fallback when email is null/empty.
 */
export function getAvatarColor(email: string | null | undefined): string {
	if (!email) {
		return FALLBACK_COLOR;
	}
	let hash = 0;
	for (let i = 0; i < email.length; i++) {
		hash += email.charCodeAt(i);
	}
	return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? FALLBACK_COLOR;
}

/** Display name + first-letter initial derived from user record. */
export function getDisplayName(
	user: { name?: string | null; email?: string | null } | null | undefined,
): { name: string; initial: string; email: string | null } {
	const email = user?.email ?? null;
	const rawName = user?.name;
	const name = rawName && rawName.length > 0 ? rawName : (email?.split("@")[0] ?? "User");
	const initial = (name.charAt(0) || "U").toUpperCase();
	return { name, initial, email };
}

export { AVATAR_COLORS, FALLBACK_COLOR };
