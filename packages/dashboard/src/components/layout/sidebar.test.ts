import { describe, expect, test } from "bun:test";
import { NAV_ITEMS } from "./sidebar";

describe("Sidebar NAV_ITEMS", () => {
	test("has exactly 3 navigation items", () => {
		expect(NAV_ITEMS).toHaveLength(3);
	});

	test("first item is Hosts", () => {
		expect(NAV_ITEMS[0]?.href).toBe("/hosts");
		expect(NAV_ITEMS[0]?.label).toBe("Hosts");
	});

	test("second item is Alerts", () => {
		expect(NAV_ITEMS[1]?.href).toBe("/alerts");
		expect(NAV_ITEMS[1]?.label).toBe("Alerts");
	});

	test("third item is Setup", () => {
		expect(NAV_ITEMS[2]?.href).toBe("/setup");
		expect(NAV_ITEMS[2]?.label).toBe("Setup");
	});

	test("all items have icons", () => {
		for (const item of NAV_ITEMS) {
			expect(item.icon).toBeDefined();
		}
	});
});
