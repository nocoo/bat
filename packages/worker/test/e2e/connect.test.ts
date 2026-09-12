import type { ConnectToken } from "@bat/shared";
import { Validator } from "@cfworker/json-schema";
import { describe, expect, test } from "vitest";
import { CONNECT_SCHEMAS, connectResponseSchema } from "../../src/domain/connect-contract.js";
import { CONNECT_OPERATIONS } from "../../src/domain/connect-operations.js";
import { BASE, makeIdentityPayload, writeHeaders } from "./helpers.js";

const SERVER = "e2e-connect-a",
	OTHER = "e2e-connect-b";
const jsonHeaders = { "Content-Type": "application/json", Origin: BASE, "X-Bat-Management": "1" };
const get = (path: string) => fetch(`${BASE}${path}`, { headers: jsonHeaders });
const post = (path: string, body: unknown, token?: ConnectToken) =>
	fetch(`${BASE}${path}`, {
		method: "POST",
		headers: { ...jsonHeaders, ...(token ? { "If-Match": `"${token.id}:${token.version}"` } : {}) },
		body: JSON.stringify(body),
	});
const patch = (path: string, body: unknown, token: ConnectToken) =>
	fetch(`${BASE}${path}`, {
		method: "PATCH",
		headers: { ...jsonHeaders, "If-Match": `"${token.id}:${token.version}"` },
		body: JSON.stringify(body),
	});

describe("Connect real HTTP / D1 / Durable Object", () => {
	test("all product resources, scope and ownership boundaries, encrypted repeat reveal, rotation and revocation", async () => {
		for (const server of [SERVER, OTHER])
			expect(
				(
					await fetch(`${BASE}/api/identity`, {
						method: "POST",
						headers: writeHeaders(),
						body: JSON.stringify(makeIdentityPayload(server)),
					})
				).status,
			).toBe(204);
		expect((await get("/api/connect/servers")).status).toBe(200);
		async function mint(scope: "read" | "write", name: string) {
			const created = await post(`/api/connect/servers/${SERVER}/tokens`, { name, scope });
			expect(created.status).toBe(201);
			return ((await created.json()) as { data: ConnectToken }).data;
		}
		async function reveal(token: ConnectToken) {
			const challenge = await post(
				`/api/connect/servers/${SERVER}/tokens/${token.id}/challenge`,
				{ action: "reveal" },
				token,
			);
			expect(challenge.status).toBe(200);
			const nonce = ((await challenge.json()) as { challenge: string }).challenge;
			const response = await post(
				`/api/connect/servers/${SERVER}/tokens/${token.id}/reveal`,
				{ challenge: nonce, confirmation: token.name },
				token,
			);
			expect(response.status).toBe(200);
			expect(response.headers.get("Cache-Control")).toContain("no-store");
			return ((await response.json()) as { token: string }).token;
		}
		const readToken = await mint("read", "HTTP read"),
			writeToken = await mint("write", "HTTP write");
		const read = await reveal(readToken),
			write = await reveal(writeToken);
		const boundary = await reveal(await mint("write", "HTTP boundary"));
		expect((await reveal(readToken)) === read).toBe(true);
		const inventory = await get(`/api/connect/servers/${SERVER}/tokens`);
		const inventoryText = await inventory.text();
		expect(inventoryText.includes(read) || inventoryText.includes(write)).toBe(false);
		const request = (
			path: string,
			secret = read,
			method = "GET",
			body?: unknown,
			headers: Record<string, string> = {},
		) =>
			fetch(`${BASE}${path}`, {
				method,
				headers: {
					Authorization: `Bearer ${secret}`,
					"Content-Type": "application/json",
					...headers,
				},
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
		async function call(
			id: string,
			body?: unknown,
			params: Record<string, string> = {},
			secret = write,
			extra: Record<string, string> = {},
		) {
			const op = CONNECT_OPERATIONS.find((item) => item.id === id);
			if (!op) throw new Error(`Unknown operation ${id}`);
			const values: Record<string, string> = {
				serverId: SERVER,
				id: "missing",
				key: "http-repeat-asset",
				...params,
			};
			let path = op.path.replace(/:([A-Za-z]+)/g, (_, name: string) =>
				encodeURIComponent(values[name] ?? "missing"),
			);
			if (id === "metrics.list")
				path += `?from=${Math.floor(Date.now() / 1000) - 3600}&to=${Math.floor(Date.now() / 1000) + 2}`;
			const version =
				op.method === "GET"
					? ""
					: ((await request("/api/v1/capabilities", secret)).headers.get("ETag") ?? "");
			return request(path, secret, op.method, body, {
				"If-Match": version,
				"Idempotency-Key": crypto.randomUUID(),
				"X-Bat-Confirm": SERVER,
				...extra,
			});
		}
		async function mutation(id: string, body?: unknown, params: Record<string, string> = {}) {
			const response = await call(id, body, params);
			expect(response.status >= 200 && response.status < 300, id).toBe(true);
			expect(response.headers.has("ETag"), `${id} version`).toBe(true);
			if (response.status === 204) return {};
			const value = (await response.json()) as { data: { id?: string | number } };
			const operation = CONNECT_OPERATIONS.find((item) => item.id === id);
			if (!operation) throw new Error(`Unknown Connect operation: ${id}`);
			expect(
				new Validator(
					{ ...connectResponseSchema(operation), components: { schemas: CONNECT_SCHEMAS } },
					"2020-12",
				).validate(value).valid,
				`${id} response schema`,
			).toBe(true);
			return value.data;
		}

		expect(
			(await fetch(`${BASE}/api/v1`, { headers: { Authorization: `Bearer ${read}` } })).status,
		).toBe(200);
		for (const operation of CONNECT_OPERATIONS.filter((op) => op.method !== "GET"))
			expect((await call(operation.id, {}, {}, read)).status, `${operation.id} read scope`).toBe(
				403,
			);
		for (const operation of CONNECT_OPERATIONS.filter(
			(op) => op.method === "GET" && op.path.includes(":serverId"),
		))
			expect(
				(await call(operation.id, undefined, { serverId: OTHER }, read)).status,
				`${operation.id} server boundary`,
			).toBe(403);
		expect((await request("/api/v1/capabilities", "legacy-key")).status).toBe(401);
		expect((await request(`/api/v1/servers/${SERVER}`, read, "HEAD")).status).toBe(200);
		expect(
			(
				await request(`/api/v1/servers/${SERVER}/assets`, boundary, "POST", {
					type: "domain",
					name: "No preconditions",
				})
			).status,
		).toBe(428);
		expect(
			(
				await call(
					"assets.create",
					{ type: "domain", name: "Forbidden", host_id: OTHER },
					{},
					boundary,
				)
			).status,
		).toBe(403);
		expect((await call("settings.update", {}, {}, boundary)).status).toBe(501);

		await mutation("identity.update", makeIdentityPayload(SERVER));
		await mutation("metrics.ingest", {
			host_id: SERVER,
			timestamp: Math.floor(Date.now() / 1000),
			interval: 30,
			uptime_seconds: 100,
			cpu: { load1: 0, load5: 0, load15: 0, usage_pct: 10, iowait_pct: 0, steal_pct: 0, count: 2 },
			mem: { total_bytes: 1000, available_bytes: 800, used_pct: 20 },
			swap: { total_bytes: 0, used_bytes: 0, used_pct: 0 },
			disk: [],
			net: [],
		});
		await mutation("tier2.ingest", {
			host_id: SERVER,
			timestamp: Math.floor(Date.now() / 1000),
			ports: { listening: [] },
		});
		await mutation("events.create", { title: "HTTP event", body: { test: true } });
		await mutation("server.description.update", { description: "HTTP checked" });
		await mutation("maintenance.set", { start: "01:00", end: "02:00" });
		await mutation("maintenance.delete");
		const tagId = String((await mutation("tags.create", { name: "E2E Connect", color: 1 })).id);
		await mutation("tags.update", { name: "E2E Connect renamed" }, { id: tagId });
		await mutation("hostTags.add", { tag_id: Number(tagId) });
		await mutation("hostTags.replace", { tag_ids: [Number(tagId)] });
		await mutation("ports.add", { port: 8443, reason: "Test" });
		const webhookId = String((await mutation("webhooks.create", { host_id: SERVER })).id);
		await mutation("webhooks.rotate", undefined, { id: webhookId });
		const agentId = String(
			(
				await mutation("agents.create", {
					source_key: "e2e-connect-source",
					match_key: "one",
					nickname: "HTTP Agent",
				})
			).id,
		);
		await mutation("agents.update", { role: "Reviewer" }, { id: agentId });
		await mutation("agents.tags", { tag_ids: [Number(tagId)] }, { id: agentId });
		await mutation("agents.heartbeat", {
			source_key: "e2e-connect-source",
			agents: [{ match_key: "one", status: "running" }],
		});
		const assetId = String(
			(await mutation("assets.create", { type: "domain", name: "connect.example.invalid" })).id,
		);
		await mutation("assets.update", { provider: "Test" }, { id: assetId });
		await mutation("assets.tags", { tag_ids: [Number(tagId)] }, { id: assetId });
		await mutation("bindings.create", { agent_id: agentId, asset_id: assetId });

		const reads = [
			"capabilities.get",
			"contract.get",
			"servers.list",
			"server.get",
			"metrics.list",
			"tier2.get",
			"maintenance.get",
			"alerts.list",
			"events.list",
			"status.get",
			"monitoring.get",
			"monitoring.groups",
			"monitoring.alerts",
			"tags.list",
			"hostTags.list",
			"ports.list",
			"webhooks.list",
			"agents.list",
			"agents.get",
			"assets.map",
			"assets.overview",
			"assets.list",
			"assets.get",
			"bindings.list",
			"settings.get",
			"setup.get",
			"audit.list",
		];
		for (const id of reads) {
			const response = await call(
				id,
				undefined,
				{ id: id.startsWith("agents.") ? agentId : assetId },
				read,
			);
			expect(response.status, id).toBe(200);
			expect(response.headers.get("Cache-Control"), id).toContain("no-store");
			const value = await response.json();
			const operation = CONNECT_OPERATIONS.find((item) => item.id === id);
			if (!operation) throw new Error(`Unknown Connect operation: ${id}`);
			expect(
				new Validator(
					{ ...connectResponseSchema(operation), components: { schemas: CONNECT_SCHEMAS } },
					"2020-12",
				).validate(value).valid,
				`${id} response schema`,
			).toBe(true);
			expect(JSON.stringify(value).includes(OTHER), `${id} foreign server`).toBe(false);
		}
		await mutation("bindings.delete", undefined, { agentId, assetId });
		await mutation("assets.delete", undefined, { id: assetId });
		await mutation("agents.delete", undefined, { id: agentId });
		await mutation("webhooks.delete", undefined, { id: webhookId });
		await mutation("ports.delete", undefined, { port: "8443" });
		await mutation("hostTags.delete", undefined, { tagId });
		await mutation("tags.delete", undefined, { id: tagId });

		const renamed = await patch(
			`/api/connect/servers/${SERVER}/tokens/${writeToken.id}`,
			{ name: "HTTP writer renamed" },
			writeToken,
		);
		expect(renamed.status).toBe(200);
		const current = ((await renamed.json()) as { data: ConnectToken }).data;
		const challenge = (
			(await (
				await post(
					`/api/connect/servers/${SERVER}/tokens/${current.id}/challenge`,
					{ action: "rotate" },
					current,
				)
			).json()) as { challenge: string }
		).challenge;
		const rotated = await post(
			`/api/connect/servers/${SERVER}/tokens/${current.id}/rotate`,
			{ challenge, confirmation: current.name },
			current,
		);
		expect(rotated.status).toBe(200);
		const next = ((await rotated.json()) as { data: ConnectToken }).data;
		expect((await request("/api/v1/capabilities", write)).status).toBe(401);
		const rotatedKey = await reveal(next);
		expect((await request("/api/v1/capabilities", rotatedKey)).status).toBe(200);
		for (const token of [readToken, next]) {
			const nonce = (
				(await (
					await post(
						`/api/connect/servers/${SERVER}/tokens/${token.id}/challenge`,
						{ action: "revoke" },
						token,
					)
				).json()) as { challenge: string }
			).challenge;
			expect(
				(
					await post(
						`/api/connect/servers/${SERVER}/tokens/${token.id}/revoke`,
						{ challenge: nonce, confirmation: token.name },
						token,
					)
				).status,
			).toBe(200);
		}
		expect((await request("/api/v1/capabilities", read)).status).toBe(401);
		expect((await request("/api/v1/capabilities", rotatedKey)).status).toBe(401);
		expect((await get(`/api/connect/servers/${SERVER}/audit`)).status).toBe(200);
	});

	test("simultaneous intentions honor one ETag and replay does not duplicate a mutation", async () => {
		const created = await post(`/api/connect/servers/${SERVER}/tokens`, {
			name: "HTTP concurrency",
			scope: "write",
		});
		expect(created.status).toBe(201);
		const token = ((await created.json()) as { data: ConnectToken }).data;
		const path = `/api/connect/servers/${SERVER}/tokens/${token.id}`;
		const challenge = (
			(await (await post(`${path}/challenge`, { action: "reveal" }, token)).json()) as {
				challenge: string;
			}
		).challenge;
		const secret = (
			(await (
				await post(`${path}/reveal`, { challenge, confirmation: token.name }, token)
			).json()) as { token: string }
		).token;
		const auth = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
		const etag =
			(await fetch(`${BASE}/api/v1/capabilities`, { headers: auth })).headers.get("ETag") ?? "";
		const change = (key: string, name: string) =>
			fetch(`${BASE}/api/v1/servers/${SERVER}/assets`, {
				method: "POST",
				headers: { ...auth, "If-Match": etag, "Idempotency-Key": key },
				body: JSON.stringify({ type: "domain", name }),
			});
		const responses = await Promise.all([
			change("http-repeat-asset", "Repeated"),
			change("http-other-asset", "Conflicting"),
		]);
		expect(responses.map((response) => response.status).sort()).toEqual([201, 412]);
		const winner: [string, string] =
			responses[0]?.status === 201
				? ["http-repeat-asset", "Repeated"]
				: ["http-other-asset", "Conflicting"];
		const replay = await change(winner[0], winner[1]);
		expect(replay.status).toBe(201);
		expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
		const status = await fetch(`${BASE}/api/v1/requests/${winner[0]}`, { headers: auth });
		expect(status.status).toBe(200);
		expect(((await status.json()) as { data: { state: string } }).data.state).toBe("complete");
	});
});
