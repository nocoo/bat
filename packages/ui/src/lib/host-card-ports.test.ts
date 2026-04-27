import type { AlertItem } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { countOpenPublicPorts } from "./host-card-ports";

const a = (host_id: string, rule_id: string): AlertItem => ({
	hid: "h",
	host_id,
	hostname: "h",
	rule_id,
	severity: "warning",
	value: null,
	triggered_at: 0,
	message: null,
});

describe("countOpenPublicPorts", () => {
	test("counts only public_port for the matching host", () => {
		const alerts = [
			a("host-1", "public_port"),
			a("host-1", "public_port"),
			a("host-1", "cpu_high"),
			a("host-2", "public_port"),
		];
		expect(countOpenPublicPorts(alerts, "host-1")).toBe(2);
		expect(countOpenPublicPorts(alerts, "host-2")).toBe(1);
		expect(countOpenPublicPorts(alerts, "host-3")).toBe(0);
	});

	test("undefined alerts → 0", () => {
		expect(countOpenPublicPorts(undefined, "host-1")).toBe(0);
	});

	test("empty alerts → 0", () => {
		expect(countOpenPublicPorts([], "host-1")).toBe(0);
	});
});
