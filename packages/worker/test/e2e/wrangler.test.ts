// Worker L3 E2E tests — real HTTP requests against local Wrangler dev server
// Per docs/07-testing.md § L3: self-bootstrapping Wrangler on port 18787
//
// Prerequisites:
//   - wrangler installed (devDependency)
//   - Local D1 database (wrangler auto-creates on first run)
//
// Run: pnpm --filter @bat/worker test:e2e
//
// The test suite:
//   1. Starts wrangler dev on port 18787 (local D1, ephemeral)
//   2. Applies migrations
//   3. Runs test cases against http://localhost:18787
//   4. Tears down the server on exit

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AlertItem, HostOverviewItem, MetricsQueryResponse } from "@bat/shared";

const PORT = 18787;
const BASE = `http://localhost:${PORT}`;
const WRITE_KEY = process.env.BAT_WRITE_KEY ?? "e2e-write-key";
const READ_KEY = process.env.BAT_READ_KEY ?? "e2e-read-key";

let wranglerProc: ReturnType<typeof Bun.spawn> | null = null;

async function waitForServer(url: string, timeoutMs = 15_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (res.ok || res.status === 401 || res.status === 503) return;
		} catch {
			// Server not ready yet
		}
		await Bun.sleep(200);
	}
	throw new Error(`Wrangler did not start within ${timeoutMs}ms`);
}

beforeAll(async () => {
	// Start wrangler dev on the E2E port with local D1 and test secrets
	wranglerProc = Bun.spawn(
		["npx", "wrangler", "dev", "--port", String(PORT), "--local", "--persist-to", ".wrangler/e2e"],
		{
			cwd: import.meta.dir.replace("/test/e2e", ""),
			env: {
				...process.env,
				BAT_WRITE_KEY: WRITE_KEY,
				BAT_READ_KEY: READ_KEY,
			},
			stdout: "ignore",
			stderr: "ignore",
		},
	);

	await waitForServer(`${BASE}/`);

	// Apply migrations via the running server's local D1
	// The migration is applied automatically by wrangler if d1_databases is configured
});

afterAll(() => {
	if (wranglerProc) {
		wranglerProc.kill();
		wranglerProc = null;
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

	test("GET /api/health → 200", async () => {
		const res = await fetch(`${BASE}/api/health`);
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
});
