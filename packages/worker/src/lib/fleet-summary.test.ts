import { describe, expect, test } from "bun:test";
import type { HostStatus } from "@bat/shared";
import { summarizeHostStatuses } from "./fleet-summary";

describe("summarizeHostStatuses", () => {
	test("returns all zeros + healthy overall for empty input", () => {
		expect(summarizeHostStatuses([])).toEqual({
			healthy: 0,
			warning: 0,
			critical: 0,
			maintenance: 0,
			overall: "healthy",
		});
	});

	test("folds offline into critical", () => {
		const statuses: HostStatus[] = ["offline", "offline", "healthy"];
		const out = summarizeHostStatuses(statuses);
		expect(out.critical).toBe(2);
		expect(out.healthy).toBe(1);
		expect(out.overall).toBe("critical");
	});

	test("reports degraded when there are warnings but no criticals", () => {
		const statuses: HostStatus[] = ["healthy", "warning", "warning"];
		const out = summarizeHostStatuses(statuses);
		expect(out.warning).toBe(2);
		expect(out.critical).toBe(0);
		expect(out.overall).toBe("degraded");
	});

	test("reports healthy when everything is healthy or in maintenance", () => {
		const statuses: HostStatus[] = ["healthy", "healthy", "maintenance"];
		const out = summarizeHostStatuses(statuses);
		expect(out.maintenance).toBe(1);
		expect(out.healthy).toBe(2);
		expect(out.overall).toBe("healthy");
	});

	test("critical takes precedence over warning in the overall verdict", () => {
		const statuses: HostStatus[] = ["warning", "critical", "healthy"];
		const out = summarizeHostStatuses(statuses);
		expect(out.overall).toBe("critical");
	});

	test("counts each bucket independently", () => {
		const statuses: HostStatus[] = [
			"healthy",
			"warning",
			"warning",
			"critical",
			"offline",
			"maintenance",
		];
		const out = summarizeHostStatuses(statuses);
		expect(out).toEqual({
			healthy: 1,
			warning: 2,
			critical: 2,
			maintenance: 1,
			overall: "critical",
		});
	});

	test("ignores unknown statuses (defensive)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: intentional unknown case
		const out = summarizeHostStatuses(["healthy", "bogus" as any, "warning"]);
		expect(out.healthy).toBe(1);
		expect(out.warning).toBe(1);
		expect(out.overall).toBe("degraded");
	});
});
