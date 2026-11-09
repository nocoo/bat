import { describe, expect, it } from "vitest";
import { type HostsView, isHostsView, loadHostsView, saveHostsView } from "./host-view";

function memoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => Array.from(values.keys())[index] ?? null,
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => {
			values.set(key, value);
		},
	};
}

function blockedStorage(): Storage {
	const blocked = () => {
		throw new DOMException("blocked", "SecurityError");
	};
	return {
		length: 0,
		clear: blocked,
		getItem: blocked,
		key: () => null,
		removeItem: blocked,
		setItem: blocked,
	};
}

describe("isHostsView", () => {
	it("accepts exactly the two views", () => {
		expect(isHostsView("table")).toBe(true);
		expect(isHostsView("cards")).toBe(true);
		expect(isHostsView("grid")).toBe(false);
		expect(isHostsView("")).toBe(false);
		expect(isHostsView(null)).toBe(false);
	});
});

describe("loadHostsView", () => {
	it("defaults to the table", () => {
		expect(loadHostsView(memoryStorage())).toBe<HostsView>("table");
	});

	it("returns a stored valid view", () => {
		const storage = memoryStorage();
		storage.setItem("bat.hosts.view", "cards");
		expect(loadHostsView(storage)).toBe<HostsView>("cards");
	});

	it("falls back to the table on unknown values", () => {
		const storage = memoryStorage();
		storage.setItem("bat.hosts.view", "grid");
		expect(loadHostsView(storage)).toBe<HostsView>("table");
	});
});

describe("saveHostsView", () => {
	it("round-trips both views", () => {
		const storage = memoryStorage();
		saveHostsView("cards", storage);
		expect(loadHostsView(storage)).toBe<HostsView>("cards");
		saveHostsView("table", storage);
		expect(loadHostsView(storage)).toBe<HostsView>("table");
	});

	it("ignores a store that throws", () => {
		expect(() => saveHostsView("cards", blockedStorage())).not.toThrow();
	});
});
