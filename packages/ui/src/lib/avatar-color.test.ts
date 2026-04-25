import { describe, expect, test } from "vitest";
import { AVATAR_COLORS, FALLBACK_COLOR, getAvatarColor, getDisplayName } from "./avatar-color";

describe("getAvatarColor", () => {
	test("returns fallback for null/undefined/empty", () => {
		expect(getAvatarColor(null)).toBe(FALLBACK_COLOR);
		expect(getAvatarColor(undefined)).toBe(FALLBACK_COLOR);
		expect(getAvatarColor("")).toBe(FALLBACK_COLOR);
	});

	test("is deterministic for a given email", () => {
		const a = getAvatarColor("alice@example.com");
		const b = getAvatarColor("alice@example.com");
		expect(a).toBe(b);
	});

	test("returns a color from the palette", () => {
		const color = getAvatarColor("bob@example.com");
		expect(AVATAR_COLORS).toContain(color as (typeof AVATAR_COLORS)[number]);
	});

	test("different emails generally map to different colors", () => {
		const colors = new Set(
			["a@x", "b@x", "c@x", "d@x", "e@x", "f@x", "g@x", "h@x"].map(getAvatarColor),
		);
		expect(colors.size).toBeGreaterThan(1);
	});

	test("uses sum of char codes mod palette length", () => {
		const email = "xy"; // 120 + 121 = 241, 241 % 16 = 1 → "bg-orange-500"
		expect(getAvatarColor(email)).toBe(AVATAR_COLORS[1]);
	});

	test("palette has 16 slots", () => {
		expect(AVATAR_COLORS).toHaveLength(16);
	});
});

describe("getDisplayName", () => {
	test("uses name when present", () => {
		expect(getDisplayName({ name: "Alice", email: "alice@example.com" })).toEqual({
			name: "Alice",
			initial: "A",
			email: "alice@example.com",
		});
	});

	test("falls back to email local part when name is absent", () => {
		expect(getDisplayName({ email: "bob@example.com" })).toEqual({
			name: "bob",
			initial: "B",
			email: "bob@example.com",
		});
	});

	test("falls back to 'User' when neither name nor email", () => {
		expect(getDisplayName({})).toEqual({ name: "User", initial: "U", email: null });
	});

	test("handles null user", () => {
		expect(getDisplayName(null)).toEqual({ name: "User", initial: "U", email: null });
		expect(getDisplayName(undefined)).toEqual({ name: "User", initial: "U", email: null });
	});

	test("uppercases first letter of initial", () => {
		expect(getDisplayName({ name: "alice" }).initial).toBe("A");
	});

	test("handles empty name gracefully", () => {
		expect(getDisplayName({ name: "", email: "bob@example.com" }).initial).toBe("B");
	});
});
