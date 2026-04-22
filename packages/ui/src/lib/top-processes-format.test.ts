import { describe, expect, test } from "bun:test";
import {
	cpuColor,
	filterProcesses,
	memPctColor,
	nextSortState,
	sortProcesses,
	stateColor,
	threadColor,
} from "./top-processes-format";
import type { TopProcessEntry } from "./transforms";

const proc = (over: Partial<TopProcessEntry>): TopProcessEntry => ({
	pid: 0,
	name: "",
	cmd: "",
	state: "S",
	ppid: 0,
	user: "",
	cpu_pct: null,
	mem_rss: 0,
	mem_pct: 0,
	mem_virt: 0,
	num_threads: 0,
	uptime: 0,
	majflt_rate: null,
	io_read_rate: null,
	io_write_rate: null,
	processor: -1,
	...over,
});

describe("stateColor", () => {
	test.each([
		["R", "text-emerald-500"],
		["D", "text-warning"],
		["Z", "text-destructive"],
		["S", "text-muted-foreground"],
		["?", "text-muted-foreground"],
	])("state %p → %p", (s, expected) => {
		expect(stateColor(s)).toBe(expected);
	});
});

describe("cpuColor", () => {
	test("null → ''", () => expect(cpuColor(null)).toBe(""));
	test("low → ''", () => expect(cpuColor(10)).toBe(""));
	test("> 50 → warning", () => expect(cpuColor(60)).toBe("text-warning"));
	test("> 80 → destructive", () => expect(cpuColor(90)).toBe("text-destructive"));
	test("=50 still '' (boundary)", () => expect(cpuColor(50)).toBe(""));
});

describe("memPctColor", () => {
	test("low → ''", () => expect(memPctColor(5)).toBe(""));
	test("> 15 → warning", () => expect(memPctColor(20)).toBe("text-warning"));
	test("> 30 → destructive", () => expect(memPctColor(40)).toBe("text-destructive"));
});

describe("threadColor", () => {
	test("low → ''", () => expect(threadColor(10)).toBe(""));
	test("> 50 → warning", () => expect(threadColor(75)).toBe("text-warning"));
	test("> 100 → destructive", () => expect(threadColor(200)).toBe("text-destructive"));
});

describe("sortProcesses", () => {
	const a = proc({ pid: 1, cpu_pct: 10, mem_pct: 5 });
	const b = proc({ pid: 2, cpu_pct: 50, mem_pct: 20 });
	const c = proc({ pid: 3, cpu_pct: null, mem_pct: 15 });

	test("desc by cpu_pct, nulls last", () => {
		const out = sortProcesses([a, b, c], "cpu_pct", "desc").map((p) => p.pid);
		expect(out).toEqual([2, 1, 3]);
	});

	test("asc by cpu_pct, nulls first", () => {
		const out = sortProcesses([a, b, c], "cpu_pct", "asc").map((p) => p.pid);
		expect(out).toEqual([3, 1, 2]);
	});

	test("does not mutate input", () => {
		const input = [a, b];
		sortProcesses(input, "cpu_pct", "desc");
		expect(input.map((p) => p.pid)).toEqual([1, 2]);
	});
});

describe("filterProcesses", () => {
	const list = [
		proc({ pid: 1, name: "nginx", cmd: "/usr/sbin/nginx -g daemon off", user: "www-data" }),
		proc({ pid: 2, name: "postgres", cmd: "postgres: checkpointer", user: "postgres" }),
		proc({ pid: 3, name: "node", cmd: "node server.js", user: "app" }),
	];

	test("empty query returns input", () => {
		expect(filterProcesses(list, "").map((p) => p.pid)).toEqual([1, 2, 3]);
		expect(filterProcesses(list, "   ").map((p) => p.pid)).toEqual([1, 2, 3]);
	});

	test("matches on name (case-insensitive)", () => {
		expect(filterProcesses(list, "NGINX").map((p) => p.pid)).toEqual([1]);
	});

	test("matches on cmd substring", () => {
		expect(filterProcesses(list, "checkpointer").map((p) => p.pid)).toEqual([2]);
	});

	test("matches on user", () => {
		expect(filterProcesses(list, "www-data").map((p) => p.pid)).toEqual([1]);
	});

	test("returns empty array on no match", () => {
		expect(filterProcesses(list, "zzz")).toEqual([]);
	});
});

describe("nextSortState", () => {
	test("same key flips direction", () => {
		expect(nextSortState({ key: "cpu_pct", dir: "desc" }, "cpu_pct")).toEqual({
			key: "cpu_pct",
			dir: "asc",
		});
		expect(nextSortState({ key: "cpu_pct", dir: "asc" }, "cpu_pct")).toEqual({
			key: "cpu_pct",
			dir: "desc",
		});
	});

	test("different key switches to desc", () => {
		expect(nextSortState({ key: "cpu_pct", dir: "asc" }, "mem_rss")).toEqual({
			key: "mem_rss",
			dir: "desc",
		});
	});
});
