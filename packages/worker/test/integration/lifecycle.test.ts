import type { AlertItem, HostOverviewItem, MetricsQueryResponse } from "@bat/shared";
import { Hono } from "hono";
// Worker integration tests — full request lifecycle through Hono app with mock D1
import { beforeEach, describe, expect, test } from "vitest";
import { apiKeyAuth } from "../../src/middleware/api-key";
import { alertsListRoute } from "../../src/routes/alerts";
import { fleetStatusRoute } from "../../src/routes/fleet-status";
import { hostsListRoute } from "../../src/routes/hosts";
import { identityRoute } from "../../src/routes/identity";
import { ingestRoute } from "../../src/routes/ingest";
import { liveRoute } from "../../src/routes/live";
import { hostMetricsRoute } from "../../src/routes/metrics";
import { createMockD1 } from "../../src/test-helpers/mock-d1";
import type { AppEnv } from "../../src/types";

const WRITE_KEY = "test-write-key";
const READ_KEY = "test-read-key";

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("/api/*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: WRITE_KEY, BAT_READ_KEY: READ_KEY };
		return next();
	});
	app.use("/api/*", apiKeyAuth);
	app.get("/api/live", liveRoute);
	app.post("/api/identity", identityRoute);
	app.post("/api/ingest", ingestRoute);
	app.get("/api/hosts", hostsListRoute);
	app.get("/api/hosts/:id/metrics", hostMetricsRoute);
	app.get("/api/alerts", alertsListRoute);
	app.get("/api/fleet/status", fleetStatusRoute);
	return app;
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

describe("Worker E2E — full lifecycle", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("auth: rejects request without authorization header", async () => {
		const res = await app.request(new Request("http://localhost/api/hosts"));
		expect(res.status).toBe(401);
	});

	test("auth: rejects request with wrong key (invalid key → 403)", async () => {
		const res = await app.request(
			new Request("http://localhost/api/hosts", {
				headers: { Authorization: "Bearer wrong-key" },
			}),
		);
		expect(res.status).toBe(403);
	});

	test("auth: write key rejected on read routes", async () => {
		const res = await app.request(
			new Request("http://localhost/api/hosts", {
				headers: { Authorization: `Bearer ${WRITE_KEY}` },
			}),
		);
		expect(res.status).toBe(403);
	});

	test("auth: read key rejected on write routes", async () => {
		const res = await app.request(
			new Request("http://localhost/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${READ_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(makeMetricsPayload("host-001")),
			}),
		);
		expect(res.status).toBe(403);
	});

	test("identity → ingest → hosts → metrics → alerts flow", async () => {
		// Step 1: Send identity
		const identityRes = await app.request(
			new Request("http://localhost/api/identity", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(makeIdentityPayload("host-001")),
			}),
		);
		expect(identityRes.status).toBe(204);

		// Step 2: Send metrics
		const ingestRes = await app.request(
			new Request("http://localhost/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(makeMetricsPayload("host-001")),
			}),
		);
		expect(ingestRes.status).toBe(204);

		// Step 3: Query hosts list
		const hostsRes = await app.request(
			new Request("http://localhost/api/hosts", {
				headers: { Authorization: `Bearer ${READ_KEY}` },
			}),
		);
		expect(hostsRes.status).toBe(200);
		const hosts = (await hostsRes.json()) as HostOverviewItem[];
		expect(hosts).toHaveLength(1);
		expect(hosts[0].host_id).toBe("host-001");
		expect(hosts[0].hostname).toBe("host-001.example.com");
		expect(hosts[0].os).toBe("Ubuntu 24.04 LTS");
		expect(hosts[0].cpu_model).toBe("AMD EPYC 7763");
		expect(hosts[0].cpu_usage_pct).toBe(25.5);
		expect(hosts[0].mem_used_pct).toBe(50.0);
		expect(hosts[0].status).toBe("healthy");

		// Step 4: Query metrics
		const now = Math.floor(Date.now() / 1000);
		const metricsRes = await app.request(
			new Request(`http://localhost/api/hosts/host-001/metrics?from=${now - 3600}&to=${now + 60}`, {
				headers: { Authorization: `Bearer ${READ_KEY}` },
			}),
		);
		expect(metricsRes.status).toBe(200);
		const metrics = (await metricsRes.json()) as MetricsQueryResponse;
		expect(metrics.host_id).toBe("host-001");
		expect(metrics.resolution).toBe("raw");
		expect(metrics.data.length).toBeGreaterThanOrEqual(1);
		expect(metrics.data[0].cpu_usage_pct).toBe(25.5);

		// Step 5: Query alerts (should be empty — metrics are normal)
		const alertsRes = await app.request(
			new Request("http://localhost/api/alerts", {
				headers: { Authorization: `Bearer ${READ_KEY}` },
			}),
		);
		expect(alertsRes.status).toBe(200);
		const alerts = (await alertsRes.json()) as AlertItem[];
		expect(alerts).toEqual([]);
	});

	test("ingest with no swap and high memory triggers no_swap alert", async () => {
		// Create host first
		await app.request(
			new Request("http://localhost/api/identity", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(makeIdentityPayload("host-alert")),
			}),
		);

		// Ingest with no swap + high memory (triggers no_swap rule)
		const payload = makeMetricsPayload("host-alert");
		payload.mem.used_pct = 80.0;
		payload.mem.available_bytes = 1_600_000_000;
		payload.swap.total_bytes = 0;
		payload.swap.used_bytes = 0;
		payload.swap.used_pct = 0;

		await app.request(
			new Request("http://localhost/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			}),
		);

		// Check alerts
		const alertsRes = await app.request(
			new Request("http://localhost/api/alerts", {
				headers: { Authorization: `Bearer ${READ_KEY}` },
			}),
		);
		const alerts = (await alertsRes.json()) as AlertItem[];
		expect(alerts.length).toBeGreaterThanOrEqual(1);
		const noSwapAlert = alerts.find((a) => a.rule_id === "no_swap");
		expect(noSwapAlert).toBeDefined();
		expect(noSwapAlert?.severity).toBe("critical");
	});

	test("ingest with disk > 90% triggers disk_full alert", async () => {
		await app.request(
			new Request("http://localhost/api/identity", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(makeIdentityPayload("host-disk")),
			}),
		);

		const payload = makeMetricsPayload("host-disk");
		payload.disk = [
			{
				mount: "/",
				fs_type: "ext4",
				total_bytes: 100_000_000_000,
				available_bytes: 5_000_000_000,
				used_pct: 95.0,
			},
		];

		await app.request(
			new Request("http://localhost/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			}),
		);

		const alertsRes = await app.request(
			new Request("http://localhost/api/alerts", {
				headers: { Authorization: `Bearer ${READ_KEY}` },
			}),
		);
		const alerts = (await alertsRes.json()) as AlertItem[];
		const diskAlert = alerts.find((a) => a.rule_id === "disk_full");
		expect(diskAlert).toBeDefined();
		expect(diskAlert?.severity).toBe("critical");
	});

	test("live endpoint always returns 200 with ok status", async () => {
		const res = await app.request(new Request("http://localhost/api/live"));
		expect(res.status).toBe(200);
		const body = (await res.json()) as { status: string; component: string };
		expect(body.status).toBe("ok");
		expect(body.component).toBe("worker");
	});

	test("live endpoint returns 200 even when no hosts exist", async () => {
		const res = await app.request(new Request("http://localhost/api/live"));
		expect(res.status).toBe(200);
	});

	test("duplicate ingest (same host_id + ts) does not create duplicate rows", async () => {
		// Setup host
		await app.request(
			new Request("http://localhost/api/identity", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(makeIdentityPayload("host-dedup")),
			}),
		);

		const payload = makeMetricsPayload("host-dedup");

		// Send twice
		await app.request(
			new Request("http://localhost/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			}),
		);
		await app.request(
			new Request("http://localhost/api/ingest", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${WRITE_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			}),
		);

		// Verify only one row
		const now = Math.floor(Date.now() / 1000);
		const metricsRes = await app.request(
			new Request(
				`http://localhost/api/hosts/host-dedup/metrics?from=${now - 3600}&to=${now + 60}`,
				{
					headers: { Authorization: `Bearer ${READ_KEY}` },
				},
			),
		);
		const metrics = (await metricsRes.json()) as MetricsQueryResponse;
		expect(metrics.data).toHaveLength(1);
	});

	test("multiple hosts appear in hosts list", async () => {
		for (const id of ["host-a", "host-b", "host-c"]) {
			await app.request(
				new Request("http://localhost/api/identity", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${WRITE_KEY}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(makeIdentityPayload(id)),
				}),
			);
			await app.request(
				new Request("http://localhost/api/ingest", {
					method: "POST",
					headers: {
						Authorization: `Bearer ${WRITE_KEY}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(makeMetricsPayload(id)),
				}),
			);
		}

		const hostsRes = await app.request(
			new Request("http://localhost/api/hosts", {
				headers: { Authorization: `Bearer ${READ_KEY}` },
			}),
		);
		const hosts = (await hostsRes.json()) as HostOverviewItem[];
		expect(hosts).toHaveLength(3);
	});
});
