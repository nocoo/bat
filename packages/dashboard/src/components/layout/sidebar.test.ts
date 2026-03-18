import { describe, expect, test } from "bun:test";
import { NAV_GROUPS, NAV_ITEMS } from "./sidebar";

describe("Sidebar NAV_GROUPS", () => {
	test("has exactly 2 navigation groups", () => {
		expect(NAV_GROUPS).toHaveLength(2);
	});

	test("Monitoring group has Hosts, Alerts, and Tags", () => {
		const monitoring = NAV_GROUPS[0];
		expect(monitoring?.label).toBe("Monitoring");
		expect(monitoring?.items).toHaveLength(3);
		expect(monitoring?.items[0]?.href).toBe("/hosts");
		expect(monitoring?.items[0]?.label).toBe("Hosts");
		expect(monitoring?.items[1]?.href).toBe("/alerts");
		expect(monitoring?.items[1]?.label).toBe("Alerts");
		expect(monitoring?.items[2]?.href).toBe("/tags");
		expect(monitoring?.items[2]?.label).toBe("Tags");
	});

	test("Settings group has Setup", () => {
		const settings = NAV_GROUPS[1];
		expect(settings?.label).toBe("Settings");
		expect(settings?.items).toHaveLength(1);
		expect(settings?.items[0]?.href).toBe("/setup");
		expect(settings?.items[0]?.label).toBe("Setup");
	});

	test("all groups default open", () => {
		for (const group of NAV_GROUPS) {
			expect(group.defaultOpen).toBe(true);
		}
	});

	test("all items have icons", () => {
		for (const group of NAV_GROUPS) {
			for (const item of group.items) {
				expect(item.icon).toBeDefined();
			}
		}
	});
});

describe("Sidebar NAV_ITEMS (flat)", () => {
	test("has exactly 4 navigation items", () => {
		expect(NAV_ITEMS).toHaveLength(4);
	});

	test("first item is Hosts", () => {
		expect(NAV_ITEMS[0]?.href).toBe("/hosts");
		expect(NAV_ITEMS[0]?.label).toBe("Hosts");
	});

	test("second item is Alerts", () => {
		expect(NAV_ITEMS[1]?.href).toBe("/alerts");
		expect(NAV_ITEMS[1]?.label).toBe("Alerts");
	});

	test("third item is Tags", () => {
		expect(NAV_ITEMS[2]?.href).toBe("/tags");
		expect(NAV_ITEMS[2]?.label).toBe("Tags");
	});

	test("fourth item is Setup", () => {
		expect(NAV_ITEMS[3]?.href).toBe("/setup");
		expect(NAV_ITEMS[3]?.label).toBe("Setup");
	});
});
