import { describe, expect, test } from "bun:test";
import { NAV_ITEMS } from "./sidebar";

describe("Sidebar NAV_ITEMS", () => {
	test("has exactly 2 navigation items", () => {
		expect(NAV_ITEMS).toHaveLength(2);
	});

	test("first item is Hosts", () => {
		expect(NAV_ITEMS[0]?.href).toBe("/hosts");
		expect(NAV_ITEMS[0]?.label).toBe("Hosts");
	});

	test("second item is Alerts", () => {
		expect(NAV_ITEMS[1]?.href).toBe("/alerts");
		expect(NAV_ITEMS[1]?.label).toBe("Alerts");
	});

	test("all items have icons", () => {
		for (const item of NAV_ITEMS) {
			expect(item.icon).toBeDefined();
		}
	});
});
