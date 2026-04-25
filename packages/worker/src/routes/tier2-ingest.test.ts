import { beforeEach, describe, expect, test } from "vitest";
import type { Tier2Payload } from "@bat/shared";
import { Hono } from "hono";
import { createMockD1 } from "../test-helpers/mock-d1";
import type { AppEnv } from "../types";
import { tier2IngestRoute } from "./tier2-ingest";

const WRITE_KEY = "test-write-key";

function makePayload(overrides?: Partial<Tier2Payload>): Tier2Payload {
	const now = Math.floor(Date.now() / 1000);
	return {
		host_id: "host-001",
		timestamp: now,
		probe_version: "0.2.1",
		ports: {
			listening: [
				{ port: 22, bind: "0.0.0.0", protocol: "tcp", pid: 100, process: "sshd" },
				{ port: 80, bind: "0.0.0.0", protocol: "tcp", pid: 200, process: "nginx" },
			],
		},
		security: {
			ssh_password_auth: false,
			ssh_root_login: "no",
			ssh_failed_logins_7d: 12,
			firewall_active: true,
			firewall_default_policy: "deny",
			fail2ban_active: true,
			fail2ban_banned_count: 3,
			unattended_upgrades_active: true,
		},
		...overrides,
	};
}

function createApp(db: D1Database) {
	const app = new Hono<AppEnv>();
	app.use("*", async (c, next) => {
		c.env = { DB: db, BAT_WRITE_KEY: WRITE_KEY, BAT_READ_KEY: "rk" };
		return next();
	});
	app.post("/api/tier2", tier2IngestRoute);
	return app;
}

function post(app: Hono<AppEnv>, body: unknown) {
	return app.request(
		new Request("http://localhost/api/tier2", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}),
	);
}

describe("POST /api/tier2", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;

	beforeEach(() => {
		db = createMockD1();
		app = createApp(db);
	});

	test("valid payload → 204, snapshot inserted", async () => {
		const payload = makePayload();
		const res = await post(app, payload);
		expect(res.status).toBe(204);

		// Verify host was created
		const host = await db
			.prepare("SELECT * FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<Record<string, unknown>>();
		expect(host).not.toBeNull();

		// Verify tier2 snapshot was inserted
		const snapshot = await db
			.prepare("SELECT * FROM tier2_snapshots WHERE host_id = ?")
			.bind("host-001")
			.first<Record<string, unknown>>();
		expect(snapshot).not.toBeNull();
		expect(snapshot?.host_id).toBe("host-001");

		// Verify JSON columns
		const portsJson = JSON.parse(snapshot?.ports_json as string);
		expect(portsJson.listening).toBeInstanceOf(Array);
		expect(portsJson.listening.length).toBe(2);
		expect(portsJson.listening[0].port).toBe(22);

		const secJson = JSON.parse(snapshot?.security_json as string);
		expect(secJson.ssh_password_auth).toBe(false);
		expect(secJson.firewall_active).toBe(true);
	});

	test("partial payload (only ports) → 204", async () => {
		const payload = makePayload({
			security: undefined,
		});
		// Only keep ports
		const res = await post(app, payload);
		expect(res.status).toBe(204);

		const snapshot = await db
			.prepare("SELECT ports_json, security_json FROM tier2_snapshots WHERE host_id = ?")
			.bind("host-001")
			.first<{ ports_json: string | null; security_json: string | null }>();
		expect(snapshot).not.toBeNull();
		expect(snapshot?.ports_json).not.toBeNull();
		expect(snapshot?.security_json).toBeNull();
	});

	test("minimal payload (host_id + timestamp only) → 204", async () => {
		const res = await post(app, {
			host_id: "host-002",
			timestamp: Math.floor(Date.now() / 1000),
		});
		expect(res.status).toBe(204);

		const snapshot = await db
			.prepare("SELECT * FROM tier2_snapshots WHERE host_id = ?")
			.bind("host-002")
			.first<Record<string, unknown>>();
		expect(snapshot).not.toBeNull();
		expect(snapshot?.ports_json).toBeNull();
		expect(snapshot?.systemd_json).toBeNull();
		expect(snapshot?.security_json).toBeNull();
		expect(snapshot?.docker_json).toBeNull();
		expect(snapshot?.disk_deep_json).toBeNull();
		expect(snapshot?.software_json).toBeNull();
		expect(snapshot?.websites_json).toBeNull();
	});

	test("invalid payload (missing host_id) → 400", async () => {
		const res = await post(app, { timestamp: 123 });
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Invalid");
	});

	test("invalid payload (missing timestamp) → 400", async () => {
		const res = await post(app, { host_id: "h1" });
		expect(res.status).toBe(400);
	});

	test("invalid JSON body → 400", async () => {
		const res = await app.request(
			new Request("http://localhost/api/tier2", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not json",
			}),
		);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Invalid JSON");
	});

	test("websites data round-trips through JSON", async () => {
		const payload = makePayload({
			websites: {
				sites: [
					{ domain: "example.com", web_server: "nginx", ssl: true },
					{ domain: "blog.example.com", web_server: "apache", ssl: false },
				],
			},
		});
		const res = await post(app, payload);
		expect(res.status).toBe(204);

		const snapshot = await db
			.prepare("SELECT websites_json FROM tier2_snapshots WHERE host_id = ?")
			.bind("host-001")
			.first<{ websites_json: string | null }>();
		expect(snapshot).not.toBeNull();
		expect(snapshot?.websites_json).not.toBeNull();

		const parsed = JSON.parse(snapshot?.websites_json as string);
		expect(parsed.sites).toBeInstanceOf(Array);
		expect(parsed.sites.length).toBe(2);
		expect(parsed.sites[0].domain).toBe("example.com");
		expect(parsed.sites[0].web_server).toBe("nginx");
		expect(parsed.sites[0].ssl).toBe(true);
		expect(parsed.sites[1].domain).toBe("blog.example.com");
		expect(parsed.sites[1].ssl).toBe(false);
	});

	test("websites null when absent from payload", async () => {
		const payload = makePayload();
		const res = await post(app, payload);
		expect(res.status).toBe(204);

		const snapshot = await db
			.prepare("SELECT websites_json FROM tier2_snapshots WHERE host_id = ?")
			.bind("host-001")
			.first<{ websites_json: string | null }>();
		expect(snapshot).not.toBeNull();
		expect(snapshot?.websites_json).toBeNull();
	});

	test("clock skew → 400", async () => {
		const payload = makePayload({
			timestamp: Math.floor(Date.now() / 1000) - 600, // 10 min off
		});
		const res = await post(app, payload);
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Clock skew");
	});

	test("retired host → 403", async () => {
		const now = Math.floor(Date.now() / 1000);
		await db
			.prepare("INSERT INTO hosts (host_id, hostname, last_seen, is_active) VALUES (?, ?, ?, 0)")
			.bind("host-001", "old-host", now)
			.run();

		const res = await post(app, makePayload());
		expect(res.status).toBe(403);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("host is retired");
	});

	test("duplicate payload is idempotent", async () => {
		const now = Math.floor(Date.now() / 1000);
		const payload = makePayload({ timestamp: now });

		// First ingest
		await post(app, payload);

		const hostAfterFirst = await db
			.prepare("SELECT last_seen FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<{ last_seen: number }>();

		// Second ingest — same timestamp
		await post(app, payload);

		const hostAfterSecond = await db
			.prepare("SELECT last_seen FROM hosts WHERE host_id = ?")
			.bind("host-001")
			.first<{ last_seen: number }>();

		// last_seen should not have changed
		expect(hostAfterSecond?.last_seen).toBe(hostAfterFirst?.last_seen);

		// Only one snapshot row
		const count = await db
			.prepare("SELECT COUNT(*) as cnt FROM tier2_snapshots WHERE host_id = ?")
			.bind("host-001")
			.first<{ cnt: number }>();
		expect(count?.cnt).toBe(1);
	});

	test("full payload with all sections → 204", async () => {
		const now = Math.floor(Date.now() / 1000);
		const payload: Tier2Payload = {
			host_id: "host-full",
			timestamp: now,
			ports: { listening: [{ port: 443, bind: "::", protocol: "tcp6", pid: null, process: null }] },
			systemd: {
				failed_count: 1,
				failed: [
					{
						unit: "nginx.service",
						load_state: "loaded",
						active_state: "failed",
						sub_state: "failed",
						description: "The nginx HTTP server",
					},
				],
			},
			security: {
				ssh_password_auth: true,
				ssh_root_login: "yes",
				ssh_failed_logins_7d: 100,
				firewall_active: false,
				firewall_default_policy: null,
				fail2ban_active: false,
				fail2ban_banned_count: null,
				unattended_upgrades_active: false,
			},
			docker: {
				installed: true,
				version: "24.0.7",
				containers: [
					{
						id: "abc123",
						name: "web",
						image: "nginx:latest",
						status: "Up 3 hours",
						state: "running",
						cpu_pct: 0.5,
						mem_bytes: 50_000_000,
						restart_count: 0,
						started_at: now - 10800,
					},
				],
				images: { total_count: 5, total_bytes: 2_000_000_000, reclaimable_bytes: 500_000_000 },
			},
			disk_deep: {
				top_dirs: [
					{ path: "/var", size_bytes: 10_000_000_000 },
					{ path: "/usr", size_bytes: 5_000_000_000 },
				],
				journal_bytes: 256_000_000,
				large_files: [{ path: "/var/log/syslog.1", size_bytes: 500_000_000 }],
			},
		};

		const res = await post(app, payload);
		expect(res.status).toBe(204);

		const snapshot = await db
			.prepare("SELECT * FROM tier2_snapshots WHERE host_id = ?")
			.bind("host-full")
			.first<Record<string, unknown>>();
		expect(snapshot).not.toBeNull();

		// All JSON columns should be populated
		expect(snapshot?.ports_json).not.toBeNull();
		expect(snapshot?.systemd_json).not.toBeNull();
		expect(snapshot?.security_json).not.toBeNull();
		expect(snapshot?.docker_json).not.toBeNull();
		expect(snapshot?.disk_deep_json).not.toBeNull();

		// Verify parsed content
		const docker = JSON.parse(snapshot?.docker_json as string);
		expect(docker.installed).toBe(true);
		expect(docker.version).toBe("24.0.7");
		expect(docker.containers.length).toBe(1);
		expect(docker.containers[0].name).toBe("web");
	});

	test("timezone and dns merged into hosts table", async () => {
		const now = Math.floor(Date.now() / 1000);
		const payload = {
			host_id: "host-dns",
			timestamp: now,
			timezone: "America/New_York",
			dns_resolvers: ["1.1.1.1", "8.8.8.8"],
			dns_search: ["example.com"],
		};

		const res = await post(app, payload);
		expect(res.status).toBe(204);

		const host = await db
			.prepare("SELECT timezone, dns_resolvers, dns_search FROM hosts WHERE host_id = ?")
			.bind("host-dns")
			.first<Record<string, unknown>>();

		expect(host?.timezone).toBe("America/New_York");
		expect(JSON.parse(host?.dns_resolvers as string)).toEqual(["1.1.1.1", "8.8.8.8"]);
		expect(JSON.parse(host?.dns_search as string)).toEqual(["example.com"]);
	});

	test("dns fields not touched when absent from payload", async () => {
		const now = Math.floor(Date.now() / 1000);

		// First: send with timezone
		await post(app, {
			host_id: "host-retain",
			timestamp: now,
			timezone: "UTC",
		});

		// Second: send without timezone (different timestamp to avoid dedup)
		await post(app, {
			host_id: "host-retain",
			timestamp: now + 1,
		});

		const host = await db
			.prepare("SELECT timezone FROM hosts WHERE host_id = ?")
			.bind("host-retain")
			.first<Record<string, unknown>>();

		// Should retain timezone from first send
		expect(host?.timezone).toBe("UTC");
	});
});
