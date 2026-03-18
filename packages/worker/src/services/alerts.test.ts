import { beforeEach, describe, expect, test } from "bun:test";
import type {
	ConntrackMetrics,
	DiskIoMetric,
	DiskMetric,
	MetricsPayload,
	NetstatMetrics,
	PsiMetrics,
	SnmpMetrics,
	SoftnetMetrics,
	TcpMetrics,
} from "@bat/shared";
import { createMockD1 } from "../test-helpers/mock-d1";
import { evaluateAlerts, evaluateRules } from "./alerts";

function makePayload(
	overrides?: Partial<{
		mem_used_pct: number;
		swap_used_pct: number;
		swap_total_bytes: number;
		disk_used_pct: number;
		disk: DiskMetric[];
		iowait_pct: number;
		steal_pct: number;
		uptime_seconds: number;
		psi: PsiMetrics;
		disk_io: DiskIoMetric[];
		tcp: TcpMetrics;
		oom_kills_delta: number;
		// Signal expansion overrides
		snmp: SnmpMetrics;
		netstat: NetstatMetrics;
		softnet: SoftnetMetrics;
		conntrack: ConntrackMetrics;
		hw_corrupted: number;
		committed_as: number;
		commit_limit: number;
		swap_in_sec: number;
		swap_out_sec: number;
	}>,
): MetricsPayload {
	return {
		host_id: "test-host",
		timestamp: Math.floor(Date.now() / 1000),
		interval: 30,
		cpu: {
			load1: 0.5,
			load5: 0.3,
			load15: 0.2,
			usage_pct: 10,
			iowait_pct: overrides?.iowait_pct ?? 1,
			steal_pct: overrides?.steal_pct ?? 0,
			count: 2,
		},
		mem: {
			total_bytes: 4_000_000_000,
			available_bytes: 2_000_000_000,
			used_pct: overrides?.mem_used_pct ?? 50,
			oom_kills_delta: overrides?.oom_kills_delta,
			hw_corrupted: overrides?.hw_corrupted,
			committed_as: overrides?.committed_as,
			commit_limit: overrides?.commit_limit,
			swap_in_sec: overrides?.swap_in_sec,
			swap_out_sec: overrides?.swap_out_sec,
		},
		swap: {
			total_bytes: overrides?.swap_total_bytes ?? 2_000_000_000,
			used_bytes: 100_000_000,
			used_pct: overrides?.swap_used_pct ?? 5,
		},
		disk: overrides?.disk ?? [
			{
				mount: "/",
				total_bytes: 100_000_000_000,
				avail_bytes: 50_000_000_000,
				used_pct: overrides?.disk_used_pct ?? 50,
			},
		],
		net: [
			{
				iface: "eth0",
				rx_bytes_rate: 1000,
				tx_bytes_rate: 500,
				rx_errors: 0,
				tx_errors: 0,
			},
		],
		uptime_seconds: overrides?.uptime_seconds ?? 86400,
		psi: overrides?.psi,
		disk_io: overrides?.disk_io,
		tcp: overrides?.tcp,
		snmp: overrides?.snmp,
		netstat: overrides?.netstat,
		softnet: overrides?.softnet,
		conntrack: overrides?.conntrack,
	};
}

function makePsi(overrides?: Partial<PsiMetrics>): PsiMetrics {
	return {
		cpu_some_avg10: 0,
		cpu_some_avg60: 0,
		cpu_some_avg300: 0,
		mem_some_avg10: 0,
		mem_some_avg60: 0,
		mem_some_avg300: 0,
		mem_full_avg10: 0,
		mem_full_avg60: 0,
		mem_full_avg300: 0,
		io_some_avg10: 0,
		io_some_avg60: 0,
		io_some_avg300: 0,
		io_full_avg10: 0,
		io_full_avg60: 0,
		io_full_avg300: 0,
		...overrides,
	};
}

describe("evaluateRules (pure function)", () => {
	test("healthy payload fires no rules", () => {
		const results = evaluateRules(makePayload());
		expect(results.every((r) => !r.fired)).toBe(true);
	});

	test("mem_high fires when mem > 85% AND swap > 50%", () => {
		const results = evaluateRules(makePayload({ mem_used_pct: 90, swap_used_pct: 60 }));
		const memHigh = results.find((r) => r.ruleId === "mem_high");
		expect(memHigh?.fired).toBe(true);
		expect(memHigh?.severity).toBe("critical");
	});

	test("mem_high does not fire when only mem > 85% but swap < 50%", () => {
		const results = evaluateRules(makePayload({ mem_used_pct: 90, swap_used_pct: 30 }));
		const memHigh = results.find((r) => r.ruleId === "mem_high");
		expect(memHigh?.fired).toBe(false);
	});

	test("no_swap fires when swap == 0 AND mem > 70%", () => {
		const results = evaluateRules(makePayload({ swap_total_bytes: 0, mem_used_pct: 75 }));
		const noSwap = results.find((r) => r.ruleId === "no_swap");
		expect(noSwap?.fired).toBe(true);
		expect(noSwap?.severity).toBe("critical");
	});

	test("no_swap does not fire when swap > 0", () => {
		const results = evaluateRules(makePayload({ mem_used_pct: 75 }));
		const noSwap = results.find((r) => r.ruleId === "no_swap");
		expect(noSwap?.fired).toBe(false);
	});

	test("disk_full fires when any mount > 85%", () => {
		const results = evaluateRules(makePayload({ disk_used_pct: 90 }));
		const diskFull = results.find((r) => r.ruleId === "disk_full");
		expect(diskFull?.fired).toBe(true);
		expect(diskFull?.severity).toBe("critical");
	});

	test("disk_full does not fire at exactly 85%", () => {
		const results = evaluateRules(makePayload({ disk_used_pct: 85 }));
		const diskFull = results.find((r) => r.ruleId === "disk_full");
		expect(diskFull?.fired).toBe(false);
	});

	test("iowait_high fires when iowait > 20%", () => {
		const results = evaluateRules(makePayload({ iowait_pct: 25 }));
		const iowait = results.find((r) => r.ruleId === "iowait_high");
		expect(iowait?.fired).toBe(true);
		expect(iowait?.severity).toBe("warning");
		expect(iowait?.durationSeconds).toBe(300);
	});

	test("steal_high fires when steal > 10%", () => {
		const results = evaluateRules(makePayload({ steal_pct: 15 }));
		const steal = results.find((r) => r.ruleId === "steal_high");
		expect(steal?.fired).toBe(true);
		expect(steal?.severity).toBe("warning");
		expect(steal?.durationSeconds).toBe(300);
	});

	test("exactly at threshold does not fire (strict >)", () => {
		const results = evaluateRules(makePayload({ iowait_pct: 20 }));
		const iowait = results.find((r) => r.ruleId === "iowait_high");
		expect(iowait?.fired).toBe(false);
	});

	test("uptime_anomaly fires when uptime < 300s", () => {
		const results = evaluateRules(makePayload({ uptime_seconds: 120 }));
		const uptime = results.find((r) => r.ruleId === "uptime_anomaly");
		expect(uptime?.fired).toBe(true);
		expect(uptime?.severity).toBe("info");
		expect(uptime?.value).toBe(120);
	});

	test("uptime_anomaly clears when uptime >= 300s", () => {
		const results = evaluateRules(makePayload({ uptime_seconds: 86400 }));
		const uptime = results.find((r) => r.ruleId === "uptime_anomaly");
		expect(uptime?.fired).toBe(false);
	});

	// --- Tier 3 rules ---

	test("cpu_pressure fires when psi.cpu_some_avg60 > 25", () => {
		const psi = makePsi({ cpu_some_avg60: 30 });
		const results = evaluateRules(makePayload({ psi }));
		const rule = results.find((r) => r.ruleId === "cpu_pressure");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
		expect(rule?.durationSeconds).toBe(300);
	});

	test("cpu_pressure does not fire at exactly 25", () => {
		const psi = makePsi({ cpu_some_avg60: 25 });
		const results = evaluateRules(makePayload({ psi }));
		const rule = results.find((r) => r.ruleId === "cpu_pressure");
		expect(rule?.fired).toBe(false);
	});

	test("cpu_pressure absent when no PSI data", () => {
		const results = evaluateRules(makePayload());
		const rule = results.find((r) => r.ruleId === "cpu_pressure");
		expect(rule).toBeUndefined();
	});

	test("mem_pressure fires when psi.mem_some_avg60 > 10", () => {
		const psi = makePsi({ mem_some_avg60: 15 });
		const results = evaluateRules(makePayload({ psi }));
		const rule = results.find((r) => r.ruleId === "mem_pressure");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
	});

	test("mem_pressure does not fire at exactly 10", () => {
		const psi = makePsi({ mem_some_avg60: 10 });
		const results = evaluateRules(makePayload({ psi }));
		const rule = results.find((r) => r.ruleId === "mem_pressure");
		expect(rule?.fired).toBe(false);
	});

	test("io_pressure fires when psi.io_some_avg60 > 20", () => {
		const psi = makePsi({ io_some_avg60: 25 });
		const results = evaluateRules(makePayload({ psi }));
		const rule = results.find((r) => r.ruleId === "io_pressure");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
	});

	test("io_pressure does not fire at exactly 20", () => {
		const psi = makePsi({ io_some_avg60: 20 });
		const results = evaluateRules(makePayload({ psi }));
		const rule = results.find((r) => r.ruleId === "io_pressure");
		expect(rule?.fired).toBe(false);
	});

	test("disk_io_saturated fires when any device io_util_pct > 80", () => {
		const disk_io = [
			{
				device: "sda",
				read_iops: 10,
				write_iops: 20,
				read_bytes_sec: 1024,
				write_bytes_sec: 2048,
				io_util_pct: 85,
			},
		];
		const results = evaluateRules(makePayload({ disk_io }));
		const rule = results.find((r) => r.ruleId === "disk_io_saturated");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
		expect(rule?.value).toBe(85);
		expect(rule?.message).toContain("sda");
	});

	test("disk_io_saturated does not fire at exactly 80", () => {
		const disk_io = [
			{
				device: "sda",
				read_iops: 10,
				write_iops: 20,
				read_bytes_sec: 1024,
				write_bytes_sec: 2048,
				io_util_pct: 80,
			},
		];
		const results = evaluateRules(makePayload({ disk_io }));
		const rule = results.find((r) => r.ruleId === "disk_io_saturated");
		expect(rule?.fired).toBe(false);
	});

	test("disk_io_saturated absent when no disk_io data", () => {
		const results = evaluateRules(makePayload());
		const rule = results.find((r) => r.ruleId === "disk_io_saturated");
		expect(rule).toBeUndefined();
	});

	test("tcp_conn_leak fires when time_wait > 500", () => {
		const tcp = { established: 10, time_wait: 600, orphan: 0, allocated: 50 };
		const results = evaluateRules(makePayload({ tcp }));
		const rule = results.find((r) => r.ruleId === "tcp_conn_leak");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
		expect(rule?.durationSeconds).toBe(300);
	});

	test("tcp_conn_leak does not fire at exactly 500", () => {
		const tcp = { established: 10, time_wait: 500, orphan: 0, allocated: 50 };
		const results = evaluateRules(makePayload({ tcp }));
		const rule = results.find((r) => r.ruleId === "tcp_conn_leak");
		expect(rule?.fired).toBe(false);
	});

	test("tcp_conn_leak absent when no tcp data", () => {
		const results = evaluateRules(makePayload());
		const rule = results.find((r) => r.ruleId === "tcp_conn_leak");
		expect(rule).toBeUndefined();
	});

	test("oom_kill fires when oom_kills_delta > 0", () => {
		const results = evaluateRules(makePayload({ oom_kills_delta: 3 }));
		const rule = results.find((r) => r.ruleId === "oom_kill");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("critical");
		expect(rule?.durationSeconds).toBe(0); // instant
		expect(rule?.message).toContain("3 OOM kill(s)");
	});

	test("oom_kill does not fire when oom_kills_delta == 0", () => {
		const results = evaluateRules(makePayload({ oom_kills_delta: 0 }));
		const rule = results.find((r) => r.ruleId === "oom_kill");
		expect(rule?.fired).toBe(false);
	});

	test("oom_kill absent when oom_kills_delta is undefined", () => {
		const results = evaluateRules(makePayload());
		const rule = results.find((r) => r.ruleId === "oom_kill");
		expect(rule).toBeUndefined();
	});

	// --- Signal expansion rules ---

	test("tcp_retrans_high fires when retrans_segs_sec > 10", () => {
		const snmp: SnmpMetrics = { retrans_segs_sec: 15 };
		const results = evaluateRules(makePayload({ snmp }));
		const rule = results.find((r) => r.ruleId === "tcp_retrans_high");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
		expect(rule?.durationSeconds).toBe(300);
	});

	test("tcp_retrans_high does not fire at exactly 10", () => {
		const snmp: SnmpMetrics = { retrans_segs_sec: 10 };
		const results = evaluateRules(makePayload({ snmp }));
		const rule = results.find((r) => r.ruleId === "tcp_retrans_high");
		expect(rule?.fired).toBe(false);
	});

	test("tcp_retrans_high absent when no snmp data", () => {
		const results = evaluateRules(makePayload());
		const rule = results.find((r) => r.ruleId === "tcp_retrans_high");
		expect(rule).toBeUndefined();
	});

	test("listen_drops fires when listen_drops_delta > 0", () => {
		const netstat: NetstatMetrics = { listen_drops_delta: 5 };
		const results = evaluateRules(makePayload({ netstat }));
		const rule = results.find((r) => r.ruleId === "listen_drops");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("critical");
		expect(rule?.durationSeconds).toBe(0);
	});

	test("listen_drops does not fire when listen_drops_delta == 0", () => {
		const netstat: NetstatMetrics = { listen_drops_delta: 0 };
		const results = evaluateRules(makePayload({ netstat }));
		const rule = results.find((r) => r.ruleId === "listen_drops");
		expect(rule?.fired).toBe(false);
	});

	test("inode_full fires when any disk inodes_used_pct > 90", () => {
		const disk: DiskMetric[] = [
			{
				mount: "/",
				total_bytes: 100_000_000_000,
				avail_bytes: 50_000_000_000,
				used_pct: 50,
				inodes_total: 1000000,
				inodes_avail: 50000,
				inodes_used_pct: 95,
			},
		];
		const results = evaluateRules(makePayload({ disk }));
		const rule = results.find((r) => r.ruleId === "inode_full");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("critical");
		expect(rule?.value).toBe(95);
	});

	test("inode_full does not fire at exactly 90", () => {
		const disk: DiskMetric[] = [
			{
				mount: "/",
				total_bytes: 100_000_000_000,
				avail_bytes: 50_000_000_000,
				used_pct: 50,
				inodes_total: 1000000,
				inodes_avail: 100000,
				inodes_used_pct: 90,
			},
		];
		const results = evaluateRules(makePayload({ disk }));
		const rule = results.find((r) => r.ruleId === "inode_full");
		expect(rule?.fired).toBe(false);
	});

	test("inode_full absent when no inode data", () => {
		const results = evaluateRules(makePayload());
		const rule = results.find((r) => r.ruleId === "inode_full");
		expect(rule).toBeUndefined();
	});

	test("swap_active fires when swap_in + swap_out > 1", () => {
		const results = evaluateRules(makePayload({ swap_in_sec: 0.8, swap_out_sec: 0.5 }));
		const rule = results.find((r) => r.ruleId === "swap_active");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
		expect(rule?.durationSeconds).toBe(300);
	});

	test("swap_active does not fire when swap_in + swap_out <= 1", () => {
		const results = evaluateRules(makePayload({ swap_in_sec: 0.3, swap_out_sec: 0.5 }));
		const rule = results.find((r) => r.ruleId === "swap_active");
		expect(rule?.fired).toBe(false);
	});

	test("hw_corrupted fires when hw_corrupted > 0", () => {
		const results = evaluateRules(makePayload({ hw_corrupted: 4096 }));
		const rule = results.find((r) => r.ruleId === "hw_corrupted");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("critical");
		expect(rule?.durationSeconds).toBe(0);
	});

	test("hw_corrupted does not fire when hw_corrupted == 0", () => {
		const results = evaluateRules(makePayload({ hw_corrupted: 0 }));
		const rule = results.find((r) => r.ruleId === "hw_corrupted");
		expect(rule?.fired).toBe(false);
	});

	test("overcommit_high fires when committed_as / commit_limit > 1.5", () => {
		const results = evaluateRules(
			makePayload({ committed_as: 16_000_000_000, commit_limit: 10_000_000_000 }),
		);
		const rule = results.find((r) => r.ruleId === "overcommit_high");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
		expect(rule?.durationSeconds).toBe(0);
	});

	test("overcommit_high does not fire at exactly 1.5", () => {
		const results = evaluateRules(
			makePayload({ committed_as: 15_000_000_000, commit_limit: 10_000_000_000 }),
		);
		const rule = results.find((r) => r.ruleId === "overcommit_high");
		expect(rule?.fired).toBe(false);
	});

	test("conntrack_full fires when count/max > 0.8", () => {
		const conntrack: ConntrackMetrics = { count: 90000, max: 100000 };
		const results = evaluateRules(makePayload({ conntrack }));
		const rule = results.find((r) => r.ruleId === "conntrack_full");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("critical");
		expect(rule?.durationSeconds).toBe(0);
	});

	test("conntrack_full does not fire at exactly 0.8", () => {
		const conntrack: ConntrackMetrics = { count: 80000, max: 100000 };
		const results = evaluateRules(makePayload({ conntrack }));
		const rule = results.find((r) => r.ruleId === "conntrack_full");
		expect(rule?.fired).toBe(false);
	});

	test("softnet_drops fires when dropped_delta > 0", () => {
		const softnet: SoftnetMetrics = { dropped_delta: 3 };
		const results = evaluateRules(makePayload({ softnet }));
		const rule = results.find((r) => r.ruleId === "softnet_drops");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
		expect(rule?.durationSeconds).toBe(0);
	});

	test("softnet_drops does not fire when dropped_delta == 0", () => {
		const softnet: SoftnetMetrics = { dropped_delta: 0 };
		const results = evaluateRules(makePayload({ softnet }));
		const rule = results.find((r) => r.ruleId === "softnet_drops");
		expect(rule?.fired).toBe(false);
	});

	test("disk_latency_high fires when read_await_ms > 100", () => {
		const disk_io: DiskIoMetric[] = [
			{
				device: "sda",
				read_iops: 10,
				write_iops: 20,
				read_bytes_sec: 1024,
				write_bytes_sec: 2048,
				io_util_pct: 50,
				read_await_ms: 150,
				write_await_ms: 50,
			},
		];
		const results = evaluateRules(makePayload({ disk_io }));
		const rule = results.find((r) => r.ruleId === "disk_latency_high");
		expect(rule?.fired).toBe(true);
		expect(rule?.severity).toBe("warning");
		expect(rule?.durationSeconds).toBe(300);
		expect(rule?.message).toContain("sda");
	});

	test("disk_latency_high fires when write_await_ms > 200", () => {
		const disk_io: DiskIoMetric[] = [
			{
				device: "nvme0n1",
				read_iops: 10,
				write_iops: 20,
				read_bytes_sec: 1024,
				write_bytes_sec: 2048,
				io_util_pct: 50,
				read_await_ms: 50,
				write_await_ms: 250,
			},
		];
		const results = evaluateRules(makePayload({ disk_io }));
		const rule = results.find((r) => r.ruleId === "disk_latency_high");
		expect(rule?.fired).toBe(true);
	});

	test("disk_latency_high does not fire when both under threshold", () => {
		const disk_io: DiskIoMetric[] = [
			{
				device: "sda",
				read_iops: 10,
				write_iops: 20,
				read_bytes_sec: 1024,
				write_bytes_sec: 2048,
				io_util_pct: 50,
				read_await_ms: 50,
				write_await_ms: 100,
			},
		];
		const results = evaluateRules(makePayload({ disk_io }));
		const rule = results.find((r) => r.ruleId === "disk_latency_high");
		expect(rule?.fired).toBe(false);
	});

	test("disk_latency_high absent when no latency data", () => {
		const disk_io: DiskIoMetric[] = [
			{
				device: "sda",
				read_iops: 10,
				write_iops: 20,
				read_bytes_sec: 1024,
				write_bytes_sec: 2048,
				io_util_pct: 50,
			},
		];
		const results = evaluateRules(makePayload({ disk_io }));
		const rule = results.find((r) => r.ruleId === "disk_latency_high");
		expect(rule).toBeUndefined();
	});

	test("signal expansion rules not evaluated when data absent", () => {
		const results = evaluateRules(makePayload());
		const seRules = [
			"tcp_retrans_high",
			"listen_drops",
			"inode_full",
			"swap_active",
			"hw_corrupted",
			"overcommit_high",
			"conntrack_full",
			"softnet_drops",
			"disk_latency_high",
		];
		for (const ruleId of seRules) {
			expect(results.find((r) => r.ruleId === ruleId)).toBeUndefined();
		}
	});
});

describe("evaluateAlerts (with D1 mock)", () => {
	let db: D1Database;
	const hostId = "test-host";
	const now = Math.floor(Date.now() / 1000);

	beforeEach(() => {
		db = createMockD1();
		// Insert host to satisfy FK
		db.prepare("INSERT INTO hosts (host_id, hostname, last_seen) VALUES (?, ?, ?)")
			.bind(hostId, "test-host", now)
			.run();
	});

	test("instant rule fires and creates alert_states row", async () => {
		const payload = makePayload({ disk_used_pct: 90 });
		await evaluateAlerts(db, hostId, payload, now);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "disk_full")
			.first<{ severity: string; value: number }>();

		expect(alert).not.toBeNull();
		expect(alert?.severity).toBe("critical");
		expect(alert?.value).toBe(90);
	});

	test("instant rule clears alert_states when condition clears", async () => {
		// First: fire the alert
		await evaluateAlerts(db, hostId, makePayload({ disk_used_pct: 90 }), now);
		const before = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "disk_full")
			.first();
		expect(before).not.toBeNull();

		// Then: condition clears
		await evaluateAlerts(db, hostId, makePayload({ disk_used_pct: 50 }), now + 30);
		const after = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "disk_full")
			.first();
		expect(after).toBeNull();
	});

	test("duration rule tracks in alert_pending first", async () => {
		const payload = makePayload({ iowait_pct: 25 });
		await evaluateAlerts(db, hostId, payload, now);

		// Should be in alert_pending, not yet in alert_states
		const pending = await db
			.prepare("SELECT * FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first<{ first_seen: number }>();
		expect(pending).not.toBeNull();
		expect(pending?.first_seen).toBe(now);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first();
		expect(alert).toBeNull();
	});

	test("duration rule promotes to alert_states after 5 min", async () => {
		const payload = makePayload({ iowait_pct: 25 });

		// First sample at t=0
		await evaluateAlerts(db, hostId, payload, now);

		// Second sample at t=300 (exactly at 5 min boundary)
		await evaluateAlerts(db, hostId, payload, now + 300);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first<{ severity: string }>();
		expect(alert).not.toBeNull();
		expect(alert?.severity).toBe("warning");
	});

	test("duration rule does not promote before 5 min", async () => {
		const payload = makePayload({ iowait_pct: 25 });

		// First sample at t=0
		await evaluateAlerts(db, hostId, payload, now);
		// Second sample at t=270 (4.5 min — not yet)
		await evaluateAlerts(db, hostId, payload, now + 270);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first();
		expect(alert).toBeNull();
	});

	test("duration rule clears both tables when condition clears", async () => {
		// Start tracking
		await evaluateAlerts(db, hostId, makePayload({ iowait_pct: 25 }), now);

		// Promote after 5 min
		await evaluateAlerts(db, hostId, makePayload({ iowait_pct: 25 }), now + 300);

		// Condition clears
		await evaluateAlerts(db, hostId, makePayload({ iowait_pct: 5 }), now + 330);

		const pending = await db
			.prepare("SELECT * FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first();
		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "iowait_high")
			.first();

		expect(pending).toBeNull();
		expect(alert).toBeNull();
	});

	test("multiple rules can fire simultaneously", async () => {
		const payload = makePayload({
			disk_used_pct: 95,
			mem_used_pct: 90,
			swap_used_pct: 60,
		});
		await evaluateAlerts(db, hostId, payload, now);

		const alerts = await db
			.prepare("SELECT rule_id FROM alert_states WHERE host_id = ?")
			.bind(hostId)
			.all<{ rule_id: string }>();

		const ruleIds = alerts.results.map((a) => a.rule_id).sort();
		expect(ruleIds).toContain("disk_full");
		expect(ruleIds).toContain("mem_high");
	});

	// --- Tier 3 D1 integration tests ---

	test("oom_kill instant alert creates alert_states row", async () => {
		const payload = makePayload({ oom_kills_delta: 2 });
		await evaluateAlerts(db, hostId, payload, now);

		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "oom_kill")
			.first<{ severity: string; value: number; message: string }>();

		expect(alert).not.toBeNull();
		expect(alert?.severity).toBe("critical");
		expect(alert?.value).toBe(2);
		expect(alert?.message).toContain("OOM kill");
	});

	test("oom_kill clears when oom_kills_delta == 0", async () => {
		// Fire
		await evaluateAlerts(db, hostId, makePayload({ oom_kills_delta: 1 }), now);
		const before = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "oom_kill")
			.first();
		expect(before).not.toBeNull();

		// Clear
		await evaluateAlerts(db, hostId, makePayload({ oom_kills_delta: 0 }), now + 30);
		const after = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "oom_kill")
			.first();
		expect(after).toBeNull();
	});

	test("cpu_pressure duration rule promotes after 5 min", async () => {
		const psi = makePsi({ cpu_some_avg60: 30 });
		const payload = makePayload({ psi });

		// First sample — should go to alert_pending
		await evaluateAlerts(db, hostId, payload, now);
		const pending = await db
			.prepare("SELECT * FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "cpu_pressure")
			.first<{ first_seen: number }>();
		expect(pending).not.toBeNull();

		// Not yet in alert_states
		const alertBefore = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "cpu_pressure")
			.first();
		expect(alertBefore).toBeNull();

		// Second sample at t+300 — should promote
		await evaluateAlerts(db, hostId, payload, now + 300);
		const alert = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "cpu_pressure")
			.first<{ severity: string }>();
		expect(alert).not.toBeNull();
		expect(alert?.severity).toBe("warning");
	});

	test("tcp_conn_leak duration rule clears when condition resolves", async () => {
		const tcp = { established: 10, time_wait: 600, orphan: 0, allocated: 50 };

		// Start tracking
		await evaluateAlerts(db, hostId, makePayload({ tcp }), now);
		// Promote
		await evaluateAlerts(db, hostId, makePayload({ tcp }), now + 300);

		const alertBefore = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "tcp_conn_leak")
			.first();
		expect(alertBefore).not.toBeNull();

		// Condition clears
		const tcpOk = { established: 10, time_wait: 100, orphan: 0, allocated: 50 };
		await evaluateAlerts(db, hostId, makePayload({ tcp: tcpOk }), now + 330);

		const alertAfter = await db
			.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "tcp_conn_leak")
			.first();
		const pendingAfter = await db
			.prepare("SELECT * FROM alert_pending WHERE host_id = ? AND rule_id = ?")
			.bind(hostId, "tcp_conn_leak")
			.first();
		expect(alertAfter).toBeNull();
		expect(pendingAfter).toBeNull();
	});

	test("T3 rules not evaluated when T3 data absent (no side effects)", async () => {
		// Basic payload without PSI/disk_io/tcp/oom
		await evaluateAlerts(db, hostId, makePayload(), now);

		// No T3 alert_states or alert_pending rows should exist
		const t3Rules = [
			"cpu_pressure",
			"mem_pressure",
			"io_pressure",
			"disk_io_saturated",
			"tcp_conn_leak",
			"oom_kill",
		];
		for (const ruleId of t3Rules) {
			const alert = await db
				.prepare("SELECT * FROM alert_states WHERE host_id = ? AND rule_id = ?")
				.bind(hostId, ruleId)
				.first();
			expect(alert).toBeNull();

			const pending = await db
				.prepare("SELECT * FROM alert_pending WHERE host_id = ? AND rule_id = ?")
				.bind(hostId, ruleId)
				.first();
			expect(pending).toBeNull();
		}
	});
});
