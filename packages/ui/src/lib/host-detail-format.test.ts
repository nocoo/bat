import { describe, expect, test } from "vitest";
import { capitalizeVirt, formatBootTime, formatCpuLabel } from "./host-detail-format";

describe("formatCpuLabel", () => {
	test("model + cores+threads", () => {
		expect(formatCpuLabel("AMD EPYC 7763", 4, 8)).toBe("AMD EPYC 7763 (4 cores, 8 threads)");
	});

	test("model + cores only when physical == logical", () => {
		expect(formatCpuLabel("Intel i7", 4, 4)).toBe("Intel i7 (4 cores)");
	});

	test("model only when topology unknown", () => {
		expect(formatCpuLabel("Generic CPU", null, null)).toBe("Generic CPU");
	});

	test("topology only when no model", () => {
		expect(formatCpuLabel(null, 4, 8)).toBe("(4 cores, 8 threads)");
	});

	test("null when nothing supplied", () => {
		expect(formatCpuLabel(null, null, null)).toBeNull();
		expect(formatCpuLabel(undefined, undefined, undefined)).toBeNull();
	});
});

describe("capitalizeVirt", () => {
	test.each([
		["kvm", "KVM"],
		["vmware", "VMware"],
		["hyperv", "Hyper-V"],
		["bare-metal", "Bare Metal"],
		["digitalocean", "DigitalOcean"],
	])("known vendor %p → %p", (input, expected) => {
		expect(capitalizeVirt(input)).toBe(expected);
	});

	test("falls back to the raw value for unknowns", () => {
		expect(capitalizeVirt("proxmox")).toBe("proxmox");
		expect(capitalizeVirt("")).toBe("");
	});
});

describe("formatBootTime", () => {
	test("returns null when input is null or undefined", () => {
		expect(formatBootTime(null)).toBeNull();
		expect(formatBootTime(undefined)).toBeNull();
	});

	test("formats a unix timestamp as a non-empty locale string", () => {
		const out = formatBootTime(1_700_000_000);
		expect(out).not.toBeNull();
		expect(typeof out).toBe("string");
		expect((out as string).length).toBeGreaterThan(0);
	});

	test("produces the same string as Date(...).toLocaleString()", () => {
		const ts = 1_650_000_000;
		expect(formatBootTime(ts)).toBe(new Date(ts * 1000).toLocaleString());
	});

	test("accepts 0 (epoch) as a real timestamp, not null", () => {
		expect(formatBootTime(0)).toBe(new Date(0).toLocaleString());
	});
});
