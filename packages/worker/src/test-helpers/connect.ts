import type { ConnectScope, ConnectToken } from "@bat/shared";
import { randomSecret } from "../domain/connect.js";
import { CONNECT_OPERATIONS } from "../domain/connect-operations.js";
import { app } from "../index.js";
import type { Bindings } from "../types.js";
import { fixtureIdentity } from "./identity";
import { createMockD1 } from "./mock-d1.js";

export const SERVER_A = "connect-server-a";
export const SERVER_B = "connect-server-b";
export const WORKSTATION_A = "11111111-1111-4111-8111-111111111111";
export const WORKSTATION_B = "22222222-2222-4222-8222-222222222222";
const WORKSTATION_OWNER = "email:operator@example.test";

function workstationPayload(reportId: string, uptime = 86_400) {
	const now = Math.floor(Date.now() / 1000);
	return {
		report_id: reportId,
		started_at: now - 10,
		finished_at: now,
		sample_window_ms: 10_000,
		cli_version: "2.5.0",
		hostname: "fixture-workstation",
		os: "macOS 15.2",
		arch: "arm64",
		uptime_seconds: uptime,
		cpu: { model: "Apple M3 Pro", count: 12, usage_pct: 12.5 },
		mem: { total_bytes: 36_000_000_000, available_bytes: 12_000_000_000, used_pct: 66.7 },
		disk: [
			{
				mount: "/",
				total_bytes: 994_662_584_320,
				available_bytes: 397_284_917_248,
				used_pct: 60.1,
			},
		],
		network: {
			interfaces: [
				{ name: "en0", addresses: [{ address: "192.168.1.20", family: 4, internal: false }] },
			],
		},
		connectivity: [
			{
				server_id: SERVER_A,
				address: "8.8.8.8",
				family: 4,
				sent: 3,
				received: 3,
				rtts_ms: [8, 9, 10],
				status: "reachable",
			},
			{
				server_id: SERVER_B,
				address: "8.8.4.4",
				family: 4,
				sent: 3,
				received: 0,
				rtts_ms: [null, null, null],
				status: "timeout",
			},
		],
		collection_errors: ["ping 8.8.4.4 failed", `target ${SERVER_B} unreachable`],
		targets_error: `target ${SERVER_B} unreachable`,
	};
}

function insertWorkstation(
	db: D1Database,
	id: string,
	installation: string,
	name: string,
	tokenHash: string,
): D1PreparedStatement {
	return db
		.prepare(
			"INSERT INTO workstations(id, owner, installation_id, name, created_at, disabled, token_hash, token_prefix) VALUES (?,?,?,?,unixepoch(),0,?,?)",
		)
		.bind(id, WORKSTATION_OWNER, installation, name, tokenHash, `${tokenHash.slice(0, 8)}…`);
}

export async function connectFixture() {
	const identity = await fixtureIdentity();
	const db = createMockD1();
	const env: Bindings = {
		DB: db,
		...identity.env,
		BAT_READ_KEY: "legacy-read",
		BAT_WRITE_KEY: "legacy-write",
		ENVIRONMENT: "development",
		CONNECT_DEPLOYMENT_ID: "bat-test",
		CONNECT_TOKEN_KEYS: JSON.stringify({ active: "k1", keys: { k1: randomSecret() } }),
	};
	await db
		.prepare(
			"INSERT INTO hosts(host_id, hostname, last_seen) VALUES (?,?,unixepoch()),(?,?,unixepoch())",
		)
		.bind(SERVER_A, "Alpha", SERVER_B, "Beta")
		.run();
	await db
		.prepare("INSERT INTO tier2_snapshots(host_id, ts) VALUES (?,unixepoch())")
		.bind(SERVER_A)
		.run();
	await db
		.prepare(
			"INSERT INTO agents(id,host_id,source_key,match_key,nickname) VALUES ('agt_a',?,'source-a','agent-a','Local agent'),('agt_b',?,'source-b','agent-b','Foreign agent')",
		)
		.bind(SERVER_A, SERVER_B)
		.run();
	await db
		.prepare(
			"INSERT INTO assets(id,host_id,type,name) VALUES ('ast_a',?,'cloud_service','Local asset'),('ast_b',?,'domain','Foreign asset')",
		)
		.bind(SERVER_A, SERVER_B)
		.run();
	await db
		.prepare(
			"INSERT INTO tags(id,name,color,owner_host_id) VALUES (1,'Shared',0,NULL),(2,'Local',1,?),(3,'Foreign',2,?)",
		)
		.bind(SERVER_A, SERVER_B)
		.run();
	await db
		.prepare("INSERT INTO host_tags(host_id,tag_id) VALUES (?,1),(?,3)")
		.bind(SERVER_A, SERVER_B)
		.run();
	await db
		.prepare("INSERT INTO webhook_configs(id,host_id,token) VALUES (2,?,'fixture-webhook')")
		.bind(SERVER_B)
		.run();
	await db
		.prepare(
			"INSERT INTO agent_asset_bindings(agent_id,asset_id) VALUES ('agt_a','ast_a'),('agt_b','ast_b')",
		)
		.run();
	// Workstation fixtures use fixed UUIDs so types stay strict in tests.
	await db.batch([
		insertWorkstation(
			db,
			WORKSTATION_A,
			"11111111-1111-4111-8111-11111111111a",
			"Fixture laptop",
			"fixture-ws-a",
		),
		insertWorkstation(
			db,
			WORKSTATION_B,
			"22222222-2222-4222-8222-22222222222b",
			"Foreign laptop",
			"fixture-ws-b",
		),
	]);
	const fixtureReportId = "33333333-3333-4333-8333-333333333333";
	const fixtureNow = Math.floor(Date.now() / 1000);
	await db
		.prepare(
			"INSERT INTO workstation_reports(report_id, workstation_id, body_hash, received_at, started_at, finished_at, cpu_usage_pct, mem_used_pct, mem_total_bytes, mem_available_bytes, uptime_seconds, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
		)
		.bind(
			fixtureReportId,
			WORKSTATION_A,
			"fixture-body",
			fixtureNow,
			fixtureNow - 10,
			fixtureNow,
			12.5,
			66.7,
			36_000_000_000,
			12_000_000_000,
			86_400,
			JSON.stringify(workstationPayload(fixtureReportId)),
		)
		.run();
	await db
		.prepare(
			"INSERT INTO workstation_connectivity(report_id, workstation_id, received_at, server_id, address, family, sent, received, rtts, status) VALUES (?,?,?,?,?,?,?,?,?,?),(?,?,?,?,?,?,?,?,?,?)",
		)
		.bind(
			fixtureReportId,
			WORKSTATION_A,
			fixtureNow,
			SERVER_A,
			"8.8.8.8",
			4,
			3,
			3,
			"[8,9,10]",
			"reachable",
			fixtureReportId,
			WORKSTATION_A,
			fixtureNow,
			SERVER_B,
			"8.8.4.4",
			4,
			3,
			0,
			"[null,null,null]",
			"timeout",
		)
		.run();

	const management = (
		path: string,
		method = "GET",
		body?: unknown,
		token?: ConnectToken,
		overrides: Record<string, string> = {},
	) =>
		app.request(
			`http://localhost${path}`,
			{
				method,
				headers: {
					Host: "localhost",
					Origin: "http://localhost",
					"X-Bat-Management": "1",
					"Cf-Access-Jwt-Assertion": identity.jwt,
					"Content-Type": "application/json",
					...(token ? { "If-Match": `"${token.id}:${token.version}"` } : {}),
					...overrides,
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			},
			env,
		);
	async function mint(
		scope: ConnectScope = "write",
		serverId: string | string[] = SERVER_A,
		expiresAt: string | null = null,
		workstationIds: string[] = [],
	) {
		const path = "/api/connect/tokens";
		const serverIds = typeof serverId === "string" ? [serverId] : serverId;
		const created = await management(path, "POST", {
			name: `Fixture ${scope}`,
			scope,
			expiresAt,
			serverIds,
			workstationIds,
		});
		if (created.status !== 201)
			throw new Error(
				`Token creation failed (${created.status}): ${((await created.json()) as { error?: { code?: string } }).error?.code}`,
			);
		const token = ((await created.json()) as { data: ConnectToken }).data;
		const secret = await reveal(token);
		return { token, secret };
	}
	async function reveal(token: ConnectToken) {
		const path = `/api/connect/tokens/${token.id}`;
		const response = await management(`${path}/challenge`, "POST", { action: "reveal" }, token);
		const challenge = ((await response.json()) as { challenge: string }).challenge;
		const revealed = await management(
			`${path}/reveal`,
			"POST",
			{ challenge, confirmation: token.name },
			token,
		);
		if (revealed.status !== 200) throw new Error(`Reveal failed (${revealed.status})`);
		return ((await revealed.json()) as { token: string }).token;
	}
	const request = (
		path: string,
		secret: string,
		method = "GET",
		body?: unknown,
		headers: Record<string, string> = {},
	) =>
		app.request(
			`http://localhost${path}`,
			{
				method,
				headers: {
					Host: "localhost",
					Authorization: `Bearer ${secret}`,
					"Content-Type": "application/json",
					...headers,
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			},
			env,
		);
	async function call(
		id: string,
		secret: string,
		body?: unknown,
		params: Record<string, string> = {},
		headers: Record<string, string> = {},
	) {
		const operation = CONNECT_OPERATIONS.find((op) => op.id === id);
		if (!operation) throw new Error(`Unknown operation ${id}`);
		const selectedServer = params.serverId ?? SERVER_A;
		const values = {
			serverId: selectedServer,
			workstationId: params.workstationId ?? WORKSTATION_A,
			id: id.startsWith("agents.")
				? "agt_a"
				: id.startsWith("assets.")
					? "ast_a"
					: id.startsWith("webhooks.")
						? "1"
						: "2",
			tagId: "1",
			port: "443",
			agentId: "agt_a",
			assetId: "ast_a",
			key: "missing-request-key",
			...params,
		};
		let path = operation.path.replace(/:([A-Za-z]+)/g, (_, key: keyof typeof values) =>
			encodeURIComponent(values[key]),
		);
		if (id === "metrics.list")
			path += `?from=${Math.floor(Date.now() / 1000) - 3600}&to=${Math.floor(Date.now() / 1000)}`;
		if (id === "workstation.metrics" || id === "workstation.connectivity")
			path += `?from=${Math.floor(Date.now() / 1000) - 3600}&to=${Math.floor(Date.now() / 1000)}&limit=10`;
		let etag = "";
		if (operation.method !== "GET")
			etag =
				(
					await request(`/api/v1/servers/${encodeURIComponent(selectedServer)}`, secret)
				).headers.get("ETag") ?? "";
		return request(path, secret, operation.method, body, {
			"If-Match": etag,
			"Idempotency-Key": crypto.randomUUID(),
			"X-Bat-Confirm": selectedServer,
			...headers,
		});
	}
	return { db, env, management, mint, reveal, request, call };
}
