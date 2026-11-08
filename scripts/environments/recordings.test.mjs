import { describe, expect, test } from "bun:test";
import { isIP } from "node:net";
import { SCHEMA_VERSION, sanitizeRecording } from "./recordings.mjs";

const CAPTURED_AT = 1_790_000_000;
const SERVER_IDS = ["srv-h", "srv-a", "srv-f", "srv-b", "srv-g", "srv-c", "srv-e", "srv-d"];
const SERVER_ADDRESS = Object.fromEntries(
	SERVER_IDS.map((id, index) => [id, `10.42.7.${10 + index}`]),
);
const CANARIES = [
	"prod-canary-host",
	"10.42.7.19",
	"fd00:dead:beef::42",
	"owner-canary",
	"2001:db80::1",
	"2001:DB8::abcd",
	"987654",
	"aa:bb:cc:dd:ee:ff",
	"d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70",
	"intranet.corp-canary.io",
	"alice-canary",
	"CANARY-SECRET-TOKEN-9f3a",
	"REAL-HOST-ID",
	"registry.corp-canary.io",
	"backup-canary.service",
	"CANARY-OS-8a1c",
	"CANARY-CPU-4b2d",
	"CANARY-KERNEL-7c3e",
	"CANARY-VERSION-1d5f",
	"CANARY-STATE-2e6a",
	"CANARY-IFACE-3f7b",
	"CANARY-MOUNT-4a8c",
	"CANARY-USER-5b9d",
	"CANARY-USERPATH-6c1e",
	"CANARY-DESCRIPTION-7d2f",
	"CANARY-IMAGE-8e3a",
	"CANARY-SOFTWARE-9f4b",
	"CANARY-PROC-zz9",
	"CANARY-NAME-5c7d",
];
const ABSOLUTE_TIME_KEYS = new Set([
	"ts",
	"from",
	"to",
	"captured_at",
	"boot_time",
	"last_seen",
	"last_seen_at",
	"created_at",
	"started_at",
	"finished_at",
	"received_at",
	"top_processes_ts",
]);

function collectKeys(value, keys = new Set()) {
	if (Array.isArray(value)) {
		for (const entry of value) collectKeys(entry, keys);
	} else if (typeof value === "object" && value !== null) {
		for (const [key, entry] of Object.entries(value)) {
			keys.add(key);
			collectKeys(entry, keys);
		}
	}
	return keys;
}

function collectStrings(value, strings = []) {
	if (Array.isArray(value)) {
		for (const entry of value) collectStrings(entry, strings);
	} else if (typeof value === "object" && value !== null) {
		for (const entry of Object.values(value)) collectStrings(entry, strings);
	} else if (typeof value === "string") {
		strings.push(value);
	}
	return strings;
}

function documentationV6(value) {
	const [head = "", tail = ""] = value.split("::");
	const left = head === "" ? [] : head.split(":");
	const right = tail === "" ? [] : tail.split(":");
	const fill = Math.max(0, 8 - left.length - right.length);
	const groups = [...left, ...Array(fill).fill("0"), ...right];
	return (
		groups.length === 8 &&
		Number.parseInt(groups[0], 16) === 0x2001 &&
		Number.parseInt(groups[1], 16) === 0x0db8
	);
}

function fnv1a(value) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function metricPoint(ts, overrides = {}) {
	return {
		ts,
		cpu_usage_pct: 42.5,
		mem_used_pct: null,
		uptime_seconds: 864000,
		...overrides,
	};
}

function baseInput() {
	return {
		captured_at: CAPTURED_AT,
		server_detail: {
			hid: "deadbeef",
			host_id: "REAL-HOST-ID",
			hostname: "prod-canary-host",
			os: "Ubuntu 24.04.2 LTS CANARY-OS-8a1c",
			kernel: "6.8.0-45-generic CANARY-KERNEL-7c3e",
			arch: "x86_64",
			cpu_model: "AMD EPYC 7B13 CANARY-CPU-4b2d",
			boot_time: CAPTURED_AT - 864000,
			status: "healthy",
			cpu_usage_pct: 21.5,
			mem_used_pct: 63.4,
			uptime_seconds: 864000,
			last_seen: CAPTURED_AT - 60,
			alert_count: 2,
			cpu_logical: 8,
			cpu_physical: 4,
			mem_total_bytes: 8589934592,
			virtualization: "kvm",
			public_ip: "2001:db8::42%owner-canary",
			probe_version: "0.6.0",
			cpu_load1: 1.2,
			swap_used_pct: 0,
			disk_root_used_pct: 40,
			net_rx_rate: 125000,
			net_tx_rate: 62500,
			cpu_sparkline: [{ ts: CAPTURED_AT - 3600, v: 21.5 }],
			mem_sparkline: null,
			net_sparkline: [],
			description: "Owner alice-canary CANARY-DESCRIPTION-7d2f",
			swap_total_bytes: 0,
			boot_mode: "uefi",
			timezone: "UTC",
			dns_resolvers: ["10.42.7.19", "fd00::1%owner-canary"],
			dns_search: ["intranet.corp-canary.io"],
			net_interfaces: [
				{
					iface: "CANARY-IFACE-3f7b",
					mac: "aa:bb:cc:dd:ee:ff",
					ipv4: ["10.42.7.19"],
					ipv6: ["fd00:dead:beef::42%owner-canary", "2001:db80::1", "2001:DB8::abcd"],
					speed_mbps: 1000,
				},
				{
					iface: "lo",
					mac: "00:00:00:00:00:00",
					ipv4: ["127.0.0.1"],
					ipv6: ["::1"],
					speed_mbps: null,
				},
			],
			disks: [{ device: "/dev/nvme0n1", size_bytes: 512110190592, rotational: false }],
			top_processes_json: JSON.stringify([
				{
					pid: 4242,
					name: "postgres",
					cmd: "postgres -D /home/alice-canary/db --password CANARY-SECRET-TOKEN-9f3a",
					state: "S",
					ppid: 1,
					user: "alice-canary",
					cpu_pct: 12.5,
					mem_rss: 1073741824,
					mem_pct: 3.1,
					mem_virt: 2147483648,
					num_threads: 8,
					uptime: 86400,
					majflt_rate: 0,
					io_read_rate: 1024,
					io_write_rate: 2048,
					processor: 3,
					env_secret: "CANARY-SECRET-TOKEN-9f3a",
				},
				{
					pid: 5151,
					name: "CANARY-PROC-zz9",
					cmd: "x",
					state: "CANARY-STATE-2e6a",
					ppid: 4242,
					user: "CANARY-USER-5b9d",
				},
			]),
			top_processes_ts: CAPTURED_AT - 120,
			evil: "CANARY-SECRET-TOKEN-9f3a",
		},
		server_raw: {
			host_id: "REAL-HOST-ID",
			resolution: "raw",
			from: CAPTURED_AT - 3600,
			to: CAPTURED_AT,
			data: [
				metricPoint(CAPTURED_AT - 30, {
					disk_json: JSON.stringify([
						{ mount: "/", total_bytes: 1000, avail_bytes: 500, used_pct: 50 },
						{ mount: "/home/alice-canary", total_bytes: 10, avail_bytes: 5, used_pct: 50 },
					]),
					net_json: JSON.stringify([
						{
							iface: "CANARY-IFACE-3f7b",
							rx_bytes_rate: 1000,
							tx_bytes_rate: 2000,
							rx_errors: 0,
							tx_errors: 0,
							token: "CANARY-SECRET-TOKEN-9f3a",
						},
					]),
					disk_io_json: JSON.stringify([
						{
							device: "/dev/nvme0n1",
							read_iops: 10,
							write_iops: 5,
							io_util_pct: 3,
							secret: "CANARY-SECRET-TOKEN-9f3a",
						},
					]),
					evil: "CANARY-SECRET-TOKEN-9f3a",
				}),
				metricPoint(CAPTURED_AT - 60, {
					disk_json: "not-json CANARY-SECRET-TOKEN-9f3a",
					net_json: JSON.stringify({ iface: "CANARY-IFACE-3f7b" }),
					disk_io_json: "[]",
				}),
			],
			evil: "CANARY-SECRET-TOKEN-9f3a",
		},
		server_hourly: {
			host_id: "REAL-HOST-ID",
			resolution: "hourly",
			from: CAPTURED_AT - 86400,
			to: CAPTURED_AT,
			data: [metricPoint(CAPTURED_AT - 3600, { sample_count: 120, net_rx_bytes_avg: 100 })],
		},
		server_tier2: {
			host_id: "REAL-HOST-ID",
			ts: CAPTURED_AT - 600,
			ports: {
				listening: [
					{
						port: 5432,
						bind: "10.42.7.19",
						protocol: "tcp",
						pid: 4242,
						process: "postgres",
						evil: "CANARY-SECRET-TOKEN-9f3a",
					},
					{ port: 22, bind: "0.0.0.0", protocol: "tcp", pid: 5151, process: "CANARY-PROC-zz9" },
				],
			},
			systemd: {
				failed_count: 1,
				failed: [
					{
						unit: "backup-canary.service",
						load_state: "loaded",
						active_state: "CANARY-STATE-2e6a",
						sub_state: "failed",
						description: "Owner alice-canary",
					},
				],
			},
			security: {
				ssh_password_auth: true,
				ssh_root_login: "no",
				ssh_failed_logins_7d: 12,
				firewall_active: true,
				firewall_default_policy: "deny",
				fail2ban_active: false,
				fail2ban_banned_count: 0,
				unattended_upgrades_active: true,
				evil: "CANARY-SECRET-TOKEN-9f3a",
			},
			docker: {
				installed: true,
				version: "28.5.1",
				containers: [
					{
						id: "a".repeat(64),
						name: "alice-canary-db",
						image: "https://user:pass@registry.corp-canary.io/db:1.2",
						status: "Up 2 days",
						state: "CANARY-STATE-2e6a",
						cpu_pct: 12,
						mem_bytes: 268435456,
						restart_count: 0,
						started_at: CAPTURED_AT - 172800,
						evil: "CANARY-IMAGE-8e3a",
					},
				],
				images: { total_count: 4, total_bytes: 100, reclaimable_bytes: 20 },
			},
			disk_deep: {
				top_dirs: [
					{ path: "CANARY-USERPATH-6c1e", size_bytes: 100 },
					{ path: "/var/log", size_bytes: 50 },
				],
				journal_bytes: 10,
				large_files: [{ path: "/var/backups/db.sql.gz", size_bytes: 20 }],
			},
			software: {
				detected: [
					{
						id: "nginx",
						name: "Nginx CANARY-NAME-5c7d",
						category: "web",
						version: "CANARY-VERSION-1d5f",
						source: "binary",
						running: true,
						listening_ports: [443],
					},
					{
						id: "redis",
						name: "Redis",
						category: "cache",
						version: "7.4.1",
						source: "process",
						running: true,
						listening_ports: [6379],
					},
					{
						id: "CANARY-SOFTWARE-9f4b",
						name: "Canary",
						category: "web",
						version: "1.2.3",
						source: "process",
						running: true,
						listening_ports: [],
					},
				],
				scan_duration_ms: 240,
				version_duration_ms: 120,
			},
			websites: {
				sites: [{ domain: "intranet.corp-canary.io", web_server: "nginx", ssl: true }],
			},
			timezone: "UTC",
			dns_resolvers: ["10.42.7.19"],
			dns_search: ["intranet.corp-canary.io"],
			evil: "CANARY-SECRET-TOKEN-9f3a",
		},
		server_ports: Array.from({ length: 8 }, (_, index) => ({
			port: 8000 + index,
			reason: "Allow alice-canary CANARY-SECRET-TOKEN-9f3a",
			created_at: CAPTURED_AT - 100 - index,
			evil: "CANARY-SECRET-TOKEN-9f3a",
		})),
		server_tags: [{ id: 987654, name: "production CANARY-NAME-5c7d", color: 2 }],
		workstation_detail: {
			id: "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70",
			owner: "alice-canary@corp-canary.io",
			name: "Field laptop alice-canary",
			created_at: CAPTURED_AT - 86400,
			last_seen_at: CAPTURED_AT - 50,
			public_ip: "10.42.7.19",
			disabled: false,
			latest_report: {
				report_id: "d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70",
				received_at: CAPTURED_AT - 10,
				started_at: CAPTURED_AT - 62,
				finished_at: CAPTURED_AT - 60,
				sample_window_ms: 1000,
				cli_version: "2.4.2",
				hostname: "prod-canary-host",
				os: "Darwin 24.6.0",
				arch: "arm64",
				uptime_seconds: 864000,
				cpu: { model: "Apple M3 Pro CANARY-CPU-4b2d", count: 12, usage_pct: null },
				mem: { total_bytes: 38654705664, available_bytes: 20000000000, used_pct: 48.3 },
				disk: [
					{ mount: "/Users/alice-canary", total_bytes: 100, available_bytes: 50, used_pct: 50 },
				],
				network: {
					interfaces: [
						{
							name: "en0",
							addresses: [
								{ address: "10.42.7.19", family: 4, internal: false },
								{ address: "fd00:dead:beef::42", family: 6, internal: false },
								{ address: "127.0.0.1", family: 4, internal: true },
							],
						},
					],
				},
				connectivity: [
					{
						server_id: "srv-c",
						address: SERVER_ADDRESS["srv-c"],
						family: 4,
						sent: 3,
						received: 2,
						rtts_ms: [21.5, null, 23.1],
						status: "partial",
						evil: "CANARY-SECRET-TOKEN-9f3a",
					},
					{
						server_id: "srv-a",
						address: SERVER_ADDRESS["srv-a"],
						family: 4,
						sent: 3,
						received: 0,
						rtts_ms: [null, null, null],
						status: "timeout",
					},
				],
				collection_errors: ["ping 10.42.7.19 CANARY-SECRET-TOKEN-9f3a"],
				targets_error: "connect to intranet.corp-canary.io CANARY-SECRET-TOKEN-9f3a",
				evil: "CANARY-SECRET-TOKEN-9f3a",
			},
			evil: "CANARY-SECRET-TOKEN-9f3a",
		},
		workstation_metrics: {
			data: Array.from({ length: 4 }, (_, index) => ({
				received_at: CAPTURED_AT - 50 - index * 600,
				started_at: CAPTURED_AT - 52 - index * 600,
				finished_at: CAPTURED_AT - 50 - index * 600,
				cpu_usage_pct: index === 1 ? null : 20 + index,
				mem_used_pct: 48.3,
				mem_total_bytes: 38654705664,
				mem_available_bytes: 20000000000,
				uptime_seconds: 864000,
				evil: "CANARY-SECRET-TOKEN-9f3a",
			})),
			page: { limit: 4, offset: 0, next_offset: null },
		},
		workstation_connectivity: {
			targets: SERVER_IDS.map((serverId) => ({
				server_id: serverId,
				address: SERVER_ADDRESS[serverId],
				family: 4,
				data: [
					{
						received_at: CAPTURED_AT - 50,
						received: 3,
						rtt_avg_ms: 21.5,
						rtt_min_ms: 20,
						rtt_max_ms: 24,
						status: "reachable",
						evil: "CANARY-SECRET-TOKEN-9f3a",
					},
					{
						received_at: CAPTURED_AT - 650,
						received: 0,
						rtt_avg_ms: null,
						rtt_min_ms: null,
						rtt_max_ms: null,
						status: "timeout",
					},
				],
				evil: "CANARY-SECRET-TOKEN-9f3a",
			})),
			limit: 8,
			evil: "CANARY-SECRET-TOKEN-9f3a",
		},
		evil: "CANARY-SECRET-TOKEN-9f3a",
	};
}

const recording = sanitizeRecording(baseInput());
const detail = recording.server.detail;
const tier2 = recording.server.tier2;

describe("sanitizeRecording", () => {
	test("emits the documented normalized schema and survives JSON round trips", () => {
		expect(Object.keys(recording).sort()).toEqual([
			"schema_version",
			"server",
			"targets",
			"workstation",
		]);
		expect(recording.schema_version).toBe(SCHEMA_VERSION);
		expect(Object.keys(recording.server).sort()).toEqual([
			"allowed_ports",
			"detail",
			"hourly",
			"raw",
			"tags",
			"tier2",
		]);
		expect(Object.keys(recording.workstation).sort()).toEqual([
			"connectivity",
			"detail",
			"metrics",
		]);
		expect(JSON.parse(JSON.stringify(recording))).toEqual(recording);
	});

	test("no canary survives anywhere in the recording", () => {
		const serialized = JSON.stringify(recording);
		for (const canary of CANARIES) expect(serialized).not.toContain(canary);
	});

	test("unknown fields are dropped at every level", () => {
		const keys = collectKeys(recording);
		for (const key of ["evil", "env_secret", "token", "secret"]) {
			expect(keys.has(key)).toBe(false);
		}
	});

	test("embedded raw JSON tables are parsed and whitelisted", () => {
		const [point, broken] = recording.server.raw.data;
		expect(point.net[0]).toMatchObject({ iface: "eth0", rx_bytes_rate: 1000 });
		expect(Object.keys(point.net[0])).not.toContain("token");
		expect(point.disk_io[0]).toMatchObject({ device: "vda", read_iops: 10 });
		expect(Object.keys(point.disk_io[0])).not.toContain("secret");
		expect(point.disk[0].mount).toBe("/");
		expect(point.disk[1].mount).toMatch(/^\/mnt\/data-\d{2}$/);
		expect(broken.disk).toEqual([]);
		expect(broken.net).toEqual([]);
		expect(broken.disk_io).toEqual([]);
	});

	test("interface, device and mount aliases stay consistent across sources", () => {
		expect(detail.net_interfaces[0].iface).toBe("eth0");
		expect(detail.net_interfaces[0].iface).toBe(recording.server.raw.data[0].net[0].iface);
		expect(detail.net_interfaces[1].iface).toBe("lo");
		expect(detail.net_interfaces[0].mac).toMatch(/^02:00:00:00:00:[0-9a-f]{2}$/);
		expect(detail.disks[0].device).toBe("vda");
		expect(detail.disks[0].device).toBe(recording.server.raw.data[0].disk_io[0].device);
		expect(recording.workstation.detail.latest_report.disk[0].mount).toMatch(/^\/mnt\/data-\d{2}$/);
		expect(tier2.disk_deep.top_dirs[0].path).toMatch(/^\/var\/lib\/demo-\d{2}$/);
		expect(tier2.disk_deep.top_dirs[1].path).toBe("/var/log");
	});

	test("processes keep only allowlisted names, safe commands and canonical users", () => {
		const [postgres, other] = detail.top_processes;
		expect(postgres).toMatchObject({ name: "postgres", cmd: "postgres", user: "demo", state: "S" });
		expect(other.name).toMatch(/^service-\d{2}$/);
		expect(other.cmd).toBe(other.name);
		expect(other.user).toBe("demo");
		expect(other.state).toBe("S");
		expect(postgres.cmd).not.toContain("/home");
		expect(postgres.ppid).toBe(1);
		expect(other.ppid).toBe(postgres.pid);
		expect(tier2.ports.listening[0].pid).toBe(postgres.pid);
		expect(tier2.ports.listening[1].pid).toBe(other.pid);
		expect(tier2.ports.listening[1].process).toBe(other.name);
	});

	test("all absolute times become ages relative to the capture anchor", () => {
		expect(detail.boot_time_age_seconds).toBe(864000);
		expect(detail.last_seen_age_seconds).toBe(60);
		expect(detail.top_processes_age_seconds).toBe(120);
		expect(detail.cpu_sparkline).toEqual([{ age_seconds: 3600, v: 21.5 }]);
		expect(recording.server.raw.from_age_seconds).toBe(3600);
		expect(recording.server.raw.to_age_seconds).toBe(0);
		expect(recording.server.raw.data[0].age_seconds).toBe(30);
		expect(recording.server.hourly.data[0].age_seconds).toBe(3600);
		expect(tier2.age_seconds).toBe(600);
		expect(recording.server.allowed_ports[0].created_at_age_seconds).toBe(100);
		expect(recording.workstation.detail.created_at_age_seconds).toBe(86400);
		expect(recording.workstation.detail.last_seen_at_age_seconds).toBe(50);
		expect(recording.workstation.detail.latest_report.finished_at_age_seconds).toBe(60);
		expect(recording.workstation.detail.latest_report.received_at_age_seconds).toBe(10);
		expect(recording.workstation.metrics.data[0].received_at_age_seconds).toBe(50);
		expect(recording.workstation.connectivity.targets[0].data[0].received_at_age_seconds).toBe(50);
		const absolute = [...collectKeys(recording)].filter((key) => ABSOLUTE_TIME_KEYS.has(key));
		expect(absolute).toEqual([]);
	});

	test("genuine nulls and failures stay null instead of fabricating health", () => {
		expect(recording.server.raw.data[0].mem_used_pct).toBeNull();
		expect(detail.mem_sparkline).toEqual([]);
		expect(recording.workstation.detail.latest_report.cpu.usage_pct).toBeNull();
		const reportEntry = recording.workstation.detail.latest_report.connectivity[1];
		expect(reportEntry.rtts_ms).toEqual([null, null, null]);
		expect(reportEntry.status).toBe("timeout");
		expect(recording.workstation.detail.latest_report.targets_error).toBe(
			"Target discovery failed",
		);
		expect(recording.workstation.detail.latest_report.collection_errors).toEqual([
			"Collection failed",
		]);
		expect(recording.workstation.metrics.data[1].cpu_usage_pct).toBeNull();
	});

	test("server identity is stable across detail, metrics and tier2", () => {
		expect(detail.host_id).toBe("demo-server-01");
		expect(detail.hostname).toBe("server-01.example.test");
		expect(detail.hid).toBe(fnv1a("demo-server-01"));
		for (const section of [recording.server.raw, recording.server.hourly, tier2]) {
			expect(section.host_id).toBe("demo-server-01");
		}
		expect(recording.workstation.detail.id).toBe("00000000-0000-4000-8000-000000000001");
		expect(recording.workstation.detail.owner).toBe("email:operator@example.test");
		expect(recording.workstation.detail.name).toBe("Demo workstation");
	});

	test("free-text OS, kernel, CPU, versions and states fall back to safe values", () => {
		expect(detail.os).toBeNull();
		expect(detail.kernel).toBe("6.8.0");
		expect(detail.cpu_model).toBe("Generic x86-64 CPU");
		expect(detail.arch).toBe("x86_64");
		expect(detail.boot_mode).toBe("uefi");
		expect(detail.timezone).toBe("UTC");
		expect(detail.dns_search).toEqual(["site-01.example.test"]);
		expect(tier2.websites.sites[0].domain).toBe("site-01.example.test");
		expect(tier2.software.detected.map((entry) => entry.id)).toEqual(["nginx", "redis"]);
		expect(tier2.software.detected[0]).toMatchObject({ name: "nginx", version: null });
		expect(tier2.software.detected[1]).toMatchObject({ version: "7.4.1" });
		expect(tier2.systemd.failed[0]).toEqual({
			unit: "service-01.service",
			load_state: "loaded",
			active_state: null,
			sub_state: "failed",
			description: "Synthetic unit",
		});
		expect(tier2.docker.containers[0]).toMatchObject({
			id: "demo-01",
			name: "container-01",
			image: "example.test/image-01:1",
			state: null,
			status: null,
		});
		expect(tier2.docker.version).toBe("28.5.1");
		expect(recording.server.tags[0]).toEqual({ id: 1, name: "tag-01", color: 2 });
		expect(recording.server.allowed_ports[0].reason).toBe("Synthetic allowlist entry");
		const report = recording.workstation.detail.latest_report;
		expect(report.os).toBe("macOS");
		expect(report.arch).toBe("arm64");
		expect(report.cpu.model).toBe("Generic ARM64 CPU");
		expect(report.hostname).toBe("workstation-01.example.test");
	});

	test("IPv6 documentation detection uses canonical hextets, not string prefixes", () => {
		expect(detail.net_interfaces[0].ipv6).toEqual(["2001:db8::2", "2001:db8::3", "2001:db8::abcd"]);
		expect(detail.dns_resolvers[1]).toBe("2001:db8::1");
		expect(documentationV6("2001:db80::1")).toBe(false);
		expect(documentationV6("2001:DB8::1")).toBe(true);
	});

	test("IPv6 zones are stripped before validation and never reach output", () => {
		expect(detail.public_ip).toBe("2001:db8::42");
		expect(detail.dns_resolvers).toEqual(["203.0.113.1", "2001:db8::1"]);
		const serialized = JSON.stringify(recording);
		expect(serialized).not.toContain("%");
		expect(serialized).not.toContain("owner-canary");
	});

	test("only reserved documentation addresses and safe domains are emitted", () => {
		for (const value of collectStrings(recording)) {
			const family = isIP(value);
			if (family === 4) {
				expect(
					value === "127.0.0.1" ||
						value === "0.0.0.0" ||
						/^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/.test(value),
				).toBe(true);
			} else if (family === 6) {
				expect(value === "::" || value === "::1" || documentationV6(value)).toBe(true);
			}
		}
		for (const entry of collectStrings(recording).filter((value) => value.includes(".test"))) {
			expect(entry.endsWith("example.test") || entry.startsWith("example.test/")).toBe(true);
		}
		for (const value of collectStrings(recording).filter((entry) => entry.includes("http"))) {
			expect(value.startsWith("example.test/")).toBe(true);
		}
	});

	test("eight workstation targets map to sorted logical servers from one capture", () => {
		const targets = recording.targets;
		expect(targets).toHaveLength(8);
		expect(targets.map((entry) => entry.server_id)).toEqual(
			Array.from({ length: 8 }, (_, index) => `server-0${index + 1}`),
		);
		expect(targets[0]).toMatchObject({ server_id: "server-01", name: "Server 01", family: 4 });
		const connectivity = recording.workstation.connectivity.targets;
		expect(new Set(connectivity.map((entry) => entry.server_id))).toEqual(
			new Set(targets.map((entry) => entry.server_id)),
		);
		const reportEntries = recording.workstation.detail.latest_report.connectivity;
		for (const entry of reportEntries) {
			expect(targets.some((target) => target.server_id === entry.server_id)).toBe(true);
		}
		const targetByServer = new Map(targets.map((target) => [target.server_id, target]));
		for (const entry of connectivity) {
			expect(entry.address).toBe(targetByServer.get(entry.server_id).address);
		}
		for (const entry of reportEntries) {
			expect(entry.address).toBe(targetByServer.get(entry.server_id).address);
		}
	});

	test("target metadata comes from the latest report when history is empty", () => {
		const reportOnly = baseInput();
		reportOnly.workstation_connectivity = { targets: [], limit: 8 };
		reportOnly.workstation_detail.latest_report.connectivity = [
			{
				server_id: "srv-report-only",
				address: "2001:db8::77",
				family: 6,
				sent: 3,
				received: 3,
				rtts_ms: [1, 2, 3],
				status: "reachable",
			},
		];
		const output = sanitizeRecording(reportOnly);
		expect(output.targets).toEqual([
			{ server_id: "server-01", name: "Server 01", address: "2001:db8::77", family: 6 },
		]);
		expect(output.workstation.connectivity.targets).toEqual([]);

		const preferred = baseInput();
		preferred.workstation_connectivity = {
			targets: [{ server_id: "srv-x", address: "10.42.7.99", family: 4, data: [] }],
			limit: 1,
		};
		preferred.workstation_detail.latest_report.connectivity = [
			{
				server_id: "srv-x",
				address: "2001:db8::99",
				family: 6,
				sent: 3,
				received: 2,
				rtts_ms: [5, null, 6],
				status: "partial",
			},
		];
		expect(sanitizeRecording(preferred).targets[0]).toMatchObject({
			server_id: "server-01",
			address: "2001:db8::99",
			family: 6,
		});
	});

	test("is pure, deterministic and never mutates the captured input", () => {
		const input = baseInput();
		const snapshot = structuredClone(input);
		const first = sanitizeRecording(input);
		expect(input).toEqual(snapshot);
		expect(sanitizeRecording(structuredClone(input))).toEqual(first);
		expect(recording).toEqual(first);
	});

	test("rejects unusable recordings and never echoes rejected values", () => {
		expect(() => sanitizeRecording(null)).toThrow("recording must be an object");
		expect(() => sanitizeRecording({ server_detail: {} })).toThrow("captured_at");
		try {
			sanitizeRecording({ captured_at: CAPTURED_AT, server_detail: "CANARY-SECRET-TOKEN-9f3a" });
			throw new Error("expected rejection");
		} catch (error) {
			expect(error.message).toBe("recording.server_detail must be an object");
			expect(error.message).not.toContain("CANARY");
		}
		expect(() =>
			sanitizeRecording({ captured_at: CAPTURED_AT, server_ports: "CANARY-SECRET-TOKEN-9f3a" }),
		).toThrow("recording.server_ports must be an array");
	});
});
