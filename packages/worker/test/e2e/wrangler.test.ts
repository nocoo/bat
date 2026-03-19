// Worker L3 E2E tests — real HTTP requests against local Wrangler dev server
// Per docs/07-testing.md § L3: self-bootstrapping Wrangler on port 18787
//
// Prerequisites:
//   - wrangler installed (devDependency)
//
// Run: pnpm --filter @bat/worker test:e2e
//
// The test suite:
//   1. Writes .dev.vars with test secrets
//   2. Applies migrations to local D1 via wrangler d1 execute
//   3. Starts wrangler dev on port 18787 (local D1)
//   4. Runs test cases against http://localhost:18787
//   5. Tears down the server and cleans up on exit

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	AlertItem,
	HostDetailItem,
	HostOverviewItem,
	MetricsQueryResponse,
} from "@bat/shared";
import { hashHostId } from "@bat/shared";

const PORT = 18787;
const BASE = `http://localhost:${PORT}`;
const WRITE_KEY = "e2e-write-key";
const READ_KEY = "e2e-read-key";
const WORKER_ROOT = join(import.meta.dir, "../..");
const PERSIST_DIR = join(WORKER_ROOT, ".wrangler/e2e");
const DEV_VARS_PATH = join(WORKER_ROOT, ".dev.vars");

let wranglerProc: ReturnType<typeof Bun.spawn> | null = null;
let devVarsExistedBefore = false;

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (res.ok || res.status === 401 || res.status === 503) return;
		} catch {
			// Server not ready yet
		}
		await Bun.sleep(300);
	}
	throw new Error(`Wrangler did not start within ${timeoutMs}ms`);
}

async function runCommand(cmd: string[], cwd: string): Promise<void> {
	const proc = Bun.spawn(cmd, {
		cwd,
		stdout: "ignore",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`Command failed (exit ${exitCode}): ${cmd.join(" ")}\n${stderr}`);
	}
}

beforeAll(async () => {
	// 1. Write .dev.vars so wrangler dev can read the secrets
	devVarsExistedBefore = existsSync(DEV_VARS_PATH);
	writeFileSync(DEV_VARS_PATH, `BAT_WRITE_KEY=${WRITE_KEY}\nBAT_READ_KEY=${READ_KEY}\n`);

	// 2. Clean previous E2E persist dir for a fresh state
	if (existsSync(PERSIST_DIR)) {
		rmSync(PERSIST_DIR, { recursive: true, force: true });
	}

	// 3. Apply migrations to local D1 using the same persist path
	const migrations = [
		"migrations/0001_initial.sql",
		"migrations/0002_dedup_constraint.sql",
		"migrations/0003_tier2_tables.sql",
		"migrations/0004_tier3_columns.sql",
		"migrations/0005_host_inventory.sql",
		"migrations/0006_public_ip.sql",
		"migrations/0007_probe_version.sql",
		"migrations/0008_signal_expansion.sql",
		"migrations/0009_signal_expansion_hourly.sql",
		"migrations/0010_tags.sql",
		"migrations/0011_software_column.sql",
		"migrations/0012_port_allowlist.sql",
	];
	for (const migration of migrations) {
		await runCommand(
			[
				"npx",
				"wrangler",
				"d1",
				"execute",
				"bat-db",
				"--local",
				"--persist-to",
				".wrangler/e2e",
				"--file",
				migration,
			],
			WORKER_ROOT,
		);
	}

	// 4. Start wrangler dev on the E2E port with local D1
	wranglerProc = Bun.spawn(
		["npx", "wrangler", "dev", "--port", String(PORT), "--local", "--persist-to", ".wrangler/e2e"],
		{
			cwd: WORKER_ROOT,
			stdout: "ignore",
			stderr: "ignore",
		},
	);

	await waitForServer(`${BASE}/`);
}, 60_000);

afterAll(() => {
	if (wranglerProc) {
		wranglerProc.kill();
		wranglerProc = null;
	}

	// Restore .dev.vars — remove only if we created it
	if (!devVarsExistedBefore && existsSync(DEV_VARS_PATH)) {
		rmSync(DEV_VARS_PATH);
	}

	// Clean up E2E persist dir
	if (existsSync(PERSIST_DIR)) {
		rmSync(PERSIST_DIR, { recursive: true, force: true });
	}
});

function writeHeaders() {
	return {
		Authorization: `Bearer ${WRITE_KEY}`,
		"Content-Type": "application/json",
	};
}

function readHeaders() {
	return {
		Authorization: `Bearer ${READ_KEY}`,
	};
}

function makeIdentityPayload(hostId: string) {
	return {
		host_id: hostId,
		hostname: `${hostId}.example.com`,
		os: "Ubuntu 24.04 LTS",
		kernel: "6.8.0-45-generic",
		arch: "x86_64",
		cpu_model: "AMD EPYC 7763",
		uptime_seconds: 86400,
		boot_time: Math.floor(Date.now() / 1000) - 86400,
	};
}

function makeMetricsPayload(hostId: string, ts?: number) {
	return {
		host_id: hostId,
		timestamp: ts ?? Math.floor(Date.now() / 1000),
		interval: 30,
		uptime_seconds: 86400,
		cpu: {
			usage_pct: 25.5,
			iowait_pct: 1.2,
			steal_pct: 0.3,
			load1: 0.5,
			load5: 0.8,
			load15: 0.6,
			count: 4,
		},
		mem: {
			total_bytes: 8_000_000_000,
			available_bytes: 4_000_000_000,
			used_pct: 50.0,
		},
		swap: {
			total_bytes: 2_000_000_000,
			used_bytes: 100_000_000,
			used_pct: 5.0,
		},
		disk: [
			{
				mount: "/",
				fs_type: "ext4",
				total_bytes: 100_000_000_000,
				available_bytes: 60_000_000_000,
				used_pct: 40.0,
			},
		],
		net: [
			{
				interface: "eth0",
				rx_bytes: 1_000_000,
				tx_bytes: 500_000,
				rx_errors: 0,
				tx_errors: 0,
			},
		],
	};
}

describe("Worker L3 E2E — real Wrangler", () => {
	test("GET / returns health text", async () => {
		const res = await fetch(`${BASE}/`);
		expect(res.status).toBe(200);
		const text = await res.text();
		expect(text).toBe("bat-worker ok");
	});

	test("POST /api/identity → 204", async () => {
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload("e2e-host-001")),
		});
		expect(res.status).toBe(204);
	});

	test("POST /api/ingest → 204", async () => {
		const res = await fetch(`${BASE}/api/ingest`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeMetricsPayload("e2e-host-001")),
		});
		expect(res.status).toBe(204);
	});

	test("GET /api/hosts → HostOverviewItem[]", async () => {
		const res = await fetch(`${BASE}/api/hosts`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const hosts = (await res.json()) as HostOverviewItem[];
		expect(hosts.length).toBeGreaterThanOrEqual(1);
		const host = hosts.find((h) => h.host_id === "e2e-host-001");
		expect(host).toBeDefined();
		expect(host?.hostname).toBe("e2e-host-001.example.com");
	});

	test("GET /api/hosts/:id/metrics → MetricsQueryResponse", async () => {
		const now = Math.floor(Date.now() / 1000);
		const res = await fetch(
			`${BASE}/api/hosts/e2e-host-001/metrics?from=${now - 3600}&to=${now + 60}`,
			{
				headers: readHeaders(),
			},
		);
		expect(res.status).toBe(200);
		const metrics = (await res.json()) as MetricsQueryResponse;
		expect(metrics.host_id).toBe("e2e-host-001");
		expect(metrics.resolution).toBe("raw");
		expect(metrics.data.length).toBeGreaterThanOrEqual(1);
	});

	test("GET /api/alerts → AlertItem[]", async () => {
		const res = await fetch(`${BASE}/api/alerts`, { headers: readHeaders() });
		expect(res.status).toBe(200);
		const alerts = (await res.json()) as AlertItem[];
		expect(Array.isArray(alerts)).toBe(true);
	});

	test("GET /api/live → 200", async () => {
		const res = await fetch(`${BASE}/api/live`);
		expect(res.status).toBe(200);
	});

	test("auth: missing header → 401", async () => {
		const res = await fetch(`${BASE}/api/hosts`);
		expect(res.status).toBe(401);
	});

	test("auth: wrong key → 403", async () => {
		const res = await fetch(`${BASE}/api/hosts`, {
			headers: { Authorization: "Bearer wrong-key" },
		});
		expect(res.status).toBe(403);
	});

	test("POST /api/identity with inventory fields → merged into hosts table", async () => {
		const payload = {
			...makeIdentityPayload("e2e-host-inv"),
			cpu_logical: 8,
			cpu_physical: 4,
			mem_total_bytes: 8589934592,
			swap_total_bytes: 2147483648,
			virtualization: "kvm",
			boot_mode: "uefi",
			public_ip: "203.0.113.42",
			net_interfaces: [
				{ iface: "eth0", mac: "aa:bb:cc:dd:ee:ff", ipv4: ["10.0.1.5"], ipv6: [], speed_mbps: 1000 },
			],
			disks: [{ device: "sda", size_bytes: 500107862016, rotational: false }],
		};

		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(payload),
		});
		expect(res.status).toBe(204);

		// Verify via hosts list
		const hostsRes = await fetch(`${BASE}/api/hosts`, { headers: readHeaders() });
		const hosts = (await hostsRes.json()) as HostOverviewItem[];
		const host = hosts.find((h) => h.host_id === "e2e-host-inv");
		expect(host).toBeDefined();
		expect(host?.cpu_logical).toBe(8);
		expect(host?.cpu_physical).toBe(4);
		expect(host?.mem_total_bytes).toBe(8589934592);
		expect(host?.virtualization).toBe("kvm");
		expect(host?.public_ip).toBe("203.0.113.42");
	});

	test("GET /api/hosts/:id → HostDetailItem with full inventory", async () => {
		const hid = hashHostId("e2e-host-inv");
		const res = await fetch(`${BASE}/api/hosts/${hid}`, { headers: readHeaders() });
		expect(res.status).toBe(200);

		const detail = (await res.json()) as HostDetailItem;
		expect(detail.host_id).toBe("e2e-host-inv");
		expect(detail.hid).toBe(hid);
		expect(detail.cpu_logical).toBe(8);
		expect(detail.cpu_physical).toBe(4);
		expect(detail.mem_total_bytes).toBe(8589934592);
		expect(detail.swap_total_bytes).toBe(2147483648);
		expect(detail.virtualization).toBe("kvm");
		expect(detail.boot_mode).toBe("uefi");
		expect(detail.public_ip).toBe("203.0.113.42");
		expect(detail.net_interfaces).toHaveLength(1);
		expect(detail.net_interfaces?.[0].iface).toBe("eth0");
		expect(detail.disks).toHaveLength(1);
		expect(detail.disks?.[0].device).toBe("sda");
	});

	test("GET /api/hosts/:id → 404 for unknown host", async () => {
		const res = await fetch(`${BASE}/api/hosts/nonexistent-host-xyz`, { headers: readHeaders() });
		expect(res.status).toBe(404);
	});

	test("POST /api/tier2 with dns/timezone → merged into hosts table", async () => {
		// Ensure host exists first
		const identRes = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(makeIdentityPayload("e2e-host-t2")),
		});
		expect(identRes.status).toBe(204);

		// Send tier2 with timezone + DNS
		const tier2Payload = {
			host_id: "e2e-host-t2",
			timestamp: Math.floor(Date.now() / 1000),
			timezone: "America/New_York",
			dns_resolvers: ["1.1.1.1", "8.8.8.8"],
			dns_search: ["example.com"],
		};

		const t2Res = await fetch(`${BASE}/api/tier2`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(tier2Payload),
		});
		expect(t2Res.status).toBe(204);

		// Verify via detail endpoint
		const hid = hashHostId("e2e-host-t2");
		const detailRes = await fetch(`${BASE}/api/hosts/${hid}`, { headers: readHeaders() });
		expect(detailRes.status).toBe(200);

		const detail = (await detailRes.json()) as HostDetailItem;
		expect(detail.timezone).toBe("America/New_York");
		expect(detail.dns_resolvers).toEqual(["1.1.1.1", "8.8.8.8"]);
		expect(detail.dns_search).toEqual(["example.com"]);
	});
});
