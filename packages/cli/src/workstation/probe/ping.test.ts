// Tests for connectivity probes.

import type { WorkstationTarget } from "@bat/shared";
import { describe, expect, test, vi } from "vitest";
import type { ExecResult } from "../scheduler/exec.js";
import {
	buildUnixPingPlan,
	buildWindowsPingPlan,
	classifyConnectivity,
	parseUnixPingOutput,
	parseWindowsPingOutput,
	pingTarget,
	resolveUnixPingCommand,
	sequenceBase,
	WINDOWS_PING_SCRIPT,
} from "./ping.js";

const TARGET: WorkstationTarget = {
	server_id: "srv_1",
	name: "edge-1",
	address: "203.0.113.10",
	family: 4,
};

const TARGET6: WorkstationTarget = { ...TARGET, address: "2001:db8::1", family: 6 };
const LOOPBACK: WorkstationTarget = { ...TARGET, address: "127.0.0.1" };

function result(overrides: Partial<ExecResult> = {}): ExecResult {
	return {
		code: 0,
		signal: null,
		stdout: "",
		stderr: "",
		timedOut: false,
		aborted: false,
		...overrides,
	};
}

function macOutput(times: number[]): string {
	const lines = times.map(
		(time, index) => `64 bytes from 203.0.113.10: icmp_seq=${index} ttl=54 time=${time} ms`,
	);
	return `PING 203.0.113.10 (203.0.113.10): 56 data bytes\n${lines.join("\n")}\n\n--- 203.0.113.10 ping statistics ---\n3 packets transmitted, ${times.length} packets received, 0.0% packet loss\n`;
}

function linuxOutput(times: (number | null)[]): string {
	const lines = times.map((time, index) =>
		time === null
			? `no answer yet for icmp_seq=${index + 1}`
			: `64 bytes from 203.0.113.10: icmp_seq=${index + 1} ttl=54 time=${time} ms`,
	);
	return `PING 203.0.113.10 (203.0.113.10) 56(84) bytes of data.\n${lines.join("\n")}\n\n--- 203.0.113.10 ping statistics ---\n3 packets transmitted, ${times.filter((t) => t !== null).length} received\n`;
}

describe("plans", () => {
	test("builds macOS ping argv without a shell", () => {
		const v4 = buildUnixPingPlan("darwin", 4, "203.0.113.10");
		expect(v4.command).toMatch(/(^|\/)ping$/);
		expect(v4.args).toStrictEqual(["-n", "-c", "3", "-W", "1000", "203.0.113.10"]);
		expect(v4.env).toStrictEqual({ LC_ALL: "C", LANG: "C" });
	});

	test("omits -W on macOS ping6 because it is not implemented there", () => {
		const v6 = buildUnixPingPlan("darwin", 6, "2001:db8::1", 1500);
		expect(v6.command).toMatch(/(^|\/)ping6$/);
		expect(v6.args).toStrictEqual(["-n", "-c", "3", "2001:db8::1"]);
		expect(v6.args).not.toContain("-W");
	});

	test("builds Linux ping argv with a one second per-packet timeout", () => {
		const v4 = buildUnixPingPlan("linux", 4, "203.0.113.10", 900);
		expect(v4.args).toStrictEqual(["-n", "-c", "3", "-W", "1", "203.0.113.10"]);
		const v6 = buildUnixPingPlan("linux", 6, "2001:db8::1");
		expect(v6.args).toStrictEqual(["-n", "-c", "3", "-W", "1", "-6", "2001:db8::1"]);
	});

	test("builds a structured PowerShell probe", () => {
		const plan = buildWindowsPingPlan("203.0.113.10");
		expect(plan.command).toBe("powershell.exe");
		expect(plan.args[0]).toBe("-NoProfile");
		expect(plan.args.at(-1)).toBe(WINDOWS_PING_SCRIPT);
		expect(plan.env).toStrictEqual({ BAT_PING_ADDRESS: "203.0.113.10" });
		expect(WINDOWS_PING_SCRIPT).toContain("System.Net.NetworkInformation.Ping");
		expect(WINDOWS_PING_SCRIPT).toContain("$failure");
		expect(WINDOWS_PING_SCRIPT).not.toContain("203.0.113.10");
	});
});

describe("parsing", () => {
	test("keeps the macOS sequence positions", () => {
		expect(parseUnixPingOutput(macOutput([1.2, 0, 3.4]), sequenceBase("darwin"))).toStrictEqual([
			1.2, 0, 3.4,
		]);
	});

	test("keeps a first loss in the first slot", () => {
		const output = linuxOutput([null, 2.5, 3.5]);
		expect(parseUnixPingOutput(output, sequenceBase("linux"))).toStrictEqual([null, 2.5, 3.5]);
	});

	test("keeps a first loss in the first slot on macOS", () => {
		const output = "64 bytes from 203.0.113.10: icmp_seq=1 ttl=54 time=2.5 ms\n";
		expect(parseUnixPingOutput(output, sequenceBase("darwin"))).toStrictEqual([null, 2.5, null]);
	});

	test("reads a coarse clock as a genuine zero", () => {
		expect(parseUnixPingOutput("64 bytes from x: icmp_seq=0 ttl=54 time<1 ms", 0)).toStrictEqual([
			0,
			null,
			null,
		]);
	});

	test("ignores output without samples", () => {
		expect(parseUnixPingOutput("no replies")).toStrictEqual([null, null, null]);
	});

	test("parses the Windows JSON result", () => {
		expect(parseWindowsPingOutput('{"rtts":[1,0,null]}')).toStrictEqual({
			rtts: [1, 0, null],
			error: null,
		});
		expect(parseWindowsPingOutput('{"rtts":[null,null,null]}')).toStrictEqual({
			rtts: [null, null, null],
			error: null,
		});
		expect(parseWindowsPingOutput('{"rtts":[1,2]}').rtts).toStrictEqual([]);
		expect(parseWindowsPingOutput('{"rtts":[1,"x",-3]}').rtts).toStrictEqual([1, null, null]);
		expect(parseWindowsPingOutput("not json")).toStrictEqual({ rtts: [], error: null });
		expect(parseWindowsPingOutput("null")).toStrictEqual({ rtts: [], error: null });
	});

	test("surfaces a Windows local failure", () => {
		const parsed = parseWindowsPingOutput('{"rtts":[null,null,null],"error":"Access denied"}');
		expect(parsed.error).toBe("Access denied");
		expect(parsed.rtts).toStrictEqual([null, null, null]);
	});
});

describe("classification", () => {
	test("maps answered counts to reachable and partial", () => {
		expect(classifyConnectivity(3, "", false)).toBe("reachable");
		expect(classifyConnectivity(2, "", false)).toBe("partial");
		expect(classifyConnectivity(1, "", false)).toBe("partial");
	});

	test("separates timeouts, unreachable hosts and local errors", () => {
		expect(classifyConnectivity(0, "100.0% packet loss", false)).toBe("timeout");
		expect(classifyConnectivity(0, "ping: sendto: Network is unreachable", false)).toBe(
			"unreachable",
		);
		expect(classifyConnectivity(0, "", true)).toBe("error");
		expect(classifyConnectivity(1, "", true)).toBe("error");
	});
});

describe("pingTarget", () => {
	test("reports three answered pings as reachable", async () => {
		const exec = vi.fn().mockResolvedValue(result({ stdout: macOutput([1.1, 1.2, 1.3]) }));
		const outcome = await pingTarget(TARGET, { exec, platform: "darwin" });
		expect(outcome.connectivity).toStrictEqual({
			server_id: "srv_1",
			address: "203.0.113.10",
			family: 4,
			sent: 3,
			received: 3,
			rtts_ms: [1.1, 1.2, 1.3],
			status: "reachable",
		});
		expect(outcome.localError).toBeUndefined();
		expect(exec).toHaveBeenCalledTimes(1);
	});

	test("keeps a lost first sample in place", async () => {
		const exec = vi.fn().mockResolvedValue(result({ stdout: linuxOutput([null, 2, 3]) }));
		const outcome = await pingTarget(TARGET, { exec, platform: "linux" });
		expect(outcome.connectivity.rtts_ms).toStrictEqual([null, 2, 3]);
		expect(outcome.connectivity.received).toBe(2);
		expect(outcome.connectivity.status).toBe("partial");
	});

	test("reports a timeout when nothing answers", async () => {
		const exec = vi
			.fn()
			.mockResolvedValue(result({ code: 1, stdout: "3 packets transmitted, 0 packets received" }));
		const outcome = await pingTarget(TARGET, { exec, platform: "linux" });
		expect(outcome.connectivity.status).toBe("timeout");
		expect(outcome.connectivity.received).toBe(0);
	});

	test("reports an unreachable network", async () => {
		const exec = vi
			.fn()
			.mockResolvedValue(result({ code: 2, stdout: "ping: connect: Network is unreachable" }));
		const outcome = await pingTarget(TARGET, { exec, platform: "linux" });
		expect(outcome.connectivity.status).toBe("unreachable");
	});

	test("treats a missing ping binary as a local error, not a network failure", async () => {
		const exec = vi.fn().mockResolvedValue(result({ code: null, spawnError: "ENOENT" }));
		const outcome = await pingTarget(TARGET, { exec, platform: "linux" });
		expect(outcome.connectivity.status).toBe("error");
		expect(outcome.localError).toContain("ENOENT");
		expect(exec).toHaveBeenCalledTimes(1);
	});

	test("treats a macOS exit code 2 with 100% loss as a normal timeout", async () => {
		const exec = vi.fn().mockResolvedValue(
			result({
				code: 2,
				stdout:
					"PING 203.0.113.10 (203.0.113.10): 56 data bytes\n\n--- 203.0.113.10 ping statistics ---\n3 packets transmitted, 0 packets received, 100.0% packet loss\n",
			}),
		);
		const outcome = await pingTarget(TARGET, { exec, platform: "darwin" });
		expect(outcome.connectivity.status).toBe("timeout");
		expect(outcome.localError).toBeUndefined();
	});

	test("treats a macOS ping6 killed by our own timeout as a timeout", async () => {
		const exec = vi
			.fn()
			.mockResolvedValue(result({ code: null, signal: "SIGTERM", timedOut: true }));
		const outcome = await pingTarget(TARGET6, { exec, platform: "darwin" });
		expect(outcome.connectivity.status).toBe("timeout");
		expect(outcome.connectivity.received).toBe(0);
		expect(outcome.localError).toBeUndefined();
	});

	test("treats an aborted probe as a local error, not a network loss", async () => {
		const exec = vi
			.fn()
			.mockResolvedValue(result({ code: null, signal: "SIGTERM", aborted: true }));
		const outcome = await pingTarget(TARGET, { exec, platform: "darwin" });
		expect(outcome.connectivity.status).toBe("error");
		expect(outcome.localError).toContain("cancelled");
	});

	test("treats a Windows child timeout as a timeout", async () => {
		const exec = vi
			.fn()
			.mockResolvedValue(result({ code: null, signal: "SIGTERM", timedOut: true }));
		const outcome = await pingTarget(TARGET, { exec, platform: "win32" });
		expect(outcome.connectivity.status).toBe("timeout");
		expect(outcome.localError).toBeUndefined();
	});

	test("treats a macOS exit code 2 without a loss summary as a local error", async () => {
		const exec = vi
			.fn()
			.mockResolvedValue(
				result({ code: 2, stderr: "ping6: nodename nor servname provided, or not known" }),
			);
		const outcome = await pingTarget(TARGET6, { exec, platform: "darwin" });
		expect(outcome.connectivity.status).toBe("error");
		expect(outcome.localError).toContain("nodename");
	});

	test("keeps a macOS permission failure as an error even with a loss summary", async () => {
		const exec = vi.fn().mockResolvedValue(
			result({
				code: 2,
				stdout: "3 packets transmitted, 0 packets received, 100.0% packet loss\n",
				stderr: "ping: socket: Operation not permitted\n",
			}),
		);
		const outcome = await pingTarget(TARGET, { exec, platform: "darwin" });
		expect(outcome.connectivity.status).toBe("error");
		expect(outcome.localError).toContain("Operation not permitted");
	});

	test("keeps Linux exit code 2 with 100% loss as a local error", async () => {
		const exec = vi.fn().mockResolvedValue(
			result({
				code: 2,
				stdout: "3 packets transmitted, 0 received, 100% packet loss, time 2000ms\n",
			}),
		);
		const outcome = await pingTarget(TARGET, { exec, platform: "linux" });
		expect(outcome.connectivity.status).toBe("error");
	});

	test("treats a permission denial as a local error", async () => {
		const exec = vi
			.fn()
			.mockResolvedValue(result({ code: 2, stderr: "ping: socket: Operation not permitted" }));
		const outcome = await pingTarget(TARGET, { exec, platform: "linux" });
		expect(outcome.connectivity.status).toBe("error");
		expect(outcome.localError).toContain("Operation not permitted");
	});

	test("never sends more than three samples", async () => {
		const exec = vi.fn().mockResolvedValue(result({ code: 2, stderr: "temporary failure" }));
		await pingTarget(TARGET, { exec, platform: "linux" });
		expect(exec).toHaveBeenCalledTimes(1);
		expect(exec.mock.calls[0]?.[1]).toContain("-c");
		expect(exec.mock.calls[0]?.[1]).toContain("3");
	});

	test("uses ping6 for IPv6 targets on macOS", async () => {
		const exec = vi.fn().mockResolvedValue(result({ stdout: macOutput([1, 1, 1]) }));
		await pingTarget(TARGET6, { exec, platform: "darwin" });
		expect(exec.mock.calls[0]?.[0]).toMatch(/(^|\/)ping6$/);
	});

	test("parses the PowerShell result on Windows", async () => {
		const exec = vi.fn().mockResolvedValue(result({ stdout: '{"rtts":[3,0,null]}' }));
		const outcome = await pingTarget(TARGET, { exec, platform: "win32" });
		expect(outcome.connectivity).toStrictEqual({
			server_id: "srv_1",
			address: "203.0.113.10",
			family: 4,
			sent: 3,
			received: 2,
			rtts_ms: [3, 0, null],
			status: "partial",
		});
		expect(exec.mock.calls[0]?.[0]).toBe("powershell.exe");
	});

	test("keeps a Windows permission failure as an error", async () => {
		const exec = vi
			.fn()
			.mockResolvedValue(
				result({ code: 1, stdout: '{"rtts":[null,null,null],"error":"Access denied"}' }),
			);
		const outcome = await pingTarget(TARGET, { exec, platform: "win32" });
		expect(outcome.connectivity.status).toBe("error");
		expect(outcome.localError).toContain("Access denied");
	});

	test("treats an unparseable Windows result as a local error", async () => {
		const exec = vi.fn().mockResolvedValue(result({ code: 1, stdout: "" }));
		const outcome = await pingTarget(TARGET, { exec, platform: "win32" });
		expect(outcome.connectivity.status).toBe("error");
		expect(outcome.localError).toContain("ping 203.0.113.10");
	});

	test("passes the bounded timeout and signal to the executor", async () => {
		const controller = new AbortController();
		const exec = vi.fn().mockResolvedValue(result({ stdout: macOutput([1]) }));
		await pingTarget(TARGET, {
			exec,
			platform: "linux",
			timeoutMs: 700,
			childTimeoutMs: 2500,
			signal: controller.signal,
		});
		const options = exec.mock.calls[0]?.[2] as {
			timeoutMs: number;
			env: Record<string, string>;
			signal?: AbortSignal;
		};
		expect(options.timeoutMs).toBe(2500);
		expect(options.env.LC_ALL).toBe("C");
		expect(options.signal).toBe(controller.signal);
	});

	test("probes the loopback interface for real", async () => {
		const exec = (await import("../scheduler/exec.js")).runCommand;
		const outcome = await pingTarget(LOOPBACK, { exec, platform: process.platform });
		if (outcome.localError) {
			expect(outcome.connectivity.status).toBe("error");
			return;
		}
		expect(outcome.connectivity.sent).toBe(3);
		expect(outcome.connectivity.status).toBe("reachable");
		expect(outcome.connectivity.received).toBe(3);
		expect(outcome.connectivity.rtts_ms.every((rtt) => rtt !== null)).toBe(true);
	});
});

describe("resolveUnixPingCommand", () => {
	test("prefers the absolute binary the scheduler's PATH would miss", () => {
		expect(resolveUnixPingCommand("ping", (path) => path === "/sbin/ping")).toBe("/sbin/ping");
		expect(resolveUnixPingCommand("ping", (path) => path === "/usr/bin/ping")).toBe(
			"/usr/bin/ping",
		);
		expect(resolveUnixPingCommand("ping6", (path) => path === "/sbin/ping6")).toBe("/sbin/ping6");
	});

	test("falls back to the bare name when nothing is installed there", () => {
		expect(resolveUnixPingCommand("ping", () => false)).toBe("ping");
	});
});
