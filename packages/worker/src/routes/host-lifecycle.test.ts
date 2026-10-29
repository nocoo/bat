import { hashHostId } from "@bat/shared";
import { Hono } from "hono";
import { beforeEach, describe, expect, test } from "vitest";
import { createD1Repositories } from "../adapters/d1/factory.js";
import { createMockD1 } from "../test-helpers/mock-d1.js";
import type { AppEnv } from "../types.js";
import { hostDeleteRoute, hostRegisterRoute } from "./host-lifecycle.js";
import { identityRoute } from "./identity.js";
import { ingestRoute } from "./ingest.js";
import { tier2IngestRoute } from "./tier2-ingest.js";

const HOST = "delete-test-host";
const ORIGIN = "http://localhost";

describe("host deletion and deliberate re-registration", () => {
	let db: D1Database;
	let app: Hono<AppEnv>;
	beforeEach(async () => {
		db = createMockD1();
		await db
			.prepare("INSERT INTO hosts(host_id, hostname, last_seen) VALUES (?, ?, ?)")
			.bind(HOST, "Delete me", Math.floor(Date.now() / 1000))
			.run();
		app = new Hono<AppEnv>();
		app.use("*", async (context, next) => {
			context.env = { DB: db, BAT_WRITE_KEY: "write", BAT_READ_KEY: "read" };
			context.set("repos", createD1Repositories(db));
			context.set("accessAuthenticated", context.req.header("Test-Access") !== "no");
			await next();
		});
		app.delete("/api/hosts/:id", hostDeleteRoute);
		app.post("/api/hosts/:id/register", hostRegisterRoute);
		app.post("/api/identity", identityRoute);
		app.post("/api/ingest", ingestRoute);
		app.post("/api/tier2", tier2IngestRoute);
	});

	function request(
		path: string,
		method: string,
		body: unknown = { confirm_host_id: HOST },
		headers: Record<string, string> = {},
	) {
		return app.request(`${ORIGIN}${path}`, {
			method,
			headers: {
				Origin: ORIGIN,
				"X-Bat-Management": "1",
				"Content-Type": "application/json",
				...headers,
			},
			body: typeof body === "string" ? body : JSON.stringify(body),
		});
	}

	test.each([
		{ "Test-Access": "no" },
		{ Origin: "https://evil.example" },
		{ "X-Bat-Management": "0" },
	])("requires verified browser access and same-origin confirmation: %s", async (headers) => {
		for (const [path, method] of [
			[`/api/hosts/${HOST}`, "DELETE"],
			[`/api/hosts/${HOST}/register`, "POST"],
		]) {
			expect((await request(path as string, method as string, undefined, headers)).status).toBe(
				403,
			);
		}
		expect(await createD1Repositories(db).hosts.isDeleted(HOST)).toBe(false);
	});

	test.each([{}, null, { confirm_host_id: "wrong" }, { confirm_host_id: ` ${HOST}` }, "{"])(
		"requires the exact ID, including valid JSON: %s",
		async (body) => {
			expect((await request(`/api/hosts/${HOST}`, "DELETE", body)).status).toBe(400);
			expect((await request(`/api/hosts/${HOST}/register`, "POST", body)).status).toBe(400);
			expect(await createD1Repositories(db).hosts.getActiveFlag(HOST)).not.toBeNull();
		},
	);

	test("404 for unknown hosts and absent tombstones", async () => {
		expect((await request("/api/hosts/missing", "DELETE")).status).toBe(404);
		expect((await request(`/api/hosts/${HOST}/register`, "POST")).status).toBe(404);
	});

	test("deletes through opaque HID, removes relationships and preserves other hosts and shared keys/tags", async () => {
		await db.exec(`
			INSERT INTO hosts(host_id, hostname, last_seen) VALUES ('other-host', 'Keep me', 1);
			INSERT INTO metrics_raw(host_id, ts) VALUES ('${HOST}', 1);
			INSERT INTO metrics_hourly(host_id, hour_ts, sample_count) VALUES ('${HOST}', 1, 1);
			INSERT INTO tier2_snapshots(host_id, ts) VALUES ('${HOST}', 1);
			INSERT INTO alert_states(host_id, rule_id, severity, triggered_at) VALUES ('${HOST}', 'cpu_high', 'warning', 1);
			INSERT INTO port_allowlist(host_id, port) VALUES ('${HOST}', 22);
			INSERT INTO webhook_configs(id, host_id, token) VALUES (1, '${HOST}', 'secret');
			INSERT INTO events(host_id, webhook_config_id, title, body, source_ip) VALUES ('${HOST}', 1, 'event', 'body', '127.0.0.1');
			INSERT INTO agents(id, host_id, source_key, match_key) VALUES ('agent', '${HOST}', 'source', 'match');
			INSERT INTO assets(id, host_id, type, name) VALUES ('asset', '${HOST}', 'cli_tool', 'tool'), ('other-asset', 'other-host', 'cli_tool', 'other');
			INSERT INTO agent_asset_bindings(agent_id, asset_id) VALUES ('agent', 'asset'), ('agent', 'other-asset');
			INSERT INTO tags(id, name, owner_host_id) VALUES (1, 'private', '${HOST}'), (2, 'shared', '${HOST}'), (3, 'global', NULL);
			INSERT INTO host_tags(host_id, tag_id) VALUES ('${HOST}', 1), ('${HOST}', 2), ('${HOST}', 3), ('other-host', 2);
			INSERT INTO agent_tags(agent_id, tag_id) VALUES ('agent', 1);
			INSERT INTO asset_tags(asset_id, tag_id) VALUES ('asset', 1);
			INSERT INTO connect_tokens(id, name, scope, prefix, token_hash, ciphertext, owner, created_at) VALUES ('key', 'shared key', 'write', 'bat', 'hash', 'encrypted', 'owner', 1);
			INSERT INTO connect_token_servers(token_id, server_id) VALUES ('key', '${HOST}'), ('key', 'other-host');
			INSERT INTO connect_server_grants(server_id, principal) VALUES ('${HOST}', 'owner');
			INSERT INTO connect_requests(token_id, server_id, key_hash, fingerprint, request_id, state, created_at) VALUES ('key', '${HOST}', 'hash', 'fp', 'req', 'complete', 1);
			INSERT INTO connect_audit(id, request_id, server_id, actor, operation, status, created_at) VALUES ('audit', 'req', '${HOST}', 'owner', 'get', 200, 1);
		`);
		const result = await request(`/api/hosts/${hashHostId(HOST)}`, "DELETE");
		expect(result.status).toBe(200);
		expect(await result.json()).toEqual({ ok: true });
		for (const table of [
			"hosts",
			"metrics_raw",
			"metrics_hourly",
			"tier2_snapshots",
			"alert_states",
			"port_allowlist",
			"host_tags",
			"events",
			"webhook_configs",
			"agents",
			"assets",
		]) {
			expect(
				await db.prepare(`SELECT 1 FROM ${table} WHERE host_id = ?`).bind(HOST).first(),
				table,
			).toBeNull();
		}
		for (const table of [
			"agent_tags",
			"asset_tags",
			"agent_asset_bindings",
			"connect_requests",
			"connect_server_grants",
		]) {
			expect(await db.prepare(`SELECT 1 FROM ${table}`).first(), table).toBeNull();
		}
		expect(await db.prepare("SELECT host_id FROM hosts").first("host_id")).toBe("other-host");
		expect(
			(await db.prepare("SELECT id, owner_host_id FROM tags ORDER BY id").all()).results,
		).toEqual([
			{ id: 2, owner_host_id: null },
			{ id: 3, owner_host_id: null },
		]);
		expect((await db.prepare("SELECT server_id FROM connect_token_servers").all()).results).toEqual(
			[{ server_id: "other-host" }],
		);
		expect(await db.prepare("SELECT version FROM connect_tokens").first("version")).toBe(2);
		expect(await db.prepare("SELECT 1 FROM connect_audit").first()).not.toBeNull();
		expect(await db.prepare("PRAGMA foreign_key_check").all()).toMatchObject({ results: [] });
	});

	test("database abort rolls back the complete deletion", async () => {
		await db.exec(
			"CREATE TRIGGER fail_delete BEFORE DELETE ON hosts BEGIN SELECT RAISE(ABORT, 'test rollback'); END;",
		);
		await expect(createD1Repositories(db).hosts.deleteHost(HOST, 1)).rejects.toThrow(
			"test rollback",
		);
		expect(await createD1Repositories(db).hosts.isDeleted(HOST)).toBe(false);
		expect(await createD1Repositories(db).hosts.getActiveFlag(HOST)).not.toBeNull();
	});

	test("all ingest paths reject deletion and database triggers close stale-read races", async () => {
		expect((await request(`/api/hosts/${HOST}`, "DELETE")).status).toBe(200);
		const now = Math.floor(Date.now() / 1000);
		const identity = {
			host_id: HOST,
			hostname: HOST,
			os: "Linux",
			kernel: "6",
			arch: "x86_64",
			cpu_model: "cpu",
			uptime_seconds: 1,
			boot_time: 1,
		};
		const metrics = {
			host_id: HOST,
			timestamp: now,
			interval: 30,
			uptime_seconds: 1,
			cpu: { load1: 0, load5: 0, load15: 0, usage_pct: 0, iowait_pct: 0, steal_pct: 0, count: 1 },
			mem: { total_bytes: 1, available_bytes: 1, used_pct: 0 },
			swap: { total_bytes: 0, used_bytes: 0, used_pct: 0 },
			disk: [],
			net: [],
		};
		for (const [path, body] of [
			["/api/identity", identity],
			["/api/tier2", { host_id: HOST, timestamp: now }],
			["/api/ingest", metrics],
		] as const) {
			expect((await request(path, "POST", body)).status).toBe(403);
		}
		for (const sql of [
			"INSERT INTO hosts(host_id, hostname, last_seen) VALUES (?, 'race', 1)",
			"INSERT INTO metrics_raw(host_id, ts) VALUES (?, 1)",
			"INSERT INTO tier2_snapshots(host_id, ts) VALUES (?, 1)",
			"INSERT INTO alert_states(host_id, rule_id, severity, triggered_at) VALUES (?, 'cpu_high', 'warning', 1)",
		])
			await expect(db.prepare(sql).bind(HOST).run()).rejects.toThrow("host_deleted");
		expect((await request(`/api/hosts/${HOST}/register`, "POST")).status).toBe(200);
		expect(await createD1Repositories(db).hosts.getActiveFlag(HOST)).toBeNull();
		expect((await request("/api/identity", "POST", identity)).status).toBe(204);
		expect(await createD1Repositories(db).hosts.isDeleted(HOST)).toBe(false);
		expect(
			await db
				.prepare("SELECT 1 FROM connect_token_servers WHERE server_id = ?")
				.bind(HOST)
				.first(),
		).toBeNull();
	});
});
