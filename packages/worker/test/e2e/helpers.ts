// Shared helpers for L2 per-route test files. globalSetup (test/e2e/global-setup.ts)
// boots wrangler dev once and exposes BASE / keys via env vars before test files
// are evaluated, so plain top-level `process.env.*` reads work here.

const requireEnv = (key: string): string => {
	const v = process.env[key];
	if (!v) {
		throw new Error(`${key} not set — globalSetup did not run?`);
	}
	return v;
};

export const BASE = requireEnv("BAT_E2E_BASE");
export const WRITE_KEY = requireEnv("BAT_E2E_WRITE_KEY");
export const READ_KEY = requireEnv("BAT_E2E_READ_KEY");

export function writeHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${WRITE_KEY}`,
		"Content-Type": "application/json",
	};
}

export function readHeaders(): Record<string, string> {
	return {
		Authorization: `Bearer ${READ_KEY}`,
	};
}

/** Throwing helper for use inside beforeAll/beforeEach hooks where biome
 *  forbids `expect()` (rule: lint/suspicious/noMisplacedAssertion). */
export function assertStatus(actual: number, expected: number, msg: string): void {
	if (actual !== expected) {
		throw new Error(`${msg}: expected ${expected}, got ${actual}`);
	}
}

export function makeIdentityPayload(hostId: string) {
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

export function makeMetricsPayload(hostId: string, ts?: number) {
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
