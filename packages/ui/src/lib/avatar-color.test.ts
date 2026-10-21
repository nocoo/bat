import { describe, expect, test } from "vitest";
import { getDisplayName } from "./avatar-color";

describe("getDisplayName", () => {
	test("uses name when present", () => {
		expect(getDisplayName({ name: "Alice", email: "alice@example.com" })).toEqual({
			name: "Alice",
			initial: "A",
			email: "alice@example.com",
			avatar: null,
		});
	});

	test("falls back to email local part when name is absent", () => {
		expect(getDisplayName({ email: "bob@example.com" })).toEqual({
			name: "bob",
			initial: "B",
			email: "bob@example.com",
			avatar: null,
		});
	});

	test("falls back to 'User' when neither name nor email", () => {
		expect(getDisplayName({})).toEqual({ name: "User", initial: "U", email: null, avatar: null });
	});

	test("handles null user", () => {
		expect(getDisplayName(null)).toEqual({ name: "User", initial: "U", email: null, avatar: null });
		expect(getDisplayName(undefined)).toEqual({
			name: "User",
			initial: "U",
			email: null,
			avatar: null,
		});
	});

	test("passes through a profile avatar URL", () => {
		expect(
			getDisplayName({
				name: "Zheng Li",
				email: "architie@gmail.com",
				avatar: "https://cdn.example/avatar-80.jpg",
			}).avatar,
		).toBe("https://cdn.example/avatar-80.jpg");
	});

	test("treats empty avatar as null", () => {
		expect(getDisplayName({ name: "A", avatar: "" }).avatar).toBeNull();
	});

	test("uppercases first letter of initial", () => {
		expect(getDisplayName({ name: "alice" }).initial).toBe("A");
	});

	test("handles empty name gracefully", () => {
		expect(getDisplayName({ name: "", email: "bob@example.com" }).initial).toBe("B");
	});
});
