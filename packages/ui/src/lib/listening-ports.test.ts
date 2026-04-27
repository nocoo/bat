import type { ListeningPort } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { categorizeListening, formatProcess, isPublicBind } from "./listening-ports";

describe("isPublicBind", () => {
	test.each([
		["0.0.0.0", true],
		["::", true],
		["127.0.0.1", false],
		["::1", false],
		["192.168.1.1", false],
		["", false],
	] as const)("isPublicBind(%s) === %s", (bind, expected) => {
		expect(isPublicBind(bind)).toBe(expected);
	});
});

describe("formatProcess", () => {
	test("name + pid", () => {
		expect(formatProcess("sshd", 1234)).toBe("sshd(1234)");
	});
	test("name only", () => {
		expect(formatProcess("sshd", null)).toBe("sshd");
	});
	test("pid only", () => {
		expect(formatProcess(null, 1234)).toBe("pid 1234");
	});
	test("neither", () => {
		expect(formatProcess(null, null)).toBe("—");
	});
});

const mk = (
	port: number,
	bind: string,
	process: string | null = null,
	pid: number | null = null,
	protocol: ListeningPort["protocol"] = "tcp",
): ListeningPort => ({ port, bind, protocol, pid, process });

describe("categorizeListening", () => {
	test("public default-allowed (22/80/443) → public-allowed", () => {
		const result = categorizeListening([mk(22, "0.0.0.0", "sshd")], []);
		expect(result.publicAllowed).toHaveLength(1);
		expect(result.publicUnallowed).toHaveLength(0);
		expect(result.local).toHaveLength(0);
	});

	test("public not in allowlist → public-unallowed", () => {
		const result = categorizeListening([mk(8080, "0.0.0.0", "node")], []);
		expect(result.publicUnallowed).toHaveLength(1);
		expect(result.publicUnallowed[0]?.category).toBe("public-unallowed");
	});

	test("public in per-host allowlist → public-allowed", () => {
		const result = categorizeListening([mk(8080, "0.0.0.0", "node")], [8080]);
		expect(result.publicAllowed).toHaveLength(1);
		expect(result.publicUnallowed).toHaveLength(0);
	});

	test("loopback → local regardless of allowlist", () => {
		const result = categorizeListening([mk(5432, "127.0.0.1", "postgres")], [5432]);
		expect(result.local).toHaveLength(1);
		expect(result.publicAllowed).toHaveLength(0);
	});

	test("IPv6 :: counts as public", () => {
		const result = categorizeListening([mk(9000, "::", "app")], []);
		expect(result.publicUnallowed).toHaveLength(1);
	});

	test("IPv6 ::1 counts as local", () => {
		const result = categorizeListening([mk(9000, "::1", "app")], []);
		expect(result.local).toHaveLength(1);
	});

	test("dedupes identical (port,bind,protocol,process)", () => {
		const result = categorizeListening(
			[mk(22, "0.0.0.0", "sshd", 1), mk(22, "0.0.0.0", "sshd", 2)],
			[],
		);
		// pid differs but key ignores pid → first wins
		expect(result.publicAllowed).toHaveLength(1);
	});

	test("does NOT dedupe across different binds", () => {
		const result = categorizeListening([mk(53, "0.0.0.0", "dns"), mk(53, "127.0.0.1", "dns")], []);
		expect(result.publicUnallowed).toHaveLength(1);
		expect(result.local).toHaveLength(1);
	});

	test("sorts each bucket by port ascending", () => {
		const result = categorizeListening(
			[mk(8080, "0.0.0.0", "a"), mk(3000, "0.0.0.0", "b"), mk(5000, "0.0.0.0", "c")],
			[],
		);
		expect(result.publicUnallowed.map((p) => p.port)).toEqual([3000, 5000, 8080]);
	});

	test("empty input → empty buckets", () => {
		const result = categorizeListening([], []);
		expect(result.publicUnallowed).toEqual([]);
		expect(result.publicAllowed).toEqual([]);
		expect(result.local).toEqual([]);
	});
});
