import { readFileSync } from "node:fs";
import type { ConnectToken } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { fingerprint, randomSecret, seal, tokenContext, unseal } from "../../domain/connect.js";
import { app } from "../../index.js";
import { createMockD1 } from "../../test-helpers/mock-d1.js";
import type { Bindings } from "../../types.js";
import { D1ConnectRepository } from "./connect.js";

const migration = readFileSync(
	new URL("../../../migrations/0029_connect_token_servers.sql", import.meta.url),
	"utf8",
);
const SERVER = "migration-original";
const SECOND = "migration-second";

describe("Connect legacy database migration", () => {
	test("preserves ciphertext, confirmations, completed/pending requests and permanent tombstones, including after the original host is deleted", async () => {
		const db = createMockD1(28);
		const keys = JSON.stringify({ active: "old", keys: { old: randomSecret() } });
		const env: Bindings = {
			DB: db,
			ENVIRONMENT: "development",
			CONNECT_DEPLOYMENT_ID: "migration",
			CONNECT_TOKEN_KEYS: keys,
		};
		const now = Math.floor(Date.now() / 1000);
		await db
			.prepare("INSERT INTO hosts(host_id,hostname,last_seen) VALUES (?,?,?),(?,?,?)")
			.bind(SERVER, "Original", now, SECOND, "Second", now)
			.run();
		const legacy = {
			id: "legacy-key",
			server_id: SERVER,
			scope: "write" as const,
			owner: "local:developer",
			expires_at: null,
		};
		const secret = `batc_${randomSecret()}`;
		const ciphertext = await seal(keys, tokenContext("migration", legacy), secret);
		await db
			.prepare(
				"INSERT INTO connect_tokens(id,server_id,name,scope,prefix,token_hash,ciphertext,owner,created_at,last_used_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,7)",
			)
			.bind(
				legacy.id,
				SERVER,
				"Legacy key",
				legacy.scope,
				"batc_legacy…",
				await fingerprint(`migration:${secret}`),
				ciphertext,
				legacy.owner,
				now - 300,
				now - 10,
			)
			.run();
		const challenge = randomSecret();
		await db
			.prepare("INSERT INTO connect_confirmations VALUES (?,?,?,?,?,?)")
			.bind(await fingerprint(challenge), legacy.id, legacy.owner, "reveal", 7, now + 120)
			.run();
		const path = `/api/v1/servers/${SERVER}/description`;
		const body = { description: "Already applied" };
		const requestHash = await fingerprint("legacy-complete");
		const responseContext = JSON.stringify([
			"request",
			"migration",
			SERVER,
			legacy.id,
			requestHash,
		]);
		const responseCiphertext = await seal(keys, responseContext, "");
		for (const [key, state, status, response] of [
			["legacy-complete", "complete", 204, responseCiphertext],
			["legacy-pending", "pending", null, null],
			["legacy-tombstone", "complete", 201, null],
		] as const) {
			await db
				.prepare("INSERT INTO connect_requests VALUES (?,?,?,?,?,?,?,?,?)")
				.bind(
					legacy.id,
					await fingerprint(key),
					await fingerprint(JSON.stringify(["server.description.update", path, "", body])),
					`original-${key}`,
					state,
					status,
					response,
					'"legacy-etag"',
					now - 100,
				)
				.run();
		}
		await db
			.prepare("INSERT INTO connect_audit VALUES (?,?,?,?,?,?,?,?,?)")
			.bind(
				"legacy-audit",
				"legacy-request",
				SERVER,
				legacy.id,
				legacy.owner,
				"management.tokens.create",
				201,
				null,
				now - 300,
			)
			.run();
		const beforeToken = await db.prepare("SELECT * FROM connect_tokens").first();
		const beforeConfirmations = (await db.prepare("SELECT * FROM connect_confirmations").all())
			.results;
		const beforeRequests = (
			await db.prepare("SELECT * FROM connect_requests ORDER BY key_hash").all()
		).results;

		await db.exec(migration);
		expect(await db.prepare("SELECT * FROM connect_tokens").first()).toEqual(beforeToken);
		expect((await db.prepare("SELECT * FROM connect_confirmations").all()).results).toEqual(
			beforeConfirmations,
		);
		expect(
			(await db.prepare("SELECT * FROM connect_requests ORDER BY key_hash").all()).results,
		).toEqual(beforeRequests.map((row) => ({ ...row, server_id: SERVER })));
		expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
		expect(
			await db.prepare("SELECT server_ids FROM connect_audit WHERE id = 'legacy-audit'").first(),
		).toEqual({ server_ids: JSON.stringify([SERVER]) });
		const repo = new D1ConnectRepository(db);
		expect((await repo.token(legacy.id))?.server_ids).toEqual([SERVER]);
		expect(await unseal(keys, responseContext, responseCiphertext)).toBe("");
		const management = (suffix = "", method = "GET", body?: unknown, version = 7) =>
			app.request(
				`http://localhost/api/connect/tokens/${legacy.id}${suffix}`,
				{
					method,
					headers: {
						Origin: "http://localhost",
						"X-Bat-Management": "1",
						"Content-Type": "application/json",
						"If-Match": `"${legacy.id}:${version}"`,
					},
					...(body === undefined ? {} : { body: JSON.stringify(body) }),
				},
				env,
			);
		const reveal = await management("/reveal", "POST", { challenge, confirmation: "Legacy key" });
		expect(reveal.status).toBe(200);
		expect(((await reveal.json()) as { token: string }).token === secret).toBe(true);
		const bearer = (url: string, method = "GET", input?: unknown, key = "") =>
			app.request(
				`http://localhost${url}`,
				{
					method,
					headers: {
						Authorization: `Bearer ${secret}`,
						"Content-Type": "application/json",
						"If-Match": '"legacy-etag"',
						"Idempotency-Key": key,
					},
					...(input === undefined ? {} : { body: JSON.stringify(input) }),
				},
				env,
			);
		const replay = await bearer(path, "PATCH", body, "legacy-complete");
		expect(replay.status).toBe(204);
		expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
		for (const key of ["legacy-pending", "legacy-tombstone"]) {
			const response = await bearer(path, "PATCH", body, key);
			expect(response.status).toBe(409);
			expect(await response.json()).toMatchObject({ error: { code: "outcome_unknown" } });
		}
		const updated = await management("", "PATCH", { serverIds: [SERVER, SECOND] });
		expect(updated.status).toBe(200);
		expect(((await updated.json()) as { data: ConnectToken }).data.serverIds).toEqual([
			SERVER,
			SECOND,
		]);
		await db.prepare("DELETE FROM hosts WHERE host_id = ?").bind(SERVER).run();
		const surviving = await repo.token(legacy.id);
		expect(surviving).toMatchObject({
			server_id: SERVER,
			server_ids: [SECOND],
			version: 9,
			ciphertext,
		});
		expect(
			(await unseal(keys, tokenContext("migration", legacy), surviving?.ciphertext ?? "")) ===
				secret,
		).toBe(true);
		const confirmation = (await (
			await management("/challenge", "POST", { action: "reveal" }, 9)
		).json()) as { challenge: string };
		const repeated = await management(
			"/reveal",
			"POST",
			{ challenge: confirmation.challenge, confirmation: "Legacy key" },
			9,
		);
		expect(repeated.status).toBe(200);
		expect(((await repeated.json()) as { token: string }).token === secret).toBe(true);
		expect((await bearer(`/api/v1/servers/${SECOND}`)).status).toBe(200);
		expect((await bearer("/api/v1/requests/legacy-complete")).status).toBe(404);
		expect(
			(await db.prepare("SELECT * FROM connect_requests ORDER BY key_hash").all()).results,
		).toEqual(beforeRequests.map((row) => ({ ...row, server_id: SERVER })));
		await db
			.prepare("INSERT INTO hosts(host_id,hostname,last_seen) VALUES (?,?,?)")
			.bind(SERVER, "Recreated", now)
			.run();
		expect((await bearer(`/api/v1/servers/${SERVER}`)).status).toBe(403);
		expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
	});

	test("bridges old Worker inserts during deployment and never activates legacy retired-host grants", async () => {
		const db = createMockD1(28);
		await db.exec(
			"INSERT INTO hosts(host_id,hostname,last_seen,is_active) VALUES ('active','Active',1,1),('retired','Retired',1,0)",
		);
		const insertOld = (id: string, server: string) =>
			db
				.prepare(
					"INSERT INTO connect_tokens(id,server_id,name,scope,prefix,token_hash,ciphertext,owner,created_at) VALUES (?,?,?,'read',? ,?,'encrypted','local:developer',1)",
				)
				.bind(id, server, id, id, id)
				.run();
		await insertOld("retired-key", "retired");
		await db.exec(migration);
		await insertOld("old-worker-one", "active");
		await insertOld("old-worker-two", "active");
		await db.exec(
			"INSERT INTO connect_requests(token_id,key_hash,fingerprint,request_id,state,created_at) VALUES ('old-worker-one','key','fingerprint','request','pending',1)",
		);
		expect(
			(
				await db
					.prepare("SELECT token_id,server_id FROM connect_token_servers ORDER BY token_id")
					.all()
			).results,
		).toEqual([
			{ token_id: "old-worker-one", server_id: "active" },
			{ token_id: "old-worker-two", server_id: "active" },
		]);
		expect(await db.prepare("SELECT server_id FROM connect_requests").first()).toEqual({
			server_id: "active",
		});
		await db.exec("UPDATE hosts SET is_active = 1 WHERE host_id = 'retired'");
		expect((await new D1ConnectRepository(db).token("retired-key"))?.server_ids).toEqual([]);
		await expect(
			db.prepare("INSERT INTO connect_token_servers VALUES ('old-worker-one','active')").run(),
		).rejects.toThrow("UNIQUE");
		expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
	});
});
