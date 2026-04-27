import type { DetectedSoftware, DiscoveredWebsite } from "@bat/shared";
import { describe, expect, test } from "vitest";
import {
	dedupeAndSortWebsites,
	groupSoftwareByCategory,
	softwareCategoryLabel,
	websiteUrl,
} from "./tier2-format";

const sw = (
	id: string,
	name: string,
	category: DetectedSoftware["category"],
): DetectedSoftware => ({
	id,
	name,
	category,
	version: null,
	source: "process",
	running: true,
	listening_ports: [],
});

describe("groupSoftwareByCategory", () => {
	test("groups + sorts categories by canonical order", () => {
		const out = groupSoftwareByCategory([
			sw("redis", "Redis", "cache"),
			sw("nginx", "Nginx", "web"),
			sw("pg", "PostgreSQL", "database"),
		]);
		expect(out.map(([c]) => c)).toEqual(["web", "database", "cache"]);
	});

	test("alphabetizes within category", () => {
		const out = groupSoftwareByCategory([
			sw("nginx", "Nginx", "web"),
			sw("apache", "Apache", "web"),
		]);
		expect(out[0]?.[1].map((s) => s.name)).toEqual(["Apache", "Nginx"]);
	});

	test("empty input → empty array", () => {
		expect(groupSoftwareByCategory([])).toEqual([]);
	});
});

describe("softwareCategoryLabel", () => {
	test("each category has a human label", () => {
		expect(softwareCategoryLabel("web")).toBe("Web Servers");
		expect(softwareCategoryLabel("database")).toBe("Databases");
		expect(softwareCategoryLabel("monitoring")).toBe("Monitoring");
	});
});

const site = (domain: string, ssl: boolean): DiscoveredWebsite => ({
	domain,
	web_server: "nginx",
	ssl,
});

describe("dedupeAndSortWebsites", () => {
	test("dedupes by domain (first wins)", () => {
		const out = dedupeAndSortWebsites([site("a.com", true), site("a.com", false)]);
		expect(out).toHaveLength(1);
		expect(out[0]?.ssl).toBe(true);
	});
	test("alphabetizes", () => {
		const out = dedupeAndSortWebsites([site("z.com", true), site("a.com", true)]);
		expect(out.map((s) => s.domain)).toEqual(["a.com", "z.com"]);
	});
	test("empty → empty", () => {
		expect(dedupeAndSortWebsites([])).toEqual([]);
	});
});

describe("websiteUrl", () => {
	test("https when ssl", () => {
		expect(websiteUrl(site("a.com", true))).toBe("https://a.com");
	});
	test("http when not ssl", () => {
		expect(websiteUrl(site("a.com", false))).toBe("http://a.com");
	});
});
