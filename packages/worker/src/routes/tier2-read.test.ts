import { beforeEach, describe, expect, test } from "bun:test";
import { hashHostId } from "@bat/shared";
import type { Tier2Snapshot } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { hostTier2Route } from "./tier2-read";

const READ_KEY = "test-read-key";

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: "wk", BAT_READ_KEY: READ_KEY };
		return next();
	});
	app.get("/api/hosts/:id/tier2", hostTier2Route);
	return app;
}

function get(app: Hono<AppEnv>, hostId: string) {
	return app.request(new Request(`http://localhost/api/hosts/${hostId}/tier2`));
}

async function seedHost(db: D1Database, hostId: string): Promise<void> {
	const now = Math.floor(Date.now() / 1000);
	await db
		.prepare("INSERT INTO hosts (host_id, hostname, last_seen) VALUES (?, ?, ?)")
		.bind(hostId, hostId, now)
		.run();
}

async function seedTier2(
	db: D1Database,
	hostId: string,
	ts: number,
	data?: Partial<{
		ports: string;
		systemd: string;
		security: string;
		docker: string;
		disk_deep: string;
	}>,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO tier2_snapshots
  (host_id, ts, ports_json, systemd_json, security_json, docker_json, disk_deep_json)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			hostId,
			ts,
			data?.ports ?? null,
			data?.systemd ?? null,
			data?.security ?? null,
			data?.docker ?? null,
			data?.disk_deep ?? null,
		)
		.run();
}

describe("GET /api/hosts/:id/tier2", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("returns latest snapshot with parsed JSON", async () => {
		await seedHost(db, "host-001");
		const now = Math.floor(Date.now() / 1000);

		// Insert older snapshot
		await seedTier2(db, "host-001", now - 3600, {
			ports: JSON.stringify({
				listening: [{ port: 22, bind: "0.0.0.0", protocol: "tcp", pid: null, process: null }],
			}),
		});

		// Insert newer snapshot
		await seedTier2(db, "host-001", now, {
			ports: JSON.stringify({
				listening: [{ port: 80, bind: "0.0.0.0", protocol: "tcp", pid: 200, process: "nginx" }],
			}),
			security: JSON.stringify({ ssh_password_auth: false, firewall_active: true }),
		});

		const res = await get(app, "host-001");
		expect(res.status).toBe(200);

		const body = (await res.json()) as Tier2Snapshot;
		expect(body.host_id).toBe("host-001");
		expect(body.ts).toBe(now);
		expect(body.ports?.listening.length).toBe(1);
		expect(body.ports?.listening[0].port).toBe(80);
		expect(body.security?.ssh_password_auth).toBe(false);
	});

	test("unknown host → 404", async () => {
		const res = await get(app, "nonexistent");
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("No tier2 data");
	});

	test("host with no tier2 data → 404", async () => {
		await seedHost(db, "host-empty");
		const res = await get(app, "host-empty");
		expect(res.status).toBe(404);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("No tier2 data");
	});

	test("resolves hid (8-char hex) to host_id", async () => {
		await seedHost(db, "my-server.example.com");
		const now = Math.floor(Date.now() / 1000);
		await seedTier2(db, "my-server.example.com", now, {
			ports: JSON.stringify({ listening: [] }),
		});

		const hid = hashHostId("my-server.example.com");
		const res = await get(app, hid);
		expect(res.status).toBe(200);

		const body = (await res.json()) as Tier2Snapshot;
		expect(body.host_id).toBe("my-server.example.com");
	});

	test("null JSON columns return null in response", async () => {
		await seedHost(db, "host-nulls");
		const now = Math.floor(Date.now() / 1000);
		await seedTier2(db, "host-nulls", now);

		const res = await get(app, "host-nulls");
		expect(res.status).toBe(200);

		const body = (await res.json()) as Tier2Snapshot;
		expect(body.ports).toBeNull();
		expect(body.systemd).toBeNull();
		expect(body.security).toBeNull();
		expect(body.docker).toBeNull();
		expect(body.disk_deep).toBeNull();
		expect(body.software).toBeNull();
		expect(body.timezone).toBeNull();
		expect(body.dns_resolvers).toBeNull();
		expect(body.dns_search).toBeNull();
	});

	test("returns inventory fields from hosts table", async () => {
		const hostId = "host-inventory";
		const now = Math.floor(Date.now() / 1000);
		await seedHost(db, hostId);

		// Set inventory fields on hosts table
		await db
			.prepare("UPDATE hosts SET timezone = ?, dns_resolvers = ?, dns_search = ? WHERE host_id = ?")
			.bind(
				"Europe/Berlin",
				JSON.stringify(["1.1.1.1", "8.8.8.8"]),
				JSON.stringify(["local.lan"]),
				hostId,
			)
			.run();

		await seedTier2(db, hostId, now);

		const res = await get(app, hostId);
		expect(res.status).toBe(200);

		const body = (await res.json()) as Tier2Snapshot;
		expect(body.timezone).toBe("Europe/Berlin");
		expect(body.dns_resolvers).toEqual(["1.1.1.1", "8.8.8.8"]);
		expect(body.dns_search).toEqual(["local.lan"]);
	});
});
