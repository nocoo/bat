import type { ConnectToken } from "@bat/shared";
import { Validator } from "@cfworker/json-schema";
import { describe, expect, test, vi } from "vitest";
import { CONNECT_SCHEMAS, connectManagementOpenApi } from "../domain/connect-contract.js";
import { app } from "../index.js";
import { connectFixture, SERVER_A, SERVER_B } from "../test-helpers/connect.js";

vi.mock("jose", () => ({
	createRemoteJWKSet: vi.fn(),
	jwtVerify: vi.fn(async (jwt: string) => {
		if (jwt === "manager") return { payload: { email: "manager@example.invalid" } };
		if (jwt === "limited") return { payload: { email: "limited@example.invalid" } };
		throw new Error("Invalid signature");
	}),
}));

const metadata = async (response: Response) =>
	((await response.json()) as { data: ConnectToken }).data;

describe("Connect many-to-many authorization", () => {
	test("one key selects multiple servers, duplicate IDs normalize, and another key shares the same server", async () => {
		const f = await connectFixture();
		const multi = await f.mint("write", [SERVER_B, SERVER_A, SERVER_B]);
		const other = await f.mint("read", SERVER_A);
		expect(multi.token.serverIds).toEqual([SERVER_A, SERVER_B]);
		expect(multi.token.serverId).toBeUndefined();
		expect(other.token.serverId).toBe(SERVER_A);
		expect(await (await f.request("/api/v1/capabilities", other.secret)).json()).toMatchObject({
			serverId: SERVER_A,
			serverIds: [SERVER_A],
		});
		expect(multi.token.expiresAt).toBeNull();
		expect(multi.token.id).not.toBe(other.token.id);
		const discovery = await f.request("/api/v1/capabilities", multi.secret);
		expect(await discovery.json()).toMatchObject({
			serverIds: [SERVER_A, SERVER_B],
			permissions: ["read", "write"],
		});
		const listing = await f.request("/api/v1/servers", multi.secret);
		expect(
			((await listing.json()) as { data: { host_id: string }[] }).data
				.map((row) => row.host_id)
				.sort(),
		).toEqual([SERVER_A, SERVER_B]);
		for (const serverId of [SERVER_A, SERVER_B]) {
			expect((await f.call("server.get", multi.secret, undefined, { serverId })).status).toBe(200);
			expect(
				(
					await f.call(
						"server.description.update",
						multi.secret,
						{ description: serverId },
						{ serverId },
					)
				).status,
			).toBe(204);
		}
		expect((await f.call("server.get", other.secret)).status).toBe(200);
		expect(
			(await f.call("server.get", other.secret, undefined, { serverId: SERVER_B })).status,
		).toBe(403);
		expect(
			(await f.call("server.description.update", other.secret, { description: "denied" })).status,
		).toBe(403);
		// Even if the key authorizes both servers, an A request cannot select B resources.
		expect((await f.call("agents.get", multi.secret, undefined, { id: "agt_b" })).status).toBe(404);
		expect(
			(await f.call("agents.get", multi.secret, undefined, { serverId: SERVER_B, id: "agt_b" }))
				.status,
		).toBe(200);
		for (const key of ["host_id", "server_id", "serverId"]) {
			expect(
				(
					await f.call("assets.create", multi.secret, {
						type: "domain",
						name: "denied",
						[key]: SERVER_B,
					})
				).status,
			).toBe(403);
			expect(
				(
					await f.request(
						`/api/v1/servers/${SERVER_A}/assets?${key}=${SERVER_A}&${key}=${SERVER_B}`,
						multi.secret,
					)
				).status,
			).toBe(403);
		}
	});

	test("editing grants is immediate, preserves the secret, and cannot replay removed-server outcomes", async () => {
		const f = await connectFixture();
		const { token, secret } = await f.mint("write", [SERVER_A, SERVER_B]);
		const path = `/api/connect/tokens/${token.id}`;
		const intent = { "Idempotency-Key": "removed-server-intent" };
		expect(
			(await f.call("assets.create", secret, { name: "Once", type: "domain" }, {}, intent)).status,
		).toBe(201);
		const updated = await f.management(path, "PATCH", { serverIds: [SERVER_B] }, token);
		expect(updated.status).toBe(200);
		const next = await metadata(updated);
		expect(next.serverIds).toEqual([SERVER_B]);
		expect(next.version).toBe(token.version + 1);
		expect((await f.reveal(next)) === secret).toBe(true);
		expect((await f.call("server.get", secret)).status).toBe(403);
		expect((await f.call("server.get", secret, undefined, { serverId: SERVER_B })).status).toBe(
			200,
		);
		expect(
			(await f.call("assets.create", secret, { name: "Once", type: "domain" }, {}, intent)).status,
		).toBe(403);
		expect((await f.request("/api/v1/requests/removed-server-intent", secret)).status).toBe(404);
		expect(
			(
				await f.call(
					"assets.create",
					secret,
					{ name: "Once", type: "domain" },
					{ serverId: SERVER_B },
					intent,
				)
			).status,
		).toBe(409);
		const audit = await f.management(`${path}/audit`);
		expect(audit.status).toBe(200);
		const rows = ((await audit.json()) as { data: Record<string, unknown>[] }).data;
		expect(rows).toContainEqual(
			expect.objectContaining({
				operation: "management.tokens.update",
				previous_server_ids: [SERVER_A, SERVER_B],
				server_ids: [SERVER_B],
			}),
		);
		const serverAudit = await f.call("audit.list", secret, undefined, { serverId: SERVER_B });
		expect((await serverAudit.text()).includes(SERVER_A)).toBe(false);
		const empty = await metadata(await f.management(path, "PATCH", { serverIds: [] }, next));
		expect(empty.serverIds).toEqual([]);
		expect((await f.reveal(empty)) === secret).toBe(true);
		expect((await f.call("server.get", secret, undefined, { serverId: SERVER_B })).status).toBe(
			403,
		);
		expect(await (await f.request("/api/v1/servers", secret)).json()).toMatchObject({
			data: [],
			serverIds: [],
		});
	});

	test("empty creation is explicit and inert; malformed, missing and deleted server IDs fail closed", async () => {
		const f = await connectFixture();
		const empty = await f.mint("read", []);
		expect(await (await f.request("/api/v1/capabilities", empty.secret)).json()).toMatchObject({
			serverIds: [],
		});
		for (const serverId of [SERVER_A, SERVER_B])
			expect((await f.call("server.get", empty.secret, undefined, { serverId })).status).toBe(403);
		for (const value of [
			null,
			"all",
			[null],
			[""],
			[" bad "],
			["bad\n"],
			["x".repeat(257)],
			Array.from({ length: 101 }, () => SERVER_A),
		]) {
			const response = await f.management("/api/connect/tokens", "POST", {
				name: "Bad",
				scope: "read",
				serverIds: value,
			});
			expect(response.status).toBe(400);
		}
		expect(
			(await f.management("/api/connect/tokens", "POST", { name: "Missing", scope: "read" }))
				.status,
		).toBe(400);
		expect(
			(
				await f.management("/api/connect/tokens", "POST", {
					name: "Unknown",
					scope: "read",
					serverIds: ["missing"],
				})
			).status,
		).toBe(403);
		expect(
			(
				await f.management("/api/connect/tokens", "POST", {
					name: "Unknown field",
					scope: "read",
					serverIds: [],
					all: true,
				})
			).status,
		).toBe(400);
		await f.db.prepare("DELETE FROM tier2_snapshots WHERE host_id = ?").bind(SERVER_A).run();
		await f.db.prepare("DELETE FROM hosts WHERE host_id = ?").bind(SERVER_A).run();
		expect(
			(
				await f.management(
					`/api/connect/tokens/${empty.token.id}`,
					"PATCH",
					{ serverIds: [SERVER_A] },
					empty.token,
				)
			).status,
		).toBe(403);
	});

	test("scope and expiry edits rebind ciphertext without rotation and invalidate old confirmations", async () => {
		const f = await connectFixture();
		const { token, secret } = await f.mint("write", [SERVER_A, SERVER_B]);
		const path = `/api/connect/tokens/${token.id}`;
		const oldChallenge = (
			(await (
				await f.management(`${path}/challenge`, "POST", { action: "reveal" }, token)
			).json()) as { challenge: string }
		).challenge;
		const next = await metadata(
			await f.management(
				path,
				"PATCH",
				{ scope: "read", expiresAt: "2099-01-01T00:00:00Z" },
				token,
			),
		);
		expect(next.scope).toBe("read");
		expect(next.expiresAt).toBe("2099-01-01T00:00:00.000Z");
		expect((await f.reveal(next)) === secret).toBe(true);
		for (const serverId of [SERVER_A, SERVER_B])
			expect(
				(await f.call("server.description.update", secret, { description: "denied" }, { serverId }))
					.status,
			).toBe(403);
		expect(
			(
				await f.management(
					`${path}/reveal`,
					"POST",
					{ challenge: oldChallenge, confirmation: next.name },
					next,
				)
			).status,
		).toBe(403);
		const never = await metadata(await f.management(path, "PATCH", { expiresAt: null }, next));
		expect(never.expiresAt).toBeNull();
		expect((await f.reveal(never)) === secret).toBe(true);
		expect((await f.management(path, "PATCH", {}, never)).status).toBe(400);
		expect(
			(await f.management(path, "PATCH", { expiresAt: "2000-01-01T00:00:00Z" }, never)).status,
		).toBe(400);
	});

	test("concurrent set replacements have one CAS winner and atomically record only its grants", async () => {
		const f = await connectFixture();
		const { token } = await f.mint("read", [SERVER_A, SERVER_B]);
		const path = `/api/connect/tokens/${token.id}`;
		const responses = await Promise.all([
			f.management(path, "PATCH", { serverIds: [SERVER_A] }, token),
			f.management(path, "PATCH", { serverIds: [SERVER_B] }, token),
		]);
		expect(responses.map((response) => response.status).sort()).toEqual([200, 412]);
		const winner = await metadata(
			responses.find((response) => response.status === 200) as Response,
		);
		const fetched = await f.management(path);
		expect(fetched.headers.get("ETag")).toBe(`"${winner.id}:${winner.version}"`);
		expect((await metadata(fetched)).serverIds).toEqual(winner.serverIds);
		const audits = await f.db
			.prepare(
				"SELECT server_ids FROM connect_audit WHERE token_id = ? AND operation = 'management.tokens.update' AND status = 200",
			)
			.bind(token.id)
			.all<{ server_ids: string }>();
		expect(audits.results).toHaveLength(1);
		expect(JSON.parse(audits.results[0]?.server_ids ?? "null")).toEqual(winner.serverIds);
		await f.db.exec(
			"CREATE TRIGGER fail_connect_audit BEFORE INSERT ON connect_audit BEGIN SELECT RAISE(ABORT, 'test audit failure'); END;",
		);
		expect((await f.management(path, "PATCH", { serverIds: [] }, winner)).status).toBe(503);
		const persisted = await f.db
			.prepare("SELECT version FROM connect_tokens WHERE id = ?")
			.bind(token.id)
			.first<{ version: number }>();
		expect(persisted?.version).toBe(winner.version);
		expect(
			(
				await f.db
					.prepare("SELECT server_id FROM connect_token_servers WHERE token_id = ?")
					.bind(token.id)
					.all<{ server_id: string }>()
			).results.map((row) => row.server_id),
		).toEqual(winner.serverIds);
	});

	test("deleting or retiring a server preserves shared keys, invalidates ETags and never resurrects a grant", async () => {
		const f = await connectFixture();
		const { token, secret } = await f.mint("write", [SERVER_A, SERVER_B]);
		await f.db.prepare("DELETE FROM tier2_snapshots WHERE host_id = ?").bind(SERVER_A).run();
		await f.db.prepare("DELETE FROM hosts WHERE host_id = ?").bind(SERVER_A).run();
		const remaining = await metadata(await f.management(`/api/connect/tokens/${token.id}`));
		expect(remaining.serverIds).toEqual([SERVER_B]);
		expect(remaining.version).toBe(token.version + 1);
		expect((await f.reveal(remaining)) === secret).toBe(true);
		expect((await f.call("server.get", secret, undefined, { serverId: SERVER_B })).status).toBe(
			200,
		);
		expect(
			(await f.management(`/api/connect/tokens/${token.id}`, "PATCH", { name: "stale" }, token))
				.status,
		).toBe(412);
		await f.db.prepare("UPDATE hosts SET is_active = 0 WHERE host_id = ?").bind(SERVER_B).run();
		await f.db.prepare("UPDATE hosts SET is_active = 1 WHERE host_id = ?").bind(SERVER_B).run();
		const empty = await metadata(await f.management(`/api/connect/tokens/${token.id}`));
		expect(empty.serverIds).toEqual([]);
		expect((await f.reveal(empty)) === secret).toBe(true);
		expect((await f.call("server.get", secret, undefined, { serverId: SERVER_B })).status).toBe(
			403,
		);
	});

	test("a partial co-manager cannot obtain a multi-server key, and issuer grant withdrawal affects only that server", async () => {
		const f = await connectFixture();
		Object.assign(f.env, {
			ENVIRONMENT: "production",
			CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
			CF_ACCESS_AUD: "aud",
			CONNECT_MANAGERS: "email:manager@example.invalid",
			CONNECT_COORDINATED: true,
			CONNECT_EDGE_LIMITER: { limit: async () => ({ success: true }) },
		});
		const browser = (
			path: string,
			principal = "limited",
			method = "GET",
			body?: unknown,
			token?: ConnectToken,
		) =>
			app.request(
				`https://bat.hexly.ai${path}`,
				{
					method,
					headers: {
						"Cf-Access-Jwt-Assertion": principal,
						Origin: "https://bat.hexly.ai",
						"X-Bat-Management": "1",
						"Content-Type": "application/json",
						...(token ? { "If-Match": `"${token.id}:${token.version}"` } : {}),
					},
					...(body === undefined ? {} : { body: JSON.stringify(body) }),
				},
				f.env,
			);
		await f.db
			.prepare(
				"INSERT INTO connect_server_grants(server_id,principal) VALUES (?, 'email:limited@example.invalid')",
			)
			.bind(SERVER_A)
			.run();
		const multi = await metadata(
			await browser("/api/connect/tokens", "manager", "POST", {
				name: "Manager multi",
				scope: "read",
				serverIds: [SERVER_A, SERVER_B],
			}),
		);
		const path = `/api/connect/tokens/${multi.id}`;
		for (const suffix of ["", "/audit"])
			expect((await browser(`${path}${suffix}`)).status).toBe(403);
		expect(
			(await browser(`${path}/challenge`, "limited", "POST", { action: "reveal" }, multi)).status,
		).toBe(403);
		expect((await browser(path, "limited", "PATCH", { serverIds: [SERVER_A] }, multi)).status).toBe(
			403,
		);
		expect(await (await browser("/api/connect/tokens")).json()).toMatchObject({ data: [] });
		const inert = await metadata(
			await browser("/api/connect/tokens", "manager", "POST", {
				name: "Empty",
				scope: "read",
				serverIds: [],
			}),
		);
		expect((await browser(`/api/connect/tokens/${inert.id}`)).status).toBe(403);
		await f.db
			.prepare(
				"INSERT INTO connect_server_grants(server_id,principal) VALUES (?, 'email:limited@example.invalid')",
			)
			.bind(SERVER_B)
			.run();
		expect((await browser(path)).status).toBe(200);
		const limited = await metadata(
			await browser("/api/connect/tokens", "limited", "POST", {
				name: "Limited multi",
				scope: "read",
				serverIds: [SERVER_A, SERVER_B],
			}),
		);
		const own = `/api/connect/tokens/${limited.id}`;
		const challenge = (
			(await (
				await browser(`${own}/challenge`, "limited", "POST", { action: "reveal" }, limited)
			).json()) as { challenge: string }
		).challenge;
		const secret = (
			(await (
				await browser(
					`${own}/reveal`,
					"limited",
					"POST",
					{ challenge, confirmation: limited.name },
					limited,
				)
			).json()) as { token: string }
		).token;
		const bearer = (serverId: string) =>
			app.request(
				`https://bat-ingest.worker.hexly.ai/api/v1/servers/${serverId}`,
				{ headers: { Authorization: `Bearer ${secret}` } },
				f.env,
			);
		await f.db
			.prepare("UPDATE connect_server_grants SET revoked_at = unixepoch() WHERE server_id = ?")
			.bind(SERVER_A)
			.run();
		expect((await bearer(SERVER_A)).status).toBe(403);
		expect((await bearer(SERVER_B)).status).toBe(200);
		expect((await browser(own)).status).toBe(403);
		// A global co-manager can remove unavailable grants but cannot re-add them for this issuer.
		const reduced = await metadata(
			await browser(own, "manager", "PATCH", { serverIds: [SERVER_B] }, limited),
		);
		expect((await browser(`${own}/audit`)).status).toBe(200);
		expect((await (await browser(`${own}/audit`)).text()).includes(SERVER_A)).toBe(false);
		expect((await (await browser(`${own}/audit`, "manager")).text()).includes(SERVER_A)).toBe(true);
		expect(
			(await browser(own, "manager", "PATCH", { serverIds: [SERVER_A, SERVER_B] }, reduced)).status,
		).toBe(403);
	});

	test("large authorization sets paginate with bounded cursors that expire when the set changes", async () => {
		const f = await connectFixture();
		const ids = Array.from({ length: 60 }, () => crypto.randomUUID()).sort();
		await f.db.batch(
			ids.map((id) =>
				f.db
					.prepare("INSERT INTO hosts(host_id,hostname,last_seen) VALUES (?,?,unixepoch())")
					.bind(id, id),
			),
		);
		const { token, secret } = await f.mint("read", ids);
		const first = (await (await f.request("/api/v1/servers", secret)).json()) as {
			data: { host_id: string }[];
			page: { nextCursor: string };
		};
		expect(first.data).toHaveLength(50);
		expect(first.page.nextCursor.length).toBeLessThan(2048);
		const next = await f.request(`/api/v1/servers?cursor=${first.page.nextCursor}`, secret);
		expect(next.status).toBe(200);
		const second = (await next.json()) as {
			data: { host_id: string }[];
			page: { nextCursor: string | null };
		};
		expect(second.data).toHaveLength(10);
		expect(second.page.nextCursor).toBeNull();
		expect([...first.data, ...second.data].map((row) => row.host_id).sort()).toEqual(ids);
		expect(
			(
				await f.management(
					`/api/connect/tokens/${token.id}`,
					"PATCH",
					{ serverIds: ids.slice(1) },
					token,
				)
			).status,
		).toBe(200);
		expect(
			(await f.request(`/api/v1/servers?cursor=${first.page.nextCursor}`, secret)).status,
		).toBe(400);
	});

	test("canonical management OpenAPI describes explicit sets and returns matching safe metadata", async () => {
		const f = await connectFixture();
		const response = await f.management("/api/connect/openapi.json");
		expect(response.status).toBe(200);
		const contract = connectManagementOpenApi();
		expect(await response.json()).toEqual(contract);
		expect(contract.paths["/api/connect/tokens"]?.post).toMatchObject({
			security: [{ CloudflareAccess: [] }],
		});
		const created = await f.mint("read", [SERVER_A, SERVER_B]);
		const schema = {
			$ref: "#/components/schemas/ConnectToken",
			components: { schemas: CONNECT_SCHEMAS },
		};
		expect(new Validator(schema, "2020-12").validate(created.token).valid).toBe(true);
		expect(JSON.stringify(created.token).includes(created.secret)).toBe(false);
	});
});
