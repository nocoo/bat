import { describe, expect, test } from "bun:test";
import { buildProbeManifest, parseChecksum } from "./probe-manifest.mjs";

const digest = "a".repeat(64);

describe("parseChecksum", () => {
	test("reads the sha256sum line for the expected file", () => {
		expect(parseChecksum(`${digest}  bat-probe-linux-x86_64\n`, "bat-probe-linux-x86_64")).toBe(
			digest,
		);
	});

	test("accepts the binary marker variant", () => {
		expect(parseChecksum(`${digest} *bat-probe-linux-aarch64`, "bat-probe-linux-aarch64")).toBe(
			digest,
		);
	});

	test("rejects a mismatched or malformed file", () => {
		expect(() => parseChecksum(`${digest}  other-file\n`, "bat-probe-linux-x86_64")).toThrow(
			/checksum names/,
		);
		expect(() => parseChecksum("not a checksum", "bat-probe-linux-x86_64")).toThrow(/sha256 line/);
	});
});

describe("buildProbeManifest", () => {
	test("describes both architectures with stable latest URLs", () => {
		const manifest = buildProbeManifest({
			version: "3.1.1",
			releasedAt: "2026-11-07T06:00:00Z",
			checksums: { x86_64: digest, aarch64: "b".repeat(64) },
		});
		expect(manifest.component).toBe("bat-probe");
		expect(manifest.unit_url).toBe("https://s.zhe.to/apps/bat/latest/bat-probe.service");
		expect(manifest.manifest_url).toBe("https://s.zhe.to/apps/bat/latest/manifest.json");
		expect(manifest.artifacts.x86_64).toEqual({
			url: "https://s.zhe.to/apps/bat/latest/bat-probe-linux-x86_64",
			sha256: digest,
			sha256_url: "https://s.zhe.to/apps/bat/latest/bat-probe-linux-x86_64.sha256",
			versioned_url: "https://s.zhe.to/apps/bat/3.1.1/bat-probe-linux-x86_64",
		});
		expect(manifest.artifacts.aarch64.sha256).toBe("b".repeat(64));
	});

	test("refuses a broken version or a missing digest", () => {
		expect(() => buildProbeManifest({ version: "v3.1", releasedAt: "", checksums: {} })).toThrow(
			/invalid version/,
		);
		expect(() =>
			buildProbeManifest({
				version: "3.1.1",
				releasedAt: "",
				checksums: { x86_64: "short" },
			}),
		).toThrow(/missing sha256/);
	});
});
