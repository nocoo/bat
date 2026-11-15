import { describe, expect, test } from "vitest";
import { isWorkstationsView, loadWorkstationsView, saveWorkstationsView } from "./workstation-view";

function memoryStorage(initial: Record<string, string> = {}): Storage {
	const store = new Map(Object.entries(initial));
	return {
		get length() {
			return store.size;
		},
		clear: () => store.clear(),
		getItem: (key) => store.get(key) ?? null,
		key: (index) => [...store.keys()][index] ?? null,
		removeItem: (key) => {
			store.delete(key);
		},
		setItem: (key, value) => {
			store.set(key, value);
		},
	};
}

describe("workstation view preference", () => {
	test("validates view literals", () => {
		expect(isWorkstationsView("table")).toBe(true);
		expect(isWorkstationsView("cards")).toBe(true);
		expect(isWorkstationsView("grid")).toBe(false);
		expect(isWorkstationsView(null)).toBe(false);
	});

	test("defaults to table when storage is empty or invalid", () => {
		expect(loadWorkstationsView(memoryStorage())).toBe("table");
		expect(loadWorkstationsView(memoryStorage({ "bat.workstations.view": "bogus" }))).toBe("table");
	});

	test("round-trips cards preference and ignores storage errors", () => {
		const storage = memoryStorage();
		saveWorkstationsView("cards", storage);
		expect(loadWorkstationsView(storage)).toBe("cards");

		const failingStorage = {
			...memoryStorage(),
			setItem: () => {
				throw new Error("QuotaExceededError");
			},
		} as Storage;
		expect(() => saveWorkstationsView("cards", failingStorage)).not.toThrow();
	});
});
