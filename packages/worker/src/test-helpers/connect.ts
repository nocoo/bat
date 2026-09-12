import type { ConnectScope, ConnectToken } from "@bat/shared";
import { randomSecret } from "../domain/connect.js";
import { CONNECT_OPERATIONS } from "../domain/connect-contract.js";
import { app } from "../index.js";
import type { Bindings } from "../types.js";
import { createMockD1 } from "./mock-d1.js";

export const SERVER_A = "connect-server-a";
export const SERVER_B = "connect-server-b";

export async function connectFixture() {
	const db = createMockD1();
	const env: Bindings = {
		DB: db,
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
		serverId = SERVER_A,
		expiresAt: string | null = null,
	) {
		const path = `/api/connect/servers/${serverId}/tokens`;
		const created = await management(path, "POST", { name: `Fixture ${scope}`, scope, expiresAt });
		if (created.status !== 201)
			throw new Error(
				`Token creation failed (${created.status}): ${((await created.json()) as { error?: { code?: string } }).error?.code}`,
			);
		const token = ((await created.json()) as { data: ConnectToken }).data;
		const secret = await reveal(token);
		return { token, secret };
	}
	async function reveal(token: ConnectToken) {
		const path = `/api/connect/servers/${token.serverId}/tokens/${token.id}`;
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
		let etag = "";
		if (operation.method !== "GET")
			etag = (await request("/api/v1/capabilities", secret)).headers.get("ETag") ?? "";
		return request(path, secret, operation.method, body, {
			"If-Match": etag,
			"Idempotency-Key": crypto.randomUUID(),
			"X-Bat-Confirm": selectedServer,
			...headers,
		});
	}
	return { db, env, management, mint, reveal, request, call };
}
