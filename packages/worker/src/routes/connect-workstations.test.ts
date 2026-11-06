// Connect workstation read integration: explicit grants, read-only access and
// server-scoped connectivity privacy.

import type { ConnectToken } from "@bat/shared";
import { Validator } from "@cfworker/json-schema";
import { describe, expect, test } from "vitest";
import {
	CONNECT_SCHEMAS,
	connectOpenApi,
	connectResponseSchema,
} from "../domain/connect-contract.js";
import { CONNECT_OPERATIONS } from "../domain/connect-operations.js";
import {
	connectFixture,
	SERVER_A,
	SERVER_B,
	WORKSTATION_A,
	WORKSTATION_B,
} from "../test-helpers/connect.js";

function operation(id: string) {
	const found = CONNECT_OPERATIONS.find((entry) => entry.id === id);
	if (!found) throw new Error(`Unknown operation ${id}`);
	return found;
}

function validate(operationId: string, body: unknown): boolean {
	return new Validator(
		{ ...connectResponseSchema(operation(operationId)), components: { schemas: CONNECT_SCHEMAS } },
		"2020-12",
	).validate(body).valid;
}

interface WorkstationBody {
	data: {
		id: string;
		disabled: boolean;
		latest_report: {
			connectivity: { server_id: string; address: string; status: string }[];
		} | null;
	};
	workstationIds: string[];
}

interface WorkstationListBody {
	data: { id: string; latest_report: { connectivity: { server_id: string }[] } | null }[];
	page: { limit: number; nextCursor: string | null };
	serverIds: string[];
	workstationIds: string[];
}

describe("Connect workstation grants", () => {
	test("existing and newly created server-only keys never gain workstations implicitly", async () => {
		const f = await connectFixture();
		const { token } = await f.mint("read");
		expect(token.workstationIds).toEqual([]);
		expect(token.serverIds).toEqual([SERVER_A]);
		const body = (await (
			await f.request("/api/v1/capabilities", (await f.mint("read")).secret)
		).json()) as { workstationIds: string[] };
		expect(body.workstationIds).toEqual([]);
		const list = await f.request("/api/v1/workstations", (await f.mint("read")).secret);
		expect(await list.json()).toMatchObject({ data: [], workstationIds: [] });
	});

	test("a workstation-only read key reads the snapshot but no connectivity", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [], null, [WORKSTATION_A]);
		expect(key.token.serverIds).toEqual([]);
		expect(key.token.workstationIds).toEqual([WORKSTATION_A]);

		const capabilities = (await (await f.request("/api/v1/capabilities", key.secret)).json()) as {
			serverIds: string[];
			workstationIds: string[];
		};
		expect(capabilities.serverIds).toEqual([]);
		expect(capabilities.workstationIds).toEqual([WORKSTATION_A]);

		const head = await f.request("/api/v1/workstations", key.secret, "HEAD");
		expect(head.status).toBe(200);
		expect(await head.text()).toBe("");
		const list = await f.request("/api/v1/workstations", key.secret);
		const listBody = (await list.json()) as WorkstationListBody;
		expect(listBody.data.map((entry) => entry.id)).toEqual([WORKSTATION_A]);
		expect(listBody.serverIds).toEqual([]);
		expect(listBody.workstationIds).toEqual([WORKSTATION_A]);
		expect(listBody.data[0]?.latest_report?.connectivity).toEqual([]);
		expect(validate("workstations.list", listBody)).toBe(true);

		const detail = await f.call("workstation.get", key.secret);
		const detailBody = (await detail.json()) as WorkstationBody;
		expect(detailBody.data.id).toBe(WORKSTATION_A);
		expect(detailBody.data.latest_report?.connectivity).toEqual([]);
		expect(validate("workstation.get", detailBody)).toBe(true);

		const connectivity = await f.call("workstation.connectivity", key.secret);
		const connectivityBody = (await connectivity.json()) as {
			targets: unknown[];
			limit: number;
			workstationIds: string[];
		};
		expect(connectivityBody.targets).toEqual([]);
		expect(validate("workstation.connectivity", connectivityBody)).toBe(true);
	});

	test("a mixed key sees only its authorized servers inside workstation reads", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [SERVER_A], null, [WORKSTATION_A]);
		const detail = await f.call("workstation.get", key.secret);
		const body = (await detail.json()) as unknown as WorkstationBody;
		expect(body.data.latest_report?.connectivity.map((entry) => entry.server_id)).toEqual([
			SERVER_A,
		]);
		expect(JSON.stringify(body).includes(SERVER_B)).toBe(false);
		expect(JSON.stringify(body).includes("8.8.4.4")).toBe(false);

		const connectivity = await f.call("workstation.connectivity", key.secret);
		const history = (await connectivity.json()) as {
			targets: { server_id: string; address: string; data: unknown[] }[];
		};
		expect(history.targets.map((target) => target.server_id)).toEqual([SERVER_A]);
		expect(history.targets[0]?.address).toBe("8.8.8.8");
		expect(history.targets[0]?.data).toHaveLength(1);

		const head = await f.request("/api/v1/workstations", key.secret, "HEAD");
		expect(head.status).toBe(200);
		expect(await head.text()).toBe("");
		const list = await f.request("/api/v1/workstations", key.secret);
		const listText = await list.text();
		expect(listText.includes(SERVER_B) || listText.includes("8.8.4.4")).toBe(false);
	});

	test("metrics history is authorized for the workstation grant alone", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [], null, [WORKSTATION_A]);
		const response = await f.call("workstation.metrics", key.secret);
		const body = (await response.json()) as {
			data: { uptime_seconds: number }[];
			page: { limit: number; offset: number; next_offset: number | null };
			workstationIds: string[];
		};
		expect(body.data).toHaveLength(1);
		expect(body.data[0]?.uptime_seconds).toBe(86_400);
		expect(body.workstationIds).toEqual([WORKSTATION_A]);
		expect(validate("workstation.metrics", body)).toBe(true);
	});

	test("an unauthorized workstation is denied and never partially disclosed", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [], null, [WORKSTATION_A]);
		const denied = await f.call("workstation.get", key.secret, undefined, {
			workstationId: WORKSTATION_B,
		});
		expect(denied.status).toBe(403);
		expect((await denied.text()).includes("Foreign laptop")).toBe(false);
		const deniedHistory = await f.call("workstation.connectivity", key.secret, undefined, {
			workstationId: WORKSTATION_B,
		});
		expect(deniedHistory.status).toBe(403);
		const missing = await f.call("workstation.get", key.secret, undefined, {
			workstationId: "99999999-9999-4999-8999-999999999999",
		});
		expect(missing.status).toBe(403);
	});

	test("an empty key can enumerate nothing and an expired or revoked key is rejected", async () => {
		const f = await connectFixture();
		const empty = await f.mint("read", [], null, []);
		expect(await (await f.request("/api/v1/workstations", empty.secret)).json()).toMatchObject({
			data: [],
		});
		expect((await f.call("workstation.get", empty.secret)).status).toBe(403);

		// Self-revocation through the management API invalidates workstation reads
		// on the next request without any cache.
		const key = await f.mint("read", [], null, [WORKSTATION_A]);
		const challenge = (await (
			await f.management(
				`/api/connect/tokens/${key.token.id}/challenge`,
				"POST",
				{ action: "revoke" },
				key.token,
			)
		).json()) as { challenge: string };
		const revoked = await f.management(
			`/api/connect/tokens/${key.token.id}/revoke`,
			"POST",
			{ challenge: challenge.challenge, confirmation: key.token.name },
			key.token,
		);
		expect(revoked.status).toBe(200);
		const after = await f.request("/api/v1/workstations", key.secret);
		expect(after.status).toBe(401);
	});

	test("a mixed key stays manageable and revocable after its workstation is disabled", async () => {
		const f = await connectFixture();
		const key = await f.mint("write", [SERVER_A], null, [WORKSTATION_A, WORKSTATION_B]);
		await f.db
			.prepare("UPDATE workstations SET disabled = 1 WHERE id = ?")
			.bind(WORKSTATION_A)
			.run();

		const listed = (await (await f.management("/api/connect/tokens")).json()) as {
			data: ConnectToken[];
		};
		expect(listed.data.map((row) => row.id)).toContain(key.token.id);
		expect((await f.management(`/api/connect/tokens/${key.token.id}`, "GET")).status).toBe(200);

		// Retaining the now-disabled grant is allowed; granting a disabled one is not.
		const retained = await f.management(
			`/api/connect/tokens/${key.token.id}`,
			"PATCH",
			{ serverIds: [SERVER_A], workstationIds: [WORKSTATION_A, WORKSTATION_B] },
			key.token,
		);
		expect(retained.status).toBe(200);
		const retainedToken = ((await retained.json()) as { data: ConnectToken }).data;
		const fresh = await f.mint("read", [SERVER_A], null, [WORKSTATION_B]);
		await f.db
			.prepare("UPDATE workstations SET disabled = 1 WHERE id = ?")
			.bind(WORKSTATION_B)
			.run();
		const widened = await f.management(
			`/api/connect/tokens/${fresh.token.id}`,
			"PATCH",
			{ workstationIds: [WORKSTATION_B, WORKSTATION_A] },
			fresh.token,
		);
		expect(widened.status).toBe(403);
		const deniedCreate = await f.management("/api/connect/tokens", "POST", {
			name: "Disabled grant",
			scope: "read",
			serverIds: [],
			workstationIds: [WORKSTATION_A],
		});
		expect(deniedCreate.status).toBe(403);

		// Revocation still works for the mixed key and invalidates the credential.
		const challenge = (await (
			await f.management(
				`/api/connect/tokens/${retainedToken.id}/challenge`,
				"POST",
				{ action: "revoke" },
				retainedToken,
			)
		).json()) as { challenge: string };
		const revoked = await f.management(
			`/api/connect/tokens/${retainedToken.id}/revoke`,
			"POST",
			{ challenge: challenge.challenge, confirmation: retainedToken.name },
			retainedToken,
		);
		expect(revoked.status).toBe(200);
		expect((await f.request("/api/v1/workstations", key.secret)).status).toBe(401);
	});

	test("disabling or deleting a workstation revokes the grant on the next request", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [], null, [WORKSTATION_A]);
		expect((await f.request("/api/v1/workstations", key.secret)).status).toBe(200);
		await f.db
			.prepare("UPDATE workstations SET disabled = 1 WHERE id = ?")
			.bind(WORKSTATION_A)
			.run();
		const disabled = await f.request("/api/v1/workstations", key.secret);
		expect(await disabled.json()).toMatchObject({ data: [], workstationIds: [] });
		expect((await f.call("workstation.get", key.secret)).status).toBe(403);
		await f.db.prepare("DELETE FROM workstations WHERE id = ?").bind(WORKSTATION_A).run();
		const junctions = await f.db
			.prepare("SELECT COUNT(*) AS n FROM connect_token_workstations WHERE workstation_id = ?")
			.bind(WORKSTATION_A)
			.first<{ n: number }>();
		expect(junctions?.n).toBe(0);
		expect((await f.request("/api/v1/workstations", key.secret)).status).toBe(200);
	});

	test("write scope cannot mutate, enroll or report through Connect", async () => {
		const f = await connectFixture();
		const key = await f.mint("write", [], null, [WORKSTATION_A]);
		expect((await f.request("/api/v1/workstations", key.secret)).status).toBe(200);
		for (const [method, path] of [
			["POST", "/api/v1/workstations"],
			["POST", `/api/v1/workstations/${WORKSTATION_A}`],
			["POST", `/api/v1/workstations/${WORKSTATION_A}/reports`],
			["DELETE", `/api/v1/workstations/${WORKSTATION_A}`],
			["PATCH", `/api/v1/workstations/${WORKSTATION_A}`],
			["POST", "/api/v1/workstation-auth/authorize"],
			["POST", "/api/v1/workstation-probe/reports"],
		] as const) {
			const response = await f.request(path, key.secret, method, {});
			expect(response.status, `${method} ${path}`).toBe(501);
		}
	});

	test("legacy asset keys and the static write key cannot read workstations", async () => {
		const f = await connectFixture();
		for (const secret of ["legacy-write", "legacy-read"]) {
			const response = await f.request("/api/v1/workstations", secret);
			expect(response.status).toBe(401);
		}
	});

	test("a granted workstation without a report is listed with a null snapshot", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [], null, [WORKSTATION_A, WORKSTATION_B]);
		const head = await f.request("/api/v1/workstations", key.secret, "HEAD");
		expect(head.status).toBe(200);
		expect(await head.text()).toBe("");
		const list = await f.request("/api/v1/workstations", key.secret);
		const body = (await list.json()) as {
			data: { id: string; latest_report: unknown }[];
		};
		expect(body.data.map((row) => row.id).sort()).toEqual([WORKSTATION_A, WORKSTATION_B]);
		expect(body.data.find((row) => row.id === WORKSTATION_B)?.latest_report).toBeNull();
	});

	test("a malformed workstation path is rejected as invalid, not as missing", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [], null, [WORKSTATION_A]);
		const response = await f.request("/api/v1/workstations/%E0%A4%A", key.secret);
		expect(response.status).toBe(400);
	});

	test("opaque collection and target errors never reach Connect clients", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [SERVER_A], null, [WORKSTATION_A]);
		const detail = await f.request(`/api/v1/workstations/${WORKSTATION_A}`, key.secret);
		const detailText = await detail.text();
		for (const forbidden of [SERVER_B, "8.8.4.4", "Foreign", "unreachable"]) {
			expect(detailText.includes(forbidden), `detail leaked ${forbidden}`).toBe(false);
		}
		const detailBody = JSON.parse(detailText) as {
			data: { latest_report: { collection_errors: string[]; targets_error: string | null } };
		};
		expect(detailBody.data.latest_report.collection_errors).toEqual([]);
		expect(detailBody.data.latest_report.targets_error).toBeNull();
		const listText = await (await f.request("/api/v1/workstations", key.secret)).text();
		for (const forbidden of [SERVER_B, "8.8.4.4", "Foreign", "unreachable"]) {
			expect(listText.includes(forbidden), `list leaked ${forbidden}`).toBe(false);
		}
	});

	test("no response leaks another workstation's identifier", async () => {
		const f = await connectFixture();
		const key = await f.mint("read", [SERVER_A], null, [WORKSTATION_A]);
		for (const path of ["/api/v1/workstations", `/api/v1/workstations/${WORKSTATION_A}`]) {
			const text = await (await f.request(path, key.secret)).text();
			expect(text.includes(WORKSTATION_B)).toBe(false);
			expect(text.includes("Foreign laptop")).toBe(false);
		}
	});

	test("OpenAPI and capabilities expose the workstation set and read-only operations", async () => {
		const contract = connectOpenApi();
		expect(contract.components?.schemas).toHaveProperty("WorkstationRecord");
		const capabilities = contract.paths["/api/v1/workstations"]?.get as {
			operationId: string;
		};
		expect(capabilities.operationId).toBe("workstations.list");
		const listSchema = connectResponseSchema(operation("workstations.list")) as {
			required: string[];
		};
		expect(listSchema.required).toContain("workstationIds");
		expect(listSchema.required).toContain("serverIds");
		const detailSchema = connectResponseSchema(operation("workstation.get")) as {
			required: string[];
		};
		expect(detailSchema.required).toEqual(["data", "requestId", "workstationIds"]);
		const schema = (contract.components?.schemas as Record<string, { required?: string[] }>)
			?.ConnectToken;
		expect(schema?.required).toContain("workstationIds");
		for (const id of [
			"workstations.list",
			"workstation.get",
			"workstation.metrics",
			"workstation.connectivity",
		])
			expect(operation(id).method, id).toBe("GET");
	});

	test("management grants stay explicit, authorized and complete", async () => {
		const f = await connectFixture();
		const created = await f.management("/api/connect/tokens", "POST", {
			name: "Workstation reader",
			scope: "read",
			serverIds: [],
			workstationIds: [WORKSTATION_A],
		});
		expect(created.status).toBe(201);
		const token = ((await created.json()) as { data: ConnectToken }).data;
		expect(token.workstationIds).toEqual([WORKSTATION_A]);
		expect(token.serverIds).toEqual([]);

		const list = (await (await f.management("/api/connect/tokens")).json()) as {
			data: ConnectToken[];
		};
		expect(list.data.find((entry) => entry.id === token.id)?.workstationIds).toEqual([
			WORKSTATION_A,
		]);

		const granted = await f.management(
			`/api/connect/tokens/${token.id}`,
			"PATCH",
			{ serverIds: [SERVER_A], workstationIds: [WORKSTATION_A] },
			token,
		);
		expect(granted.status).toBe(200);
		const edited = ((await granted.json()) as { data: ConnectToken }).data;
		expect(edited.serverIds).toEqual([SERVER_A]);
		expect(edited.workstationIds).toEqual([WORKSTATION_A]);

		const legacy = await f.management(`/api/connect/servers/${SERVER_A}/tokens`, "POST", {
			name: "Legacy",
			scope: "read",
			serverIds: [SERVER_A],
		});
		expect(legacy.status).toBe(201);
		const legacyToken = ((await legacy.json()) as { data: ConnectToken }).data;
		expect(legacyToken.workstationIds).toEqual([]);
		expect(
			(
				await f.management(`/api/connect/servers/${SERVER_A}/tokens`, "POST", {
					name: "Legacy workstation",
					scope: "read",
					workstationIds: [WORKSTATION_A],
				})
			).status,
		).toBe(400);

		expect(
			(
				await f.management("/api/connect/tokens", "POST", {
					name: "Foreign workstation",
					scope: "read",
					serverIds: [],
					workstationIds: ["99999999-9999-4999-8999-999999999999"],
				})
			).status,
		).toBe(403);
		expect(
			(
				await f.management("/api/connect/tokens", "POST", {
					name: "Malformed workstation",
					scope: "read",
					serverIds: [],
					workstationIds: ["not-a-uuid"],
				})
			).status,
		).toBe(400);
		// Explicit edits are additive and audited; the global manager may grant a
		// second workstation, while malformed or unknown IDs stay rejected.
		const widened = await f.management(
			`/api/connect/tokens/${token.id}`,
			"PATCH",
			{ workstationIds: [WORKSTATION_A, WORKSTATION_B] },
			edited,
		);
		expect(widened.status).toBe(200);
		expect(((await widened.json()) as { data: ConnectToken }).data.workstationIds).toEqual([
			WORKSTATION_A,
			WORKSTATION_B,
		]);
	});
});
