// @bat/shared — Tier 2 type compile-time validation tests
import { describe, expect, test } from "vitest";
import type {
	DiskDeepScanData,
	DockerContainer,
	DockerImagesInfo,
	DockerStatusData,
	FailedService,
	LargeFile,
	ListeningPort,
	SecurityPostureData,
	ServicePortsData,
	SystemdServicesData,
	Tier2Payload,
	Tier2Snapshot,
	TopDir,
} from "../tier2";

describe("tier2 types compile verification", () => {
	test("ListeningPort shape", () => {
		const port: ListeningPort = {
			port: 80,
			bind: "0.0.0.0",
			protocol: "tcp",
			pid: 1234,
			process: "nginx",
		};
		expect(port.port).toBe(80);
		expect(port.bind).toBe("0.0.0.0");
		expect(port.protocol).toBe("tcp");
	});

	test("ListeningPort with null pid/process", () => {
		const port: ListeningPort = {
			port: 443,
			bind: "::",
			protocol: "tcp6",
			pid: null,
			process: null,
		};
		expect(port.pid).toBeNull();
		expect(port.process).toBeNull();
	});

	test("ServicePortsData shape", () => {
		const data: ServicePortsData = {
			listening: [{ port: 22, bind: "0.0.0.0", protocol: "tcp", pid: 100, process: "sshd" }],
		};
		expect(data.listening.length).toBe(1);
	});

	test("FailedService shape", () => {
		const svc: FailedService = {
			unit: "nginx.service",
			load_state: "loaded",
			active_state: "failed",
			sub_state: "failed",
			description: "A high performance web server",
		};
		expect(svc.unit).toBe("nginx.service");
	});

	test("SystemdServicesData shape", () => {
		const data: SystemdServicesData = {
			failed_count: 1,
			failed: [
				{
					unit: "foo.service",
					load_state: "loaded",
					active_state: "failed",
					sub_state: "failed",
					description: "Foo",
				},
			],
		};
		expect(data.failed_count).toBe(1);
	});

	test("SecurityPostureData shape", () => {
		const data: SecurityPostureData = {
			ssh_password_auth: true,
			ssh_root_login: "yes",
			ssh_failed_logins_7d: 10248,
			firewall_active: false,
			firewall_default_policy: null,
			fail2ban_active: null,
			fail2ban_banned_count: null,
			unattended_upgrades_active: false,
		};
		expect(data.ssh_password_auth).toBe(true);
		expect(data.ssh_root_login).toBe("yes");
	});

	test("SecurityPostureData all null", () => {
		const data: SecurityPostureData = {
			ssh_password_auth: null,
			ssh_root_login: null,
			ssh_failed_logins_7d: null,
			firewall_active: null,
			firewall_default_policy: null,
			fail2ban_active: null,
			fail2ban_banned_count: null,
			unattended_upgrades_active: null,
		};
		expect(data.ssh_password_auth).toBeNull();
	});

	test("DockerContainer shape", () => {
		const c: DockerContainer = {
			id: "abc123",
			name: "n8n",
			image: "n8nio/n8n:latest",
			status: "Up 3 days",
			state: "running",
			cpu_pct: 2.5,
			mem_bytes: 256_000_000,
			restart_count: 0,
			started_at: 1700000000,
		};
		expect(c.state).toBe("running");
	});

	test("DockerImagesInfo shape", () => {
		const info: DockerImagesInfo = {
			total_count: 10,
			total_bytes: 5_000_000_000,
			reclaimable_bytes: 2_000_000_000,
		};
		expect(info.total_count).toBe(10);
	});

	test("DockerStatusData shape", () => {
		const data: DockerStatusData = {
			installed: true,
			version: "24.0.7",
			containers: [],
			images: {
				total_count: 5,
				total_bytes: 1_000_000_000,
				reclaimable_bytes: 500_000_000,
			},
		};
		expect(data.installed).toBe(true);
	});

	test("DockerStatusData not installed", () => {
		const data: DockerStatusData = {
			installed: false,
			version: null,
			containers: [],
			images: null,
		};
		expect(data.installed).toBe(false);
		expect(data.images).toBeNull();
	});

	test("TopDir shape", () => {
		const dir: TopDir = { path: "/usr", size_bytes: 2_000_000_000 };
		expect(dir.path).toBe("/usr");
	});

	test("LargeFile shape", () => {
		const file: LargeFile = { path: "/var/log/syslog", size_bytes: 500_000_000 };
		expect(file.size_bytes).toBe(500_000_000);
	});

	test("DiskDeepScanData shape", () => {
		const data: DiskDeepScanData = {
			top_dirs: [{ path: "/usr", size_bytes: 2_000_000_000 }],
			journal_bytes: 268_435_456,
			large_files: [],
		};
		expect(data.top_dirs.length).toBe(1);
		expect(data.journal_bytes).toBe(268_435_456);
	});

	test("DiskDeepScanData null journal", () => {
		const data: DiskDeepScanData = {
			top_dirs: [],
			journal_bytes: null,
			large_files: [],
		};
		expect(data.journal_bytes).toBeNull();
	});

	test("Tier2Payload minimal (host_id + timestamp only)", () => {
		const payload: Tier2Payload = {
			host_id: "test-host",
			timestamp: 1700000000,
		};
		expect(payload.host_id).toBe("test-host");
		expect(payload.ports).toBeUndefined();
	});

	test("Tier2Payload full", () => {
		const payload: Tier2Payload = {
			probe_version: "0.2.1",
			host_id: "test-host",
			timestamp: 1700000000,
			ports: { listening: [] },
			systemd: { failed_count: 0, failed: [] },
			security: {
				ssh_password_auth: false,
				ssh_root_login: "no",
				ssh_failed_logins_7d: 0,
				firewall_active: true,
				firewall_default_policy: "deny",
				fail2ban_active: true,
				fail2ban_banned_count: 3,
				unattended_upgrades_active: true,
			},
			docker: { installed: false, version: null, containers: [], images: null },
			disk_deep: { top_dirs: [], journal_bytes: null, large_files: [] },
		};
		expect(payload.probe_version).toBe("0.2.1");
		expect(payload.ports?.listening.length).toBe(0);
		expect(payload.security?.firewall_active).toBe(true);
	});

	test("Tier2Snapshot shape", () => {
		const snapshot: Tier2Snapshot = {
			host_id: "test-host",
			ts: 1700000000,
			ports: null,
			systemd: null,
			security: null,
			docker: null,
			disk_deep: null,
			software: null,
			timezone: null,
			dns_resolvers: null,
			dns_search: null,
		};
		expect(snapshot.host_id).toBe("test-host");
		expect(snapshot.ports).toBeNull();
	});

	test("Tier2Payload serializes correctly", () => {
		const payload: Tier2Payload = {
			host_id: "h",
			timestamp: 1,
			ports: {
				listening: [{ port: 22, bind: "0.0.0.0", protocol: "tcp", pid: 1, process: "sshd" }],
			},
		};
		const json = JSON.stringify(payload);
		const parsed = JSON.parse(json) as Tier2Payload;
		expect(parsed.ports?.listening[0].port).toBe(22);
	});
});
