import { describe, expect, test } from "vitest";
import { abbreviateAddress, IP_ADDRESS_BUDGET } from "./ip-abbreviation";

describe("abbreviateAddress", () => {
	test("keeps IPv4 complete", () => {
		expect(abbreviateAddress("10.0.1.10")).toBe("10.0.1.10");
		expect(abbreviateAddress("203.0.113.10")).toBe("203.0.113.10");
		expect(abbreviateAddress("255.255.255.255")).toBe("255.255.255.255");
		expect(abbreviateAddress("123.123.123.123")).toBe("123.123.123.123");
	});

	test("shows an IPv6 as two head groups, an ellipsis and a tail group", () => {
		expect(abbreviateAddress("2a0b:9900:1234:5678:9abc:def0:1234:232d")).toBe("2a0b:9900…232d");
		expect(abbreviateAddress("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8…7348");
		expect(abbreviateAddress("fd7a:115c:a1e0:ab12:4843:cd96:6269:8e0f")).toBe("fd7a:115c…8e0f");
		expect(abbreviateAddress("2001:0db8:85a3:0000:0000:8a2e:0370:7348")).toBe("2001:0db8…7348");
	});

	test("keeps the head and the tail of the original", () => {
		const literals = [
			"2001:db8:85a3:8d3:1319:8a2e:370:7348",
			"2a0b:9900:1234:5678:9abc:def0:1234:232d",
			"fd7a:115c:a1e0:ab12:4843:cd96:6269:8e0f",
			"2001:0db8:85a3:0000:0000:8a2e:0370:7348",
		];
		for (const literal of literals) {
			const short = abbreviateAddress(literal);
			const [head, tail] = short.split("…");
			expect(head).toBeTruthy();
			expect(tail).toBeTruthy();
			expect(literal.startsWith(head)).toBe(true);
			expect(literal.endsWith(tail)).toBe(true);
		}
	});

	test("never exceeds the short form length", () => {
		const literals = [
			"2001:db8:85a3:8d3:1319:8a2e:370:7348",
			"2a0b:9900:1234:5678:9abc:def0:1234:232d",
			"fd7a:115c:a1e0:ab12:4843:cd96:6269:8e0f",
			"2001:0db8:85a3:0000:0000:8a2e:0370:7348",
		];
		for (const literal of literals) {
			expect(abbreviateAddress(literal).length).toBeLessThanOrEqual(IP_ADDRESS_BUDGET);
		}
	});

	test("normalises the compression marker of a compressed IPv6", () => {
		expect(abbreviateAddress("fe80::5054:ff:fe12:3456")).toBe("fe80:5054…3456");
		expect(abbreviateAddress("fe80::6245:bdff:fe53:27b1")).toBe("fe80:6245…27b1");
	});

	test("keeps a literal with fewer than three groups whole", () => {
		expect(abbreviateAddress("::1")).toBe("::1");
		expect(abbreviateAddress("fe80::1")).toBe("fe80::1");
		expect(abbreviateAddress("2001:db8::")).toBe("2001:db8::");
	});
});
