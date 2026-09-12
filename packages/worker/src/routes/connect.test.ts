import { Validator } from "@cfworker/json-schema";
import { describe, expect, test } from "vitest";
import { fingerprint } from "../domain/connect.js";
import {
	CONNECT_SCHEMAS,
	connectOpenApi,
	connectResponseSchema,
} from "../domain/connect-contract.js";
import { CONNECT_OPERATIONS } from "../domain/connect-operations.js";
import { connectFixture, SERVER_A, SERVER_B } from "../test-helpers/connect.js";

describe("Connect authentication and server authority", () => {
	test("token ciphertext is recoverable, non-expiring, and only revealed with confirmation", async () => {
		const f = await connectFixture();
		const { token, secret } = await f.mint("read");
		expect(token.expiresAt).toBeNull();
		const stored = await f.db
			.prepare("SELECT * FROM connect_tokens WHERE id = ?")
			.bind(token.id)
			.first<Record<string, unknown>>();
		expect(JSON.stringify(stored).includes(secret)).toBe(false);
		expect(typeof stored?.ciphertext).toBe("string");
		expect((await f.reveal(token)) === secret).toBe(true);
		const list = await f.management(`/api/connect/servers/${SERVER_A}/tokens`);
		expect((await list.text()).includes(secret)).toBe(false);
		const denied = await f.management(
			`/api/connect/servers/${SERVER_A}/tokens/${token.id}/reveal`,
			"POST",
			{ confirmation: token.name },
			token,
		);
		expect(denied.status).toBe(403);
		const audits = await f.db
			.prepare(
				"SELECT COUNT(*) AS n FROM connect_audit WHERE operation = 'management.tokens.reveal' AND status = 200",
			)
			.first<{ n: number }>();
		expect(audits?.n).toBe(2);
	});

	test("every resource rejects a cross-server path and read tokens reject all writes", async () => {
		const f = await connectFixture();
		const read = await f.mint("read");
		for (const operation of CONNECT_OPERATIONS) {
			if (operation.method !== "GET")
				expect((await f.call(operation.id, read.secret, {})).status, operation.id).toBe(403);
			if (operation.path.includes(":serverId") && operation.method === "GET")
				expect(
					(await f.call(operation.id, read.secret, undefined, { serverId: SERVER_B })).status,
					operation.id,
				).toBe(403);
		}
	});

	test("all supported read resources are discoverable and bounded to the server", async () => {
		const f = await connectFixture();
		const read = await f.mint("read");
		for (const operation of CONNECT_OPERATIONS.filter(
			(op) => op.method === "GET" && op.id !== "requests.get",
		)) {
			const response = await f.call(operation.id, read.secret);
			expect(response.status, operation.id).toBe(200);
			expect(response.headers.get("Cache-Control"), operation.id).toContain("no-store");
			const text = await response.text();
			expect(
				text.includes("Foreign asset") || text.includes("Foreign agent") || text.includes(SERVER_B),
				operation.id,
			).toBe(false);
			const validator = new Validator(
				{ ...connectResponseSchema(operation), components: { schemas: CONNECT_SCHEMAS } },
				"2020-12",
			);
			expect(validator.validate(JSON.parse(text)).valid, `${operation.id} response contract`).toBe(
				true,
			);
		}
		const capabilities = await f.request("/api/v1/capabilities", read.secret);
		const data = (await capabilities.json()) as {
			operations: { allowed: boolean; method: string }[];
			permissions: string[];
		};
		expect(data.permissions).toEqual(["read"]);
		expect(data.operations.filter((op) => op.method !== "GET").every((op) => !op.allowed)).toBe(
			true,
		);
		const head = await f.request(`/api/v1/servers/${SERVER_A}`, read.secret, "HEAD");
		expect(head.status).toBe(200);
		expect(await head.text()).toBe("");
	});

	test("resource IDs, body selectors and installation collisions cannot cross servers", async () => {
		const f = await connectFixture();
		const write = await f.mint();
		expect((await f.call("agents.get", write.secret, undefined, { id: "agt_b" })).status).toBe(404);
		expect(
			(await f.call("assets.update", write.secret, { name: "Forbidden" }, { id: "ast_b" })).status,
		).toBe(404);
		expect((await f.call("agents.update", write.secret, { host_id: SERVER_B })).status).toBe(403);
		expect(
			(await f.call("assets.create", write.secret, { type: "domain", name: "No", host_id: null }))
				.status,
		).toBe(403);
		expect(
			(
				await f.call("agents.create", write.secret, {
					source_key: "source-b",
					match_key: "agent-b",
				})
			).status,
		).toBe(409);
		expect(
			(await f.call("agents.heartbeat", write.secret, { source_key: "source-b", agents: [] }))
				.status,
		).toBe(409);
		expect(
			(await f.call("bindings.create", write.secret, { agent_id: "agt_a", asset_id: "ast_b" }))
				.status,
		).toBe(400);
		expect((await f.call("webhooks.rotate", write.secret, {}, { id: "2" })).status).toBe(404);
		expect((await f.call("tags.update", write.secret, { name: "No" }, { id: "1" })).status).toBe(
			403,
		);
		expect((await f.call("agents.tags", write.secret, { tag_ids: [3] })).status).toBe(404);
		expect(
			(await f.request(`/api/v1/servers/${SERVER_A}/events?host_id=${SERVER_B}`, write.secret))
				.status,
		).toBe(403);
		const foreign = await f.db
			.prepare("SELECT name FROM assets WHERE id = 'ast_b'")
			.first<{ name: string }>();
		expect(foreign?.name).toBe("Foreign asset");
	});

	test("grant revocation, expiry, retirement and deployment binding are checked on every request", async () => {
		const f = await connectFixture();
		const read = await f.mint("read");
		await f.db
			.prepare("UPDATE connect_tokens SET owner = 'email:limited@example.invalid' WHERE id = ?")
			.bind(read.token.id)
			.run();
		expect((await f.call("server.get", read.secret)).status).toBe(403);
		await f.db
			.prepare(
				"INSERT INTO connect_server_grants(server_id,principal) VALUES (?, 'email:limited@example.invalid')",
			)
			.bind(SERVER_A)
			.run();
		expect((await f.call("server.get", read.secret)).status).toBe(200);
		await f.db.prepare("UPDATE connect_server_grants SET revoked_at = unixepoch()").run();
		expect((await f.call("server.get", read.secret)).status).toBe(403);
		await f.db
			.prepare(
				"UPDATE connect_tokens SET owner = 'local:developer', expires_at = unixepoch() - 1 WHERE id = ?",
			)
			.bind(read.token.id)
			.run();
		expect((await f.call("server.get", read.secret)).status).toBe(401);
		await f.db
			.prepare("UPDATE connect_tokens SET expires_at = NULL WHERE id = ?")
			.bind(read.token.id)
			.run();
		await f.db.prepare("UPDATE hosts SET is_active = 0 WHERE host_id = ?").bind(SERVER_A).run();
		expect((await f.call("server.get", read.secret)).status).toBe(403);
		f.env.CONNECT_DEPLOYMENT_ID = "another-deployment";
		expect((await f.call("server.get", read.secret)).status).toBe(401);
	});
});

describe("Connect writes and retry semantics", () => {
	test("all supported write resources work through the declared contract and remain server-local", async () => {
		const f = await connectFixture();
		const write = await f.mint();
		const checked = new Set<string>();
		async function mutate(id: string, body?: unknown, params?: Record<string, string>) {
			const response = await f.call(id, write.secret, body, params);
			expect(response.status >= 200 && response.status < 300, id).toBe(true);
			expect(response.headers.has("ETag"), `${id} ETag`).toBe(true);
			checked.add(id);
			if (response.status === 204) return null;
			const result = await response.json();
			const op = CONNECT_OPERATIONS.find((operation) => operation.id === id);
			if (!op) throw new Error(`Unknown Connect operation: ${id}`);
			expect(
				new Validator(
					{ ...connectResponseSchema(op), components: { schemas: CONNECT_SCHEMAS } },
					"2020-12",
				).validate(result).valid,
				`${id} response contract`,
			).toBe(true);
			return (result as { data: { id: string | number } }).data;
		}
		await mutate("server.description.update", { description: "Connected" });
		await mutate("identity.update", {
			host_id: SERVER_A,
			hostname: "Alpha",
			os: "Linux",
			kernel: "6",
			arch: "x86_64",
			cpu_model: "CPU",
			uptime_seconds: 100,
			boot_time: 100,
			cpu_logical: 4,
		});
		await mutate("metrics.ingest", {
			host_id: SERVER_A,
			timestamp: Math.floor(Date.now() / 1000),
			interval: 30,
			uptime_seconds: 100,
			cpu: { load1: 1, load5: 1, load15: 1, usage_pct: 20, iowait_pct: 0, steal_pct: 0, count: 4 },
			mem: { total_bytes: 1000, available_bytes: 600, used_pct: 40 },
			swap: { total_bytes: 0, used_bytes: 0, used_pct: 0 },
			disk: [],
			net: [],
		});
		await mutate("tier2.ingest", {
			host_id: SERVER_A,
			timestamp: Math.floor(Date.now() / 1000) + 1,
			ports: { listening: [] },
			software: { detected: [], scan_duration_ms: 1, version_duration_ms: 1 },
			timezone: "UTC",
		});
		await mutate("events.create", {
			title: "Agent event",
			body: { source: "unit" },
			tags: ["test"],
		});
		await mutate("maintenance.set", { start: "01:00", end: "02:00", reason: "Work" });
		await mutate("maintenance.delete");
		const tag = await mutate("tags.create", { name: "Created private", color: 2 });
		const tagId = Number(tag?.id);
		await mutate("tags.update", { name: "Renamed private" }, { id: String(tagId) });
		await mutate("hostTags.add", { tag_id: tagId });
		await mutate("hostTags.replace", { tag_ids: [tagId] });
		await mutate("hostTags.delete", undefined, { tagId: String(tagId) });
		await mutate("ports.add", { port: 443, reason: "HTTPS" });
		await mutate("ports.delete");
		const hook = await mutate("webhooks.create", { host_id: SERVER_A });
		await mutate("webhooks.rotate", undefined, { id: String(hook?.id) });
		const agent = await mutate("agents.create", {
			source_key: "created-source",
			match_key: "created-agent",
			nickname: "New",
			metadata: { kind: "unit" },
		});
		const agentId = String(agent?.id);
		await mutate("agents.update", { role: "Auditor", status: "running" }, { id: agentId });
		await mutate("agents.tags", { tag_ids: [tagId] }, { id: agentId });
		await mutate("agents.heartbeat", {
			source_key: "created-source",
			agents: [
				{ match_key: "created-agent", status: "stopped" },
				{ match_key: "new-heartbeat", status: "running", runtime_app: "test" },
			],
		});
		const asset = await mutate("assets.create", { type: "domain", name: "example.invalid" });
		const assetId = String(asset?.id);
		await mutate("assets.update", { status: "inactive", metadata: {} }, { id: assetId });
		await mutate("assets.tags", { tag_ids: [tagId] }, { id: assetId });
		await mutate("bindings.create", { agent_id: agentId, asset_id: assetId });
		await mutate("bindings.delete", undefined, { agentId, assetId });
		await mutate("assets.delete", undefined, { id: assetId });
		await mutate("agents.delete", undefined, { id: agentId });
		await mutate("webhooks.delete", undefined, { id: String(hook?.id) });
		await mutate("tags.delete", undefined, { id: String(tagId) });
		expect([...checked].sort()).toEqual(
			CONNECT_OPERATIONS.filter((op) => op.method !== "GET" && !op.unsupported)
				.map((op) => op.id)
				.sort(),
		);
		const audit = await f.call("audit.list", write.secret);
		expect(audit.status).toBe(200);
		const foreign = await f.db
			.prepare("SELECT name FROM assets WHERE id = 'ast_b'")
			.first<{ name: string }>();
		expect(foreign?.name).toBe("Foreign asset");
	});
	test("write includes read; real mutations require ETags, intent keys and risk confirmation", async () => {
		const f = await connectFixture();
		const write = await f.mint();
		expect((await f.call("server.get", write.secret)).status).toBe(200);
		expect(
			(await f.call("server.description.update", write.secret, { description: "Reviewed" })).status,
		).toBe(204);
		const host = await f.db
			.prepare("SELECT description FROM hosts WHERE host_id = ?")
			.bind(SERVER_A)
			.first<{ description: string }>();
		expect(host?.description).toBe("Reviewed");
		expect(
			(
				await f.call(
					"server.description.update",
					write.secret,
					{ description: "No" },
					{},
					{ "If-Match": "" },
				)
			).status,
		).toBe(428);
		expect(
			(
				await f.call(
					"server.description.update",
					write.secret,
					{ description: "No" },
					{},
					{ "Idempotency-Key": "" },
				)
			).status,
		).toBe(428);
		expect(
			(
				await f.call(
					"maintenance.set",
					write.secret,
					{ start: "01:00", end: "02:00" },
					{},
					{ "X-Bat-Confirm": "" },
				)
			).status,
		).toBe(428);
		expect((await f.call("settings.update", write.secret, { retention_days: 1 })).status).toBe(501);
	});

	test("same intent replays exactly once, changed payload conflicts, browser changes invalidate ETags", async () => {
		const f = await connectFixture();
		const write = await f.mint();
		const headers = { "Idempotency-Key": "repeat-create-asset" };
		const first = await f.call(
			"assets.create",
			write.secret,
			{ type: "domain", name: "Repeated" },
			{},
			headers,
		);
		expect(first.status).toBe(201);
		const again = await f.call(
			"assets.create",
			write.secret,
			{ type: "domain", name: "Repeated" },
			{},
			headers,
		);
		expect(again.status).toBe(201);
		expect(again.headers.get("Idempotency-Replayed")).toBe("true");
		const count = await f.db
			.prepare("SELECT COUNT(*) AS n FROM assets WHERE name = 'Repeated'")
			.first<{ n: number }>();
		expect(count?.n).toBe(1);
		expect(
			(
				await f.call(
					"assets.create",
					write.secret,
					{ type: "domain", name: "Different" },
					{},
					headers,
				)
			).status,
		).toBe(409);
		const before = (await f.call("server.get", write.secret)).headers.get("ETag") as string;
		await f.management(`/api/hosts/${SERVER_A}/description`, "PATCH", {
			description: "Browser edit",
		});
		expect(
			(await f.call("assets.update", write.secret, { name: "Stale" }, {}, { "If-Match": before }))
				.status,
		).toBe(412);
		const record = await f.call("requests.get", write.secret, undefined, {
			key: "repeat-create-asset",
		});
		expect(record.status).toBe(200);
		expect(((await record.json()) as { data: { state: string } }).data.state).toBe("complete");
	});

	test("unknown outcomes and expired encrypted responses are never automatically re-executed", async () => {
		const f = await connectFixture();
		const write = await f.mint();
		const headers = { "Idempotency-Key": "unknown-outcome-test" };
		expect(
			(await f.call("assets.create", write.secret, { name: "Once", type: "domain" }, {}, headers))
				.status,
		).toBe(201);
		await f.db
			.prepare("UPDATE connect_requests SET state = 'pending', response = NULL WHERE token_id = ?")
			.bind(write.token.id)
			.run();
		expect(
			(await f.call("assets.create", write.secret, { name: "Once", type: "domain" }, {}, headers))
				.status,
		).toBe(409);
		await f.db
			.prepare("UPDATE connect_requests SET state = 'complete' WHERE token_id = ?")
			.bind(write.token.id)
			.run();
		expect(
			(await f.call("assets.create", write.secret, { name: "Once", type: "domain" }, {}, headers))
				.status,
		).toBe(409);
		const count = await f.db
			.prepare("SELECT COUNT(*) AS n FROM assets WHERE name = 'Once'")
			.first<{ n: number }>();
		expect(count?.n).toBe(1);
		expect((await f.call("requests.get", write.secret)).status).toBe(404);
		expect(
			await f.db
				.prepare("SELECT fingerprint FROM connect_requests WHERE key_hash = ?")
				.bind(await fingerprint(headers["Idempotency-Key"]))
				.first(),
		).not.toBeNull();
	});

	test("OpenAPI covers every resource, resolves its schemas, and rejects invalid nested input before writes", async () => {
		const contract = connectOpenApi();
		expect(contract.openapi).toBe("3.1.0");
		for (const op of CONNECT_OPERATIONS)
			expect(
				contract.paths[op.path.replace(/:([A-Za-z]+)/g, "{$1}")]?.[op.method.toLowerCase()],
			).toMatchObject({ operationId: op.id });
		const f = await connectFixture();
		const write = await f.mint();
		for (const [id, body] of [
			[
				"tier2.ingest",
				{ host_id: SERVER_A, timestamp: Math.floor(Date.now() / 1000), software: [] },
			],
			["metrics.ingest", { host_id: SERVER_A, timestamp: 0, interval: 30, cpu: {} }],
			["agents.create", { source_key: "s", match_key: "m", scope: "admin" }],
			["hostTags.replace", { tag_ids: [1, 1] }],
			["tags.create", { name: "Bad color", color: 0.5 }],
			["events.create", { title: "t", body: [] }],
		] as const) {
			const response = await f.call(id, write.secret, body);
			expect(response.status, id).toBe(400);
		}
		expect(
			(await f.call("tags.update", write.secret, { name: "No" }, { id: "2suffix" })).status,
		).toBe(400);
		expect((await f.call("metrics.list", write.secret)).status).toBe(200);
		expect(
			(await f.request(`/api/v1/servers/${SERVER_A}/metrics?from=1&to=99999999`, write.secret))
				.status,
		).toBe(400);
		for (const path of [
			"/api/v1/tokens",
			"/api/v1/cli-tokens",
			`/api/v1/servers/${SERVER_A}/execute`,
		])
			expect((await f.request(path, write.secret, "POST", {})).status).toBe(501);
		expect((await f.request(`/api/v1/servers/${SERVER_A}`, write.secret, "DELETE")).status).toBe(
			501,
		);
		expect((await f.request("/api/v1/unknown", write.secret)).status).toBe(404);
		expect((await f.request(`/api/v1/servers/${SERVER_B}/unknown`, write.secret)).status).toBe(403);
	});
});
