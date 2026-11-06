// Tests for trusted workstation origins.

import { describe, expect, test } from "vitest";
import {
	isExpectedWorkerUrl,
	resolveOrigins,
	TRUSTED_DASHBOARD_ORIGIN,
	TRUSTED_MACHINE_ORIGIN,
} from "./origins.js";

describe("resolveOrigins", () => {
	test("derives the machine origin from the trusted dashboard origin", () => {
		expect(resolveOrigins()).toStrictEqual({
			dashboard: TRUSTED_DASHBOARD_ORIGIN,
			machine: TRUSTED_MACHINE_ORIGIN,
		});
	});

	test("uses one origin for explicit loopback acceptance", () => {
		expect(resolveOrigins("http://127.0.0.1:8787")).toStrictEqual({
			dashboard: "http://127.0.0.1:8787",
			machine: "http://127.0.0.1:8787",
		});
		expect(resolveOrigins("http://localhost:8787/").dashboard).toBe("http://localhost:8787");
		expect(resolveOrigins("http://[::1]:8787").machine).toBe("http://[::1]:8787");
		expect(resolveOrigins("https://127.0.0.1:8787").dashboard).toBe("https://127.0.0.1:8787");
	});

	test("rejects non-loopback and malformed overrides", () => {
		expect(() => resolveOrigins("https://bat.hexly.ai")).toThrow(/loopback/);
		expect(() => resolveOrigins("not a url")).toThrow(/invalid --loopback-url/);
		expect(() => resolveOrigins("ftp://127.0.0.1")).toThrow(/http or https/);
		expect(() => resolveOrigins("http://user:pass@127.0.0.1:8787")).toThrow(/credentials/);
		expect(() => resolveOrigins("http://127.0.0.1:8787?x=1")).toThrow(/query or fragment/);
		expect(() => resolveOrigins("http://127.0.0.1:8787/api")).toThrow(/without a path/);
	});
});

describe("isExpectedWorkerUrl", () => {
	test("accepts exactly the expected origin", () => {
		expect(isExpectedWorkerUrl("https://bat-ingest.worker.hexly.ai", TRUSTED_MACHINE_ORIGIN)).toBe(
			true,
		);
		expect(isExpectedWorkerUrl("https://bat-ingest.worker.hexly.ai/", TRUSTED_MACHINE_ORIGIN)).toBe(
			true,
		);
	});

	test("rejects a different host, scheme, path or credentials", () => {
		expect(isExpectedWorkerUrl("https://bat.hexly.ai", TRUSTED_MACHINE_ORIGIN)).toBe(false);
		expect(isExpectedWorkerUrl("http://bat-ingest.worker.hexly.ai", TRUSTED_MACHINE_ORIGIN)).toBe(
			false,
		);
		expect(
			isExpectedWorkerUrl("https://bat-ingest.worker.hexly.ai/api", TRUSTED_MACHINE_ORIGIN),
		).toBe(false);
		expect(
			isExpectedWorkerUrl("https://bat-ingest.worker.hexly.ai?x=1", TRUSTED_MACHINE_ORIGIN),
		).toBe(false);
		expect(
			isExpectedWorkerUrl("https://user:pass@bat-ingest.worker.hexly.ai", TRUSTED_MACHINE_ORIGIN),
		).toBe(false);
		expect(isExpectedWorkerUrl("nope", TRUSTED_MACHINE_ORIGIN)).toBe(false);
	});
});
