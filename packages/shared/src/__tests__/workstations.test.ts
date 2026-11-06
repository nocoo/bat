// @bat/shared — workstations.ts tests
import { describe, expect, test } from "vitest";
import {
	computeWorkstationStatus,
	ipFamily,
	isIpv4,
	isIpv6,
	isPkceCodeVerifier,
	isPkceS256Challenge,
	isPublicIp,
	isUuid,
	isWorkstationCallbackUrl,
	isWorkstationToken,
	validateWorkstationAuthorize,
	validateWorkstationLoginExchange,
	validateWorkstationReport,
	validateWorkstationTargetsResponse,
	WORKSTATION_AUTH_CODE_TTL_SECONDS,
	WORKSTATION_BODY_MAX_BYTES,
	WORKSTATION_CONNECTIVITY_STATUSES,
	WORKSTATION_HISTORY_MAX_LIMIT,
	WORKSTATION_HISTORY_MAX_WINDOW_SECONDS,
	WORKSTATION_INTERVAL_SECONDS,
	WORKSTATION_MAX_RUN_MS,
	WORKSTATION_MAX_TARGETS,
	WORKSTATION_NAME_MAX_LENGTH,
	WORKSTATION_PING_COUNT,
	WORKSTATION_RATE_LIMITS,
	WORKSTATION_REPORT_SKEW_SECONDS,
	WORKSTATION_STALE_AFTER_SECONDS,
	WORKSTATION_STATUSES,
	WORKSTATION_TOKEN_BYTES,
	WORKSTATION_TOKEN_PREFIX,
} from "../workstations.js";

const NOW = 1_700_000_000;
const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

type Body = Record<string, unknown>;

function baseReport(): Body {
	return {
		report_id: UUID,
		started_at: NOW - 12,
		finished_at: NOW - 2,
		sample_window_ms: 10_000,
		cli_version: "2.5.0",
		hostname: "laptop-01",
		os: "macOS 15.2",
		arch: "arm64",
		uptime_seconds: 86_400,
		cpu: { model: "Apple M3 Pro", count: 12, usage_pct: 12.5 },
		mem: { total_bytes: 36_000_000_000, available_bytes: 12_000_000_000, used_pct: 66.7 },
		disk: [
			{
				mount: "/",
				total_bytes: 994_662_584_320,
				available_bytes: 397_284_917_248,
				used_pct: 60.1,
			},
		],
		network: {
			interfaces: [
				{
					name: "en0",
					addresses: [{ address: "192.168.1.20", family: 4, internal: false }],
				},
			],
		},
		connectivity: [
			{
				server_id: "srv-01",
				address: "8.8.8.8",
				family: 4,
				sent: 3,
				received: 3,
				rtts_ms: [18.4, 19.1, 17.9],
				status: "reachable",
			},
		],
		collection_errors: [],
		targets_error: null,
	};
}

function reportWith(patch: (body: Body) => void): unknown {
	const body = baseReport();
	patch(body);
	return body;
}

function nested(body: Body, key: string): Body {
	return body[key] as Body;
}

function entries(body: Body, key: string): Body[] {
	return body[key] as Body[];
}

function connectivityEntry(patch: (entry: Body) => void): unknown {
	return reportWith((body) => {
		patch(entries(body, "connectivity")[0] as Body);
	});
}

function expectReportRejected(input: unknown): void {
	const result = validateWorkstationReport(input, NOW);
	expect(result.ok).toBe(false);
}

describe("workstation protocol constants", () => {
	test("matches the agreed contract", () => {
		expect(WORKSTATION_INTERVAL_SECONDS).toBe(600);
		expect(WORKSTATION_PING_COUNT).toBe(3);
		expect(WORKSTATION_MAX_TARGETS).toBe(100);
		expect(WORKSTATION_BODY_MAX_BYTES).toBe(65_536);
		expect(WORKSTATION_REPORT_SKEW_SECONDS).toBe(300);
		expect(WORKSTATION_MAX_RUN_MS).toBe(120_000);
	});

	test("stale threshold is three intervals, not critical", () => {
		expect(WORKSTATION_STALE_AFTER_SECONDS).toBe(1800);
	});

	test("history, auth and rate limits are bounded", () => {
		expect(WORKSTATION_HISTORY_MAX_LIMIT).toBe(100);
		expect(WORKSTATION_HISTORY_MAX_WINDOW_SECONDS).toBe(2_592_000);
		expect(WORKSTATION_AUTH_CODE_TTL_SECONDS).toBe(300);
		expect(WORKSTATION_NAME_MAX_LENGTH).toBe(64);
		expect(WORKSTATION_RATE_LIMITS).toEqual({
			reportsPerMinute: 2,
			targetsPerMinute: 6,
			exchangePerTenMinutes: 5,
		});
	});

	test("token is a dedicated 256-bit prefix", () => {
		expect(WORKSTATION_TOKEN_PREFIX).toBe("batw_");
		expect(WORKSTATION_TOKEN_BYTES).toBe(32);
	});

	test("statuses are exposed", () => {
		expect(WORKSTATION_STATUSES).toEqual(["recent", "stale", "disabled"]);
		expect(WORKSTATION_CONNECTIVITY_STATUSES).toEqual([
			"reachable",
			"partial",
			"timeout",
			"unreachable",
			"error",
			"unsupported",
		]);
	});
});

describe("isUuid", () => {
	test.each([UUID, UUID.toUpperCase(), "00000000-0000-8000-8000-000000000000"])(
		"accepts %s",
		(input) => {
			expect(isUuid(input)).toBe(true);
		},
	);

	test.each([
		"",
		"not-a-uuid",
		"3f2504e04f8941d39a0c0305e82c3301",
		"3f2504e0-4f89-01d3-9a0c-0305e82c3301",
		"3f2504e0-4f89-41d3-ca0c-0305e82c3301",
		"3f2504e0-4f89-41d3-9a0c-0305e82c3301a",
	])("rejects %s", (input) => {
		expect(isUuid(input)).toBe(false);
	});
});

describe("IP literals", () => {
	test.each(["0.0.0.0", "255.255.255.255", "192.168.1.20", "10.0.0.7"])("isIpv4 %s", (input) => {
		expect(isIpv4(input)).toBe(true);
	});

	test.each(["", "256.1.1.1", "01.2.3.4", "1.2.3", "1.2.3.4.5", "a.b.c.d", "1.2.3.4 ", "::1"])(
		"isIpv4 rejects %s",
		(input) => {
			expect(isIpv4(input)).toBe(false);
		},
	);

	test.each([
		"::",
		"::1",
		"2001:db8::8a2e:370:7334",
		"1:2:3:4:5:6:7:8",
		"fe80::1",
		"::ffff:192.168.0.1",
		"1:2:3:4:5:6:192.168.0.1",
	])("isIpv6 %s", (input) => {
		expect(isIpv6(input)).toBe(true);
	});

	test.each([
		"",
		"1:2:3:4:5:6:7",
		"1:2:3:4:5:6:7:8:9",
		"1:2:3:4:5:6:7:8::",
		":::1",
		"1::2::3",
		"gggg::1",
		"12345::",
		"fe80::1%eth0",
		"1.2.3.4",
		"::ffff:1.2.3.256",
		"1.2.3.4::",
		"1.2.3.4::1",
		"::1]:80",
		"::1]",
		"0".repeat(46),
	])("isIpv6 rejects %s", (input) => {
		expect(isIpv6(input)).toBe(false);
	});

	test("ipFamily maps literals to families", () => {
		expect(ipFamily("192.168.1.20")).toBe(4);
		expect(ipFamily("2001:db8::1")).toBe(6);
		expect(ipFamily("example.com")).toBeNull();
		expect(ipFamily("")).toBeNull();
	});
});

describe("isPublicIp", () => {
	test.each(["8.8.8.8", "1.1.1.1", "8.8.4.4", "2001:4860:4860::8888", "2606:4700:4700::1111"])(
		"accepts %s",
		(input) => {
			expect(isPublicIp(input)).toBe(true);
		},
	);

	test.each(["2001:4860:4860::8888]/foo", "2001:4860:4860::8888]?q=x", "2001:4860:4860::8888]#x"])(
		"rejects the bracket-injection literal %s",
		(input) => {
			expect(isPublicIp(input)).toBe(false);
			expect(ipFamily(input)).toBeNull();
		},
	);

	test.each([
		"0.0.0.0",
		"0.1.2.3",
		"10.0.0.1",
		"100.64.0.1",
		"127.0.0.1",
		"169.254.1.1",
		"172.16.0.1",
		"172.31.255.255",
		"192.168.1.1",
		"224.0.0.1",
		"240.0.0.1",
		"255.255.255.255",
		"192.0.0.1",
		"192.0.2.1",
		"192.88.99.1",
		"198.18.0.1",
		"198.19.255.255",
		"198.51.100.7",
		"203.0.113.10",
		"::",
		"::1",
		"::2",
		"::ffff:8.8.8.8",
		"::ffff:192.168.1.1",
		"fc00::1",
		"fd12:3456::1",
		"fe80::1",
		"ff02::1",
		"2001:db8::1",
		"2001:db8:ffff::1",
		"2001:DB8::1",
		"fec0::1",
		"100::1",
		"2001::1",
		"2001:2::1",
		"2001:20::1",
		"2002:c000:201::1",
		"4000::1",
		"3fff::1",
		"64:ff9b::102:304",
		"0:0:0:0:0:0:0:0",
		"not-an-ip",
		"",
	])("rejects %s", (input) => {
		expect(isPublicIp(input)).toBe(false);
	});
});

describe("PKCE and token formats", () => {
	test("S256 challenge is a 43 character base64url digest", () => {
		expect(isPkceS256Challenge("a".repeat(43))).toBe(true);
		expect(isPkceS256Challenge("a".repeat(42))).toBe(false);
		expect(isPkceS256Challenge(`${"a".repeat(42)}=`)).toBe(false);
		expect(isPkceS256Challenge("")).toBe(false);
	});

	test("code verifier allows unreserved characters from 43 to 128", () => {
		expect(isPkceCodeVerifier("x".repeat(43))).toBe(true);
		expect(isPkceCodeVerifier(`${"x".repeat(42)}~`)).toBe(true);
		expect(isPkceCodeVerifier("x".repeat(128))).toBe(true);
		expect(isPkceCodeVerifier("x".repeat(42))).toBe(false);
		expect(isPkceCodeVerifier("x".repeat(129))).toBe(false);
		expect(isPkceCodeVerifier("+".repeat(43))).toBe(false);
	});

	test("workstation tokens use the batw_ prefix and 256 bits", () => {
		expect(isWorkstationToken(`${WORKSTATION_TOKEN_PREFIX}${"a".repeat(43)}`)).toBe(true);
		expect(isWorkstationToken(`${WORKSTATION_TOKEN_PREFIX}${"a".repeat(42)}`)).toBe(false);
		expect(isWorkstationToken(`${WORKSTATION_TOKEN_PREFIX}${"a".repeat(44)}`)).toBe(false);
		expect(isWorkstationToken(`${WORKSTATION_TOKEN_PREFIX}${"a".repeat(43)}!`)).toBe(false);
		expect(isWorkstationToken(`batx_${"a".repeat(43)}`)).toBe(false);
	});

	test("callback is loopback /callback over http or https only", () => {
		expect(isWorkstationCallbackUrl("http://127.0.0.1:8765/callback")).toBe(true);
		expect(isWorkstationCallbackUrl("https://127.0.0.1:8765/callback")).toBe(true);
		expect(isWorkstationCallbackUrl("http://localhost:8765/callback")).toBe(true);
		expect(isWorkstationCallbackUrl("https://localhost/callback")).toBe(true);
		expect(isWorkstationCallbackUrl("http://[::1]:8765/callback")).toBe(true);
		expect(isWorkstationCallbackUrl("https://[::1]:8765/callback")).toBe(true);
	});

	test("callback rejects non-loopback, other paths and pre-set parts", () => {
		expect(isWorkstationCallbackUrl("https://bat.hexly.ai/workstation/authorize")).toBe(false);
		expect(isWorkstationCallbackUrl("https://example.com/callback")).toBe(false);
		expect(isWorkstationCallbackUrl("http://example.com/callback")).toBe(false);
		expect(isWorkstationCallbackUrl("http://127.0.0.1:8765/cb")).toBe(false);
		expect(isWorkstationCallbackUrl("http://127.0.0.1:8765/callback/")).toBe(false);
		expect(isWorkstationCallbackUrl("http://127.0.0.1:8765/callback?state=x")).toBe(false);
		expect(isWorkstationCallbackUrl("http://127.0.0.1:8765/callback#token")).toBe(false);
		expect(isWorkstationCallbackUrl("http://user@127.0.0.1:8765/callback")).toBe(false);
		expect(isWorkstationCallbackUrl("http://:secret@127.0.0.1:8765/callback")).toBe(false);
		expect(isWorkstationCallbackUrl("ftp://127.0.0.1:8765/callback")).toBe(false);
		expect(isWorkstationCallbackUrl("not a url")).toBe(false);
		expect(isWorkstationCallbackUrl("")).toBe(false);
		expect(isWorkstationCallbackUrl(`https://127.0.0.1/${"a".repeat(520)}`)).toBe(false);
	});
});

describe("computeWorkstationStatus", () => {
	test("disabled wins over any freshness", () => {
		expect(computeWorkstationStatus({ disabled: true, last_seen_at: NOW }, NOW)).toBe("disabled");
	});

	test("never seen is stale", () => {
		expect(computeWorkstationStatus({ disabled: false, last_seen_at: null }, NOW)).toBe("stale");
	});

	test("exactly three intervals is still recent", () => {
		expect(computeWorkstationStatus({ disabled: false, last_seen_at: NOW - 1800 }, NOW)).toBe(
			"recent",
		);
	});

	test("past three intervals is stale", () => {
		expect(computeWorkstationStatus({ disabled: false, last_seen_at: NOW - 1801 }, NOW)).toBe(
			"stale",
		);
	});

	test("clock skew into the future stays recent", () => {
		expect(computeWorkstationStatus({ disabled: false, last_seen_at: NOW + 120 }, NOW)).toBe(
			"recent",
		);
	});
});

describe("validateWorkstationReport accepts", () => {
	test("a complete report and normalizes it", () => {
		const result = validateWorkstationReport(baseReport(), NOW);
		expect(result).toEqual({
			ok: true,
			value: {
				report_id: UUID,
				started_at: NOW - 12,
				finished_at: NOW - 2,
				sample_window_ms: 10_000,
				cli_version: "2.5.0",
				hostname: "laptop-01",
				os: "macOS 15.2",
				arch: "arm64",
				uptime_seconds: 86_400,
				cpu: { model: "Apple M3 Pro", count: 12, usage_pct: 12.5 },
				mem: {
					total_bytes: 36_000_000_000,
					available_bytes: 12_000_000_000,
					used_pct: 66.7,
				},
				disk: [
					{
						mount: "/",
						total_bytes: 994_662_584_320,
						available_bytes: 397_284_917_248,
						used_pct: 60.1,
					},
				],
				network: {
					interfaces: [
						{
							name: "en0",
							addresses: [{ address: "192.168.1.20", family: 4, internal: false }],
						},
					],
				},
				connectivity: [
					{
						server_id: "srv-01",
						address: "8.8.8.8",
						family: 4,
						sent: 3,
						received: 3,
						rtts_ms: [18.4, 19.1, 17.9],
						status: "reachable",
					},
				],
				collection_errors: [],
				targets_error: null,
			},
		});
	});

	test("an empty collection with no optional data", () => {
		const result = validateWorkstationReport(
			reportWith((body) => {
				nested(body, "cpu").usage_pct = null;
				body.disk = [];
				body.network = { interfaces: [] };
				body.connectivity = [];
			}),
			NOW,
		);
		expect(result.ok).toBe(true);
	});

	test("every connectivity status with consistent ping outcomes", () => {
		const cases: Array<[unknown, number, unknown, string]> = [
			["reachable", 3, [1, 2, 3], "reachable"],
			["partial", 2, [1.5, null, 2.5], "partial"],
			["partial", 1, [null, 0.75, null], "partial"],
			["timeout", 0, [null, null, null], "timeout"],
			["unreachable", 0, [null, null, null], "unreachable"],
			["error", 0, [null, null, null], "error"],
			["error", 2, [4, 5, null], "error"],
			["unsupported", 0, [null, null, null], "unsupported"],
		];
		for (const [status, received, rtts, expected] of cases) {
			const result = validateWorkstationReport(
				connectivityEntry((entry) => {
					entry.status = status;
					entry.received = received;
					entry.rtts_ms = rtts;
				}),
				NOW,
			);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.connectivity[0]?.status).toBe(expected);
			}
		}
	});

	test("a genuine zero RTT counts as an answered probe", () => {
		const result = validateWorkstationReport(
			connectivityEntry((entry) => {
				entry.rtts_ms = [0, 0, 0];
			}),
			NOW,
		);
		expect(result.ok).toBe(true);
	});

	test("IPv6 connectivity targets", () => {
		const result = validateWorkstationReport(
			connectivityEntry((entry) => {
				entry.address = "2001:4860:4860::8888";
				entry.family = 6;
			}),
			NOW,
		);
		expect(result.ok).toBe(true);
	});

	test("bounded limits are inclusive", () => {
		const result = validateWorkstationReport(
			reportWith((body) => {
				body.finished_at = NOW - WORKSTATION_REPORT_SKEW_SECONDS;
				body.started_at = NOW - WORKSTATION_REPORT_SKEW_SECONDS - WORKSTATION_MAX_RUN_MS / 1000;
				body.sample_window_ms = WORKSTATION_MAX_RUN_MS;
				body.hostname = "h".repeat(253);
				body.uptime_seconds = 0;
				nested(body, "cpu").count = 1;
				nested(body, "cpu").usage_pct = 0;
				nested(body, "mem").available_bytes = 36_000_000_000;
				(entries(body, "disk")[0] as Body).available_bytes = 0;
				(entries(body, "disk")[0] as Body).used_pct = 100;
				body.collection_errors = Array.from({ length: 32 }, (_, index) => `error ${index}`);
				body.targets_error = "targets endpoint returned 500";
			}),
			NOW,
		);
		expect(result.ok).toBe(true);
	});

	test("array maxima are inclusive", () => {
		const result = validateWorkstationReport(
			reportWith((body) => {
				body.disk = Array.from({ length: 64 }, (_, index) => ({
					mount: `/mnt/${index}`,
					total_bytes: 1,
					available_bytes: 1,
					used_pct: 0,
				}));
				body.network = {
					interfaces: Array.from({ length: 32 }, (_, index) => ({
						name: `eth${index}`,
						addresses: Array.from({ length: 16 }, () => ({
							address: "::1",
							family: 6,
							internal: true,
						})),
					})),
				};
				body.connectivity = Array.from({ length: WORKSTATION_MAX_TARGETS }, (_, index) => ({
					server_id: `srv-${index}`,
					address: `10.0.0.${index % 250}`,
					family: 4,
					sent: 3,
					received: 0,
					rtts_ms: [null, null, null],
					status: "timeout",
				}));
			}),
			NOW,
		);
		expect(result.ok).toBe(true);
	});

	test("a zero-length run is valid", () => {
		const result = validateWorkstationReport(
			reportWith((body) => {
				body.finished_at = NOW;
				body.started_at = NOW;
				body.sample_window_ms = 1;
			}),
			NOW,
		);
		expect(result.ok).toBe(true);
	});

	test("future skew up to the limit is valid", () => {
		const result = validateWorkstationReport(
			reportWith((body) => {
				body.finished_at = NOW + WORKSTATION_REPORT_SKEW_SECONDS;
				body.started_at = NOW + WORKSTATION_REPORT_SKEW_SECONDS - 1;
			}),
			NOW,
		);
		expect(result.ok).toBe(true);
	});
});

describe("validateWorkstationReport rejects shape", () => {
	test.each([null, undefined, "report", 42, [], [{ report_id: UUID }]])(
		"non-object root %#",
		(input) => {
			expectReportRejected(input);
		},
	);

	test("unknown root key", () => {
		expectReportRejected(
			reportWith((body) => {
				body.extra = true;
			}),
		);
	});

	test("missing required key", () => {
		expectReportRejected(
			reportWith((body) => {
				delete body.targets_error;
			}),
		);
	});

	test("targets_error must be a string or null", () => {
		expectReportRejected(
			reportWith((body) => {
				body.targets_error = 5;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.targets_error = "";
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.targets_error = "e".repeat(513);
			}),
		);
	});

	test("report_id must be a UUID", () => {
		expectReportRejected(
			reportWith((body) => {
				body.report_id = "abc";
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.report_id = 42;
			}),
		);
	});
});

describe("validateWorkstationReport rejects timestamps", () => {
	test("started_at must be a bounded integer", () => {
		expectReportRejected(
			reportWith((body) => {
				body.started_at = "1700000000";
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.started_at = NOW - 0.5;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.started_at = -1;
			}),
		);
	});

	test("finished_at must be a bounded integer", () => {
		expectReportRejected(
			reportWith((body) => {
				body.finished_at = 1.5;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.finished_at = -1;
			}),
		);
	});

	test("finished_at cannot precede started_at", () => {
		expectReportRejected(
			reportWith((body) => {
				body.started_at = NOW - 2;
				body.finished_at = NOW - 3;
			}),
		);
	});

	test("run length is capped at two minutes", () => {
		expectReportRejected(
			reportWith((body) => {
				body.finished_at = NOW;
				body.started_at = NOW - 121;
			}),
		);
	});

	test("finished_at must be near receipt time", () => {
		expectReportRejected(
			reportWith((body) => {
				body.finished_at = NOW - 301;
				body.started_at = NOW - 320;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.finished_at = NOW + 301;
			}),
		);
	});

	test("sample_window_ms is bounded by the run budget", () => {
		expectReportRejected(
			reportWith((body) => {
				body.sample_window_ms = 0;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.sample_window_ms = 1.5;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.sample_window_ms = 120_001;
			}),
		);
	});

	test("uptime_seconds is bounded", () => {
		expectReportRejected(
			reportWith((body) => {
				body.uptime_seconds = -1;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.uptime_seconds = 3_155_760_001;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.uptime_seconds = "86400";
			}),
		);
	});
});

describe("validateWorkstationReport rejects strings", () => {
	test("cli_version", () => {
		expectReportRejected(
			reportWith((body) => {
				body.cli_version = "";
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.cli_version = "v".repeat(33);
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.cli_version = 250;
			}),
		);
	});

	test("hostname", () => {
		expectReportRejected(
			reportWith((body) => {
				body.hostname = "   ";
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.hostname = "h".repeat(254);
			}),
		);
	});

	test("os and arch", () => {
		expectReportRejected(
			reportWith((body) => {
				body.os = "o".repeat(129);
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.arch = "a".repeat(33);
			}),
		);
	});
});

describe("validateWorkstationReport rejects cpu and mem", () => {
	test("cpu shape", () => {
		expectReportRejected(
			reportWith((body) => {
				body.cpu = null;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "cpu").extra = 1;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "cpu").model = "";
			}),
		);
	});

	test("cpu count", () => {
		expectReportRejected(
			reportWith((body) => {
				nested(body, "cpu").count = 0;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "cpu").count = 1.5;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "cpu").count = 1025;
			}),
		);
	});

	test("cpu usage", () => {
		expectReportRejected(
			reportWith((body) => {
				nested(body, "cpu").usage_pct = -1;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "cpu").usage_pct = 100.5;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "cpu").usage_pct = "12";
			}),
		);
	});

	test("mem shape", () => {
		expectReportRejected(
			reportWith((body) => {
				body.mem = [];
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "mem").extra = 1;
			}),
		);
	});

	test("mem bytes", () => {
		expectReportRejected(
			reportWith((body) => {
				nested(body, "mem").total_bytes = 0;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "mem").available_bytes = -1;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "mem").available_bytes = 36_000_000_001;
			}),
		);
	});

	test("mem used_pct stays within 0..100", () => {
		expectReportRejected(
			reportWith((body) => {
				nested(body, "mem").used_pct = -0.5;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "mem").used_pct = 101;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				nested(body, "mem").used_pct = Number.POSITIVE_INFINITY;
			}),
		);
	});
});

describe("validateWorkstationReport rejects disk entries", () => {
	test("disk must be a bounded array", () => {
		expectReportRejected(
			reportWith((body) => {
				body.disk = {};
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.disk = Array.from({ length: 65 }, () => baseReport().disk);
			}),
		);
	});

	test("disk entry shape and mount", () => {
		expectReportRejected(
			reportWith((body) => {
				entries(body, "disk")[0] = "root";
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				(entries(body, "disk")[0] as Body).extra = 1;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				(entries(body, "disk")[0] as Body).mount = "";
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				(entries(body, "disk")[0] as Body).mount = "m".repeat(513);
			}),
		);
	});

	test("disk bytes must be consistent", () => {
		expectReportRejected(
			reportWith((body) => {
				(entries(body, "disk")[0] as Body).total_bytes = 0;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				(entries(body, "disk")[0] as Body).available_bytes = 994_662_584_321;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				(entries(body, "disk")[0] as Body).available_bytes = -1;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				(entries(body, "disk")[0] as Body).used_pct = 101;
			}),
		);
	});
});

describe("validateWorkstationReport rejects network entries", () => {
	test("network shape", () => {
		expectReportRejected(
			reportWith((body) => {
				body.network = null;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.network = { interfaces: {} };
			}),
		);
	});

	test("interface limits", () => {
		expectReportRejected(
			reportWith((body) => {
				body.network = {
					interfaces: Array.from({ length: 33 }, (_, index) => ({
						name: `eth${index}`,
						addresses: [],
					})),
				};
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.network = { interfaces: ["eth0"] };
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.network = { interfaces: [{ addresses: [] }] };
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.network = { interfaces: [{ name: "", addresses: [] }] };
			}),
		);
	});

	test("address limits and literals", () => {
		expectReportRejected(
			reportWith((body) => {
				body.network = {
					interfaces: [
						{
							name: "en0",
							addresses: Array.from({ length: 17 }, () => ({
								address: "10.0.0.1",
								family: 4,
								internal: false,
							})),
						},
					],
				};
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.network = { interfaces: [{ name: "en0", addresses: [{ address: "nope" }] }] };
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.network = { interfaces: [{ name: "en0", addresses: ["10.0.0.1"] }] };
			}),
		);
	});

	test("family must match the literal and be 4 or 6", () => {
		expectReportRejected(
			reportWith((body) => {
				body.network = {
					interfaces: [
						{ name: "en0", addresses: [{ address: "10.0.0.1", family: 6, internal: false }] },
					],
				};
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.network = {
					interfaces: [
						{ name: "en0", addresses: [{ address: "10.0.0.1", family: 5, internal: false }] },
					],
				};
			}),
		);
	});

	test("internal must be a boolean", () => {
		expectReportRejected(
			reportWith((body) => {
				body.network = {
					interfaces: [
						{ name: "en0", addresses: [{ address: "10.0.0.1", family: 4, internal: "no" }] },
					],
				};
			}),
		);
	});
});

describe("validateWorkstationReport rejects connectivity entries", () => {
	test("connectivity server ids are unique; a shared public address is valid", () => {
		expectReportRejected(
			reportWith((body) => {
				const first = entries(body, "connectivity")[0] as Body;
				body.connectivity = [first, { ...first, address: "8.8.4.4" }];
			}),
		);
		// NAT / shared egress: distinct servers may expose the same public address.
		const shared = validateWorkstationReport(
			reportWith((body) => {
				const first = entries(body, "connectivity")[0] as Body;
				body.connectivity = [first, { ...first, server_id: "srv-02" }];
			}),
			NOW,
		);
		expect(shared.ok).toBe(true);
		if (shared.ok) {
			expect(shared.value.connectivity.map((entry) => entry.server_id)).toEqual([
				"srv-01",
				"srv-02",
			]);
			expect(shared.value.connectivity.map((entry) => entry.address)).toEqual([
				"8.8.8.8",
				"8.8.8.8",
			]);
		}
	});

	test("connectivity must be a bounded array", () => {
		expectReportRejected(
			reportWith((body) => {
				body.connectivity = "srv";
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.connectivity = Array.from({ length: 101 }, () => ({
					server_id: "srv",
					address: "10.0.0.1",
					family: 4,
					sent: 3,
					received: 0,
					rtts_ms: [null, null, null],
					status: "timeout",
				}));
			}),
		);
	});

	test("entry shape", () => {
		expectReportRejected(
			reportWith((body) => {
				entries(body, "connectivity")[0] = 1;
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				(entries(body, "connectivity")[0] as Body).extra = 1;
			}),
		);
	});

	test("server_id is a bounded non-empty string", () => {
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.server_id = "";
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.server_id = "s".repeat(129);
			}),
		);
	});

	test("address must be a literal matching family", () => {
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.address = "example.com";
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.address = 10;
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.family = 5;
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.family = 6;
			}),
		);
	});

	test("sent is fixed at three probes", () => {
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.sent = 2;
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.sent = 4;
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.sent = 3.5;
			}),
		);
	});

	test("rtts must have exactly three entries", () => {
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.rtts_ms = {};
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.rtts_ms = [1, 2];
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.rtts_ms = [1, 2, 3, 4];
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.rtts_ms = ["1", 2, 3];
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.rtts_ms = [1, "2", 3];
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.rtts_ms = [1, 2, -1];
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.rtts_ms = [60_001, 2, 3];
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.rtts_ms = [Number.NaN, 2, 3];
			}),
		);
	});

	test("received must match recorded RTTs", () => {
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.received = 4;
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.received = 2;
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.received = 1;
				entry.rtts_ms = [null, 2, 3];
				entry.status = "partial";
			}),
		);
	});

	test("status is a known enum", () => {
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.status = "flapping";
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.status = 5;
			}),
		);
	});

	test("status and ping outcome must agree", () => {
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.status = "reachable";
				entry.received = 2;
				entry.rtts_ms = [1, 2, null];
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.status = "partial";
				entry.received = 3;
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.status = "timeout";
				entry.received = 1;
				entry.rtts_ms = [1, null, null];
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.status = "unreachable";
				entry.received = 1;
				entry.rtts_ms = [1, null, null];
			}),
		);
		expectReportRejected(
			connectivityEntry((entry) => {
				entry.status = "unsupported";
				entry.received = 1;
				entry.rtts_ms = [1, null, null];
			}),
		);
	});
});

describe("validateWorkstationReport rejects collection_errors", () => {
	test("must be a bounded array of bounded strings", () => {
		expectReportRejected(
			reportWith((body) => {
				body.collection_errors = "oops";
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.collection_errors = Array.from({ length: 33 }, () => "error");
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.collection_errors = ["fine", ""];
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.collection_errors = ["e".repeat(513)];
			}),
		);
		expectReportRejected(
			reportWith((body) => {
				body.collection_errors = [42];
			}),
		);
	});
});

describe("validateWorkstationTargetsResponse", () => {
	function baseTargets(): Body {
		return {
			data: [
				{ server_id: "srv-01", name: "edge-01", address: "8.8.8.8", family: 4 },
				{ server_id: "srv-02", name: "edge-02", address: "2001:4860:4860::8888", family: 6 },
			],
			interval_seconds: WORKSTATION_INTERVAL_SECONDS,
			ping_count: WORKSTATION_PING_COUNT,
		};
	}

	test("accepts the canonical response", () => {
		expect(validateWorkstationTargetsResponse(baseTargets())).toEqual({
			ok: true,
			value: baseTargets(),
		});
	});

	test("accepts an empty target list", () => {
		expect(validateWorkstationTargetsResponse({ ...baseTargets(), data: [] }).ok).toBe(true);
	});

	test("rejects non-object roots and unknown keys", () => {
		expect(validateWorkstationTargetsResponse(null).ok).toBe(false);
		expect(validateWorkstationTargetsResponse("targets").ok).toBe(false);
		expect(validateWorkstationTargetsResponse({ ...baseTargets(), generated_at: 1 }).ok).toBe(
			false,
		);
	});

	test("rejects a different cadence", () => {
		expect(validateWorkstationTargetsResponse({ ...baseTargets(), interval_seconds: 599 }).ok).toBe(
			false,
		);
		expect(
			validateWorkstationTargetsResponse({ ...baseTargets(), interval_seconds: 600.5 }).ok,
		).toBe(false);
		expect(validateWorkstationTargetsResponse({ ...baseTargets(), ping_count: 2 }).ok).toBe(false);
		expect(validateWorkstationTargetsResponse({ ...baseTargets(), ping_count: 4 }).ok).toBe(false);
	});

	test("rejects unbounded or malformed target lists", () => {
		expect(validateWorkstationTargetsResponse({ ...baseTargets(), data: {} }).ok).toBe(false);
		expect(
			validateWorkstationTargetsResponse({
				...baseTargets(),
				data: Array.from({ length: 101 }, () => ({
					server_id: "srv",
					name: "edge",
					address: "10.0.0.1",
					family: 4,
				})),
			}).ok,
		).toBe(false);
	});

	test("rejects duplicate target server ids", () => {
		const target = { server_id: "srv-01", name: "edge-01", address: "8.8.8.8", family: 4 };
		expect(
			validateWorkstationTargetsResponse({
				...baseTargets(),
				data: [target, { ...target, address: "8.8.4.4" }],
			}).ok,
		).toBe(false);
	});

	test("rejects malformed targets", () => {
		const target = () => ({ server_id: "srv-01", name: "edge-01", address: "10.0.0.1", family: 4 });
		const patch = (mutate: (entry: Body) => void): unknown => {
			const entry = target();
			mutate(entry);
			return { ...baseTargets(), data: [entry] };
		};
		expect(
			validateWorkstationTargetsResponse({
				...baseTargets(),
				data: [{ ...target(), extra: 1 }],
			}).ok,
		).toBe(false);
		expect(
			validateWorkstationTargetsResponse(
				patch((entry) => {
					entry.server_id = "";
				}),
			).ok,
		).toBe(false);
		expect(
			validateWorkstationTargetsResponse(
				patch((entry) => {
					entry.name = "n".repeat(129);
				}),
			).ok,
		).toBe(false);
		expect(
			validateWorkstationTargetsResponse(
				patch((entry) => {
					entry.address = "edge";
				}),
			).ok,
		).toBe(false);
		expect(
			validateWorkstationTargetsResponse(
				patch((entry) => {
					entry.family = 5;
				}),
			).ok,
		).toBe(false);
		expect(
			validateWorkstationTargetsResponse(
				patch((entry) => {
					entry.address = "2001:db8::1";
				}),
			).ok,
		).toBe(false);
	});
});

describe("validateWorkstationLoginExchange", () => {
	const verifier = "v".repeat(64);

	test("accepts a PKCE exchange", () => {
		expect(
			validateWorkstationLoginExchange({
				code: "auth-code",
				code_verifier: verifier,
				installation_id: UUID,
			}),
		).toEqual({
			ok: true,
			value: { code: "auth-code", code_verifier: verifier, installation_id: UUID },
		});
	});

	test("rejects malformed envelopes", () => {
		expect(validateWorkstationLoginExchange(null).ok).toBe(false);
		expect(validateWorkstationLoginExchange([]).ok).toBe(false);
		expect(
			validateWorkstationLoginExchange({
				code: "auth-code",
				code_verifier: verifier,
				installation_id: UUID,
				extra: true,
			}).ok,
		).toBe(false);
	});

	test("rejects a bad code", () => {
		expect(
			validateWorkstationLoginExchange({ code: "", code_verifier: verifier, installation_id: UUID })
				.ok,
		).toBe(false);
		expect(
			validateWorkstationLoginExchange({
				code: "c".repeat(513),
				code_verifier: verifier,
				installation_id: UUID,
			}).ok,
		).toBe(false);
		expect(
			validateWorkstationLoginExchange({
				code: 7,
				code_verifier: verifier,
				installation_id: UUID,
			}).ok,
		).toBe(false);
	});

	test("rejects a bad verifier and installation id", () => {
		expect(
			validateWorkstationLoginExchange({
				code: "auth-code",
				code_verifier: "short",
				installation_id: UUID,
			}).ok,
		).toBe(false);
		expect(
			validateWorkstationLoginExchange({
				code: "auth-code",
				code_verifier: 42,
				installation_id: UUID,
			}).ok,
		).toBe(false);
		expect(
			validateWorkstationLoginExchange({
				code: "auth-code",
				code_verifier: verifier,
				installation_id: "installation-1",
			}).ok,
		).toBe(false);
	});
});

describe("validateWorkstationAuthorize", () => {
	const challenge = "c".repeat(43);
	const state = "s".repeat(32);
	const callback = "http://127.0.0.1:8765/callback";

	function authorize(): Record<string, unknown> {
		return {
			installation_id: UUID,
			code_challenge: challenge,
			code_challenge_method: "S256",
			state,
			callback,
		};
	}

	test("accepts the browser authorize contract with the default name", () => {
		expect(validateWorkstationAuthorize(authorize())).toEqual({
			ok: true,
			value: { ...authorize(), name: "Workstation" },
		});
	});

	test("accepts an explicit workstation name", () => {
		expect(validateWorkstationAuthorize({ ...authorize(), name: "Li MacBook" })).toEqual({
			ok: true,
			value: { ...authorize(), name: "Li MacBook" },
		});
	});

	test("rejects an empty or oversized name", () => {
		expect(validateWorkstationAuthorize({ ...authorize(), name: "" }).ok).toBe(false);
		expect(validateWorkstationAuthorize({ ...authorize(), name: "   " }).ok).toBe(false);
		expect(validateWorkstationAuthorize({ ...authorize(), name: "n".repeat(65) }).ok).toBe(false);
		expect(validateWorkstationAuthorize({ ...authorize(), name: 7 }).ok).toBe(false);
	});

	test("rejects malformed envelopes", () => {
		expect(validateWorkstationAuthorize(null).ok).toBe(false);
		expect(validateWorkstationAuthorize([]).ok).toBe(false);
		expect(validateWorkstationAuthorize({ ...authorize(), redirect: "/cb" }).ok).toBe(false);
	});

	test("binds a UUID installation id", () => {
		expect(validateWorkstationAuthorize({ ...authorize(), installation_id: "install-1" }).ok).toBe(
			false,
		);
	});

	test("requires an S256 challenge", () => {
		expect(validateWorkstationAuthorize({ ...authorize(), code_challenge: "short" }).ok).toBe(
			false,
		);
		expect(validateWorkstationAuthorize({ ...authorize(), code_challenge: 42 }).ok).toBe(false);
		expect(
			validateWorkstationAuthorize({ ...authorize(), code_challenge_method: "plain" }).ok,
		).toBe(false);
	});

	test("bounded opaque state", () => {
		expect(validateWorkstationAuthorize({ ...authorize(), state: "s".repeat(15) }).ok).toBe(false);
		expect(validateWorkstationAuthorize({ ...authorize(), state: "s".repeat(129) }).ok).toBe(false);
		expect(validateWorkstationAuthorize({ ...authorize(), state: "+".repeat(32) }).ok).toBe(false);
	});

	test("callback must be a loopback /callback redirect", () => {
		expect(
			validateWorkstationAuthorize({ ...authorize(), callback: "http://example.com/callback" }).ok,
		).toBe(false);
		expect(
			validateWorkstationAuthorize({ ...authorize(), callback: "https://bat.hexly.ai/callback" })
				.ok,
		).toBe(false);
		expect(validateWorkstationAuthorize({ ...authorize(), callback: 42 }).ok).toBe(false);
		expect(
			validateWorkstationAuthorize({
				...authorize(),
				callback: "https://127.0.0.1:8765/callback",
			}).ok,
		).toBe(true);
	});
});
