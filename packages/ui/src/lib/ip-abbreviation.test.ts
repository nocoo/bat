import { describe, expect, test } from "vitest";
import { abbreviateAddress, IP_CHIP_BUDGET } from "./ip-abbreviation";

describe("abbreviateAddress", () => {
	test("keeps IPv4 complete, whatever its length", () => {
		expect(abbreviateAddress("10.0.1.10")).toBe("10.0.1.10");
		expect(abbreviateAddress("203.0.113.10")).toBe("203.0.113.10");
		expect(abbreviateAddress("255.255.255.255")).toBe("255.255.255.255");
	});

	test("keeps a literal that already fits", () => {
		expect(abbreviateAddress("::1")).toBe("::1");
		expect(abbreviateAddress("2001:db8::1")).toBe("2001:db8::1");
		expect(abbreviateAddress("2a0b:9900::ec0")).toBe("2a0b:9900::ec0");
	});

	test("abbreviates the middle of a long IPv6", () => {
		expect(abbreviateAddress("2a0b:9900:1234:5678:9abc:def0:1234:ec0b")).toBe("2a0b:9900…ec0b");
		expect(abbreviateAddress("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8…7348");
		expect(abbreviateAddress("fe80::5054:ff:fe12:3456")).toBe("fe80::505…3456");
	});

	test("never leaves a colon next to the ellipsis", () => {
		const literals = [
			"2001:db8:85a3:8d3:1319:8a2e:370:7348",
			"2a0b:9900:1234:5678:9abc:def0:1234:ec0b",
			"fe80::5054:ff:fe12:3456",
			"2001:0db8:0000:0000:0000:0000:0000:0001",
			"fd7a:115c:a1e0:ab12:4843:cd96:6269:8e0f",
		];
		for (const literal of literals) {
			const short = abbreviateAddress(literal);
			expect(short).not.toContain(":…");
			expect(short).not.toContain("…:");
			expect(short.startsWith(":")).toBe(false);
			expect(short.endsWith(":")).toBe(false);
		}
	});

	test("stays inside the budget and keeps the head and tail of the original", () => {
		const literals = [
			"2001:db8:85a3:8d3:1319:8a2e:370:7348",
			"2a0b:9900:1234:5678:9abc:def0:1234:ec0b",
			"fe80::5054:ff:fe12:3456",
			"2001:0db8:0000:0000:0000:0000:0000:0001",
		];
		for (const literal of literals) {
			const short = abbreviateAddress(literal);
			expect(short.length).toBeLessThanOrEqual(IP_CHIP_BUDGET);
			const [head, tail] = short.split("…");
			expect(head).toBeTruthy();
			expect(tail).toBeTruthy();
			expect(literal.startsWith(head)).toBe(true);
			expect(literal.endsWith(tail)).toBe(true);
		}
	});

	test("never abbreviates a compressed literal that fits", () => {
		const compressed = "2a0b:9900::ec0";
		expect(compressed).toHaveLength(14);
		expect(abbreviateAddress(compressed)).toBe(compressed);
		expect(abbreviateAddress(compressed)).not.toContain("…");
	});

	test("honours an explicit smaller budget", () => {
		const short = abbreviateAddress("2001:db8:85a3:8d3:1319:8a2e:370:7348", 10);
		expect(short.length).toBeLessThanOrEqual(10);
		expect(short).toContain("…");
	});

	test("degrades to the ellipsis when the budget is too small to split", () => {
		expect(abbreviateAddress("2001:db8:85a3::1", 2)).toBe("…");
		expect(abbreviateAddress("2001:db8:85a3::1", 1)).toBe("…");
	});
});
