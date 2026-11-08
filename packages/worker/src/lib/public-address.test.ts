// Derivation of the per-family public addresses from the stored columns.
//
// The legacy `public_ip` column may hold junk, so it only fills a family when it
// actually parses as that family. An invalid value never surfaces and never wins
// the preferred slot.

import { describe, expect, test } from "vitest";
import { resolvePublicAddresses } from "./public-address.js";

describe("resolvePublicAddresses", () => {
	test("uses the stored family columns when they hold literals", () => {
		expect(
			resolvePublicAddresses({
				public_ip: "203.0.113.1",
				public_ip_v4: "198.51.100.7",
				public_ip_v6: "2001:db8::2",
			}),
		).toEqual({
			public_ip: "198.51.100.7",
			public_ip_v4: "198.51.100.7",
			public_ip_v6: "2001:db8::2",
		});
	});

	test("falls back to the legacy value per family", () => {
		expect(
			resolvePublicAddresses({
				public_ip: "203.0.113.1",
				public_ip_v4: null,
				public_ip_v6: null,
			}),
		).toEqual({
			public_ip: "203.0.113.1",
			public_ip_v4: "203.0.113.1",
			public_ip_v6: null,
		});
		expect(
			resolvePublicAddresses({
				public_ip: "2001:db8::2",
				public_ip_v4: null,
				public_ip_v6: null,
			}),
		).toEqual({
			public_ip: "2001:db8::2",
			public_ip_v4: null,
			public_ip_v6: "2001:db8::2",
		});
	});

	test("drops legacy values that are not literals", () => {
		for (const legacy of ["", "   ", "999.1.1.1", "1..2.345", "2001:::1", ":", "not-an-ip"]) {
			expect(
				resolvePublicAddresses({
					public_ip: legacy,
					public_ip_v4: null,
					public_ip_v6: null,
				}),
			).toEqual({ public_ip: null, public_ip_v4: null, public_ip_v6: null });
		}
	});

	test("an invalid legacy value never wins over a later valid IPv6", () => {
		expect(
			resolvePublicAddresses({
				public_ip: "999.1.1.1",
				public_ip_v4: null,
				public_ip_v6: "2001:db8::2",
			}),
		).toEqual({
			public_ip: "2001:db8::2",
			public_ip_v4: null,
			public_ip_v6: "2001:db8::2",
		});
	});

	test("a stored family column wins over the legacy value", () => {
		expect(
			resolvePublicAddresses({
				public_ip: "203.0.113.1",
				public_ip_v4: "198.51.100.7",
				public_ip_v6: null,
			}),
		).toEqual({
			public_ip: "198.51.100.7",
			public_ip_v4: "198.51.100.7",
			public_ip_v6: null,
		});
	});

	test("an invalid stored family column falls back to the legacy value", () => {
		expect(
			resolvePublicAddresses({
				public_ip: "203.0.113.1",
				public_ip_v4: "",
				public_ip_v6: "not-an-ip",
			}),
		).toEqual({
			public_ip: "203.0.113.1",
			public_ip_v4: "203.0.113.1",
			public_ip_v6: null,
		});
	});

	test("prefers IPv4 as the preferred address", () => {
		expect(
			resolvePublicAddresses({
				public_ip: "203.0.113.1",
				public_ip_v4: "203.0.113.1",
				public_ip_v6: "2001:db8::2",
			}).public_ip,
		).toBe("203.0.113.1");
		expect(
			resolvePublicAddresses({
				public_ip: "2001:db8::2",
				public_ip_v4: null,
				public_ip_v6: "2001:db8::2",
			}).public_ip,
		).toBe("2001:db8::2");
	});
});
