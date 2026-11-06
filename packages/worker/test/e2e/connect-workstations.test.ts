// L2 — Connect workstation reads over real local HTTP.
//
// Covers explicit workstation grants, ws-only/mixed/empty keys, read-only
// enforcement, per-server connectivity privacy, revocation immediacy, the
// deployment-wide monitoring lane and denial for static keys. The launcher
// injects the local Access fixture for browser management requests.

import { createHash, randomUUID } from "node:crypto";
import type { ConnectToken } from "@bat/shared";
import { describe, expect, test } from "vitest";
import { BASE, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const VERIFIER = "w".repeat(64);
const CALLBACK = "http://127.0.0.1:8765/callback";

function challenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

const managementHeaders = {
	"Content-Type": "application/json",
	Origin: BASE,
	"X-Bat-Management": "1",
};

function management(path: string, method = "GET", body?: unknown, token?: ConnectToken) {
	return fetch(`${BASE}${path}`, {
		method,
		headers: {
			...managementHeaders,
			...(token ? { "If-Match": `"${token.id}:${token.version}"` } : {}),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
}

async function enroll(name: string): Promise<{ id: string; token: string }> {
	const installation = randomUUID();
	const authorized = await fetch(`${BASE}/api/workstation-auth/authorize`, {
		method: "POST",
		headers: managementHeaders,
		body: JSON.stringify({
			installation_id: installation,
			code_challenge: challenge(VERIFIER),
			code_challenge_method: "S256",
			state: `e2e-connect-state-${installation.slice(0, 8)}`,
			callback: CALLBACK,
			name,
		}),
	});
	if (authorized.status !== 201) throw new Error(`authorize ${authorized.status}`);
	const { redirect_url } = (await authorized.json()) as { redirect_url: string };
	const code = new URL(redirect_url).searchParams.get("code") as string;
	const exchanged = await fetch(`${BASE}/api/workstation-auth/exchange`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ code, code_verifier: VERIFIER, installation_id: installation }),
	});
	if (exchanged.status !== 200) throw new Error(`exchange ${exchanged.status}`);
	const issued = (await exchanged.json()) as { workstation_id: string; token: string };
	return { id: issued.workstation_id, token: issued.token };
}

async function reveal(token: ConnectToken): Promise<string> {
	const nonce = (await (
		await management(
			`/api/connect/tokens/${token.id}/challenge`,
			"POST",
			{ action: "reveal" },
			token,
		)
	).json()) as { challenge: string };
	const revealed = await management(
		`/api/connect/tokens/${token.id}/reveal`,
		"POST",
		{ challenge: nonce.challenge, confirmation: token.name },
		token,
	);
	if (revealed.status !== 200) throw new Error(`reveal ${revealed.status}`);
	return ((await revealed.json()) as { token: string }).token;
}

async function mint(
	body: Record<string, unknown>,
): Promise<{ token: ConnectToken; secret: string }> {
	const created = await management("/api/connect/tokens", "POST", body);
	if (created.status !== 201) throw new Error(`mint ${created.status}: ${await created.text()}`);
	const token = ((await created.json()) as { data: ConnectToken }).data;
	return { token, secret: await reveal(token) };
}

function bearer(path: string, secret: string, method = "GET") {
	return fetch(`${BASE}${path}`, {
		method,
		headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
	});
}

describe("L2: Connect workstation reads", () => {
	test("ws-only, mixed, empty, denied, read-only and revoked keys", async () => {
		const serverId = `e2e-ws-connect-${randomUUID().slice(0, 8)}`;
		const serverIdTwo = `e2e-ws-connect-${randomUUID().slice(0, 8)}`;
		// Two distinct servers behind one NAT address: the report must accept the
		// shared public IP and Connect must return both authorized entries.
		const publicIp = "8.8.8.8";
		for (const host of [serverId, serverIdTwo])
			expect(
				(
					await fetch(`${BASE}/api/identity`, {
						method: "POST",
						headers: writeHeaders(),
						body: JSON.stringify({ ...makeIdentityPayload(host), public_ip: publicIp }),
					})
				).status,
			).toBe(204);

		const primary = await enroll("Connect laptop");
		const other = await enroll("Private laptop");
		const finished = Math.floor(Date.now() / 1000);
		const report = await fetch(`${BASE}/api/workstation-probe/reports`, {
			method: "POST",
			headers: { Authorization: `Bearer ${primary.token}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				report_id: randomUUID(),
				started_at: finished - 10,
				finished_at: finished,
				sample_window_ms: 10_000,
				cli_version: "2.5.0",
				hostname: "connect-laptop",
				os: "macOS 15.2",
				arch: "arm64",
				uptime_seconds: 86_400,
				cpu: { model: "Apple M3 Pro", count: 12, usage_pct: 12.5 },
				mem: {
					total_bytes: 36_000_000_000,
					available_bytes: 12_000_000_000,
					used_pct: 66.7,
				},
				disk: [
					{
						mount: "/",
						total_bytes: 994_662_584_320,
						available_bytes: 397_284_917_248,
						used_pct: 60.1,
					},
				],
				network: { interfaces: [{ name: "en0", addresses: [] }] },
				connectivity: [
					{
						server_id: serverId,
						address: publicIp,
						family: 4,
						sent: 3,
						received: 3,
						rtts_ms: [8, 9, 10],
						status: "reachable",
					},
					{
						server_id: serverIdTwo,
						address: publicIp,
						family: 4,
						sent: 3,
						received: 0,
						rtts_ms: [null, null, null],
						status: "timeout",
					},
				],
				collection_errors: [],
				targets_error: null,
			}),
		});
		expect(report.status).toBe(200);

		const wsOnly = await mint({
			name: "Laptop capacity",
			scope: "read",
			serverIds: [],
			workstationIds: [primary.id],
		});
		expect(wsOnly.token.workstationIds).toEqual([primary.id]);
		expect(wsOnly.token.serverIds).toEqual([]);

		const list = await fetch(`${BASE}/api/v1/workstations`, {
			headers: { Authorization: `Bearer ${wsOnly.secret}` },
		});
		expect(list.status).toBe(200);
		const listBody = (await list.json()) as {
			data: { id: string; latest_report: { connectivity: unknown[] } | null }[];
			serverIds: string[];
			workstationIds: string[];
		};
		expect(listBody.workstationIds).toEqual([primary.id]);
		expect(listBody.serverIds).toEqual([]);
		expect(listBody.data.map((row) => row.id)).toEqual([primary.id]);
		expect(listBody.data[0]?.latest_report?.connectivity).toEqual([]);
		expect(JSON.stringify(listBody).includes(other.id)).toBe(false);

		const detail = await fetch(`${BASE}/api/v1/workstations/${primary.id}`, {
			headers: { Authorization: `Bearer ${wsOnly.secret}` },
		});
		expect(detail.status).toBe(200);
		const detailBody = (await detail.json()) as {
			data: { id: string; latest_report: { connectivity: unknown[] } };
			workstationIds: string[];
		};
		expect(detailBody.data.latest_report.connectivity).toEqual([]);
		expect(detailBody.workstationIds).toEqual([primary.id]);

		const from = finished - 3_600;
		const to = finished + 60;
		const metrics = await fetch(
			`${BASE}/api/v1/workstations/${primary.id}/metrics?from=${from}&to=${to}&limit=10`,
			{ headers: { Authorization: `Bearer ${wsOnly.secret}` } },
		);
		expect(metrics.status).toBe(200);
		const metricsBody = (await metrics.json()) as {
			data: { uptime_seconds: number }[];
			page: { limit: number; offset: number; next_offset: number | null };
		};
		expect(metricsBody.data).toHaveLength(1);
		expect(metricsBody.data[0]?.uptime_seconds).toBe(86_400);

		const connectivity = await fetch(
			`${BASE}/api/v1/workstations/${primary.id}/connectivity?from=${from}&to=${to}&limit=10`,
			{ headers: { Authorization: `Bearer ${wsOnly.secret}` } },
		);
		expect(connectivity.status).toBe(200);
		expect(await connectivity.json()).toMatchObject({ targets: [], limit: 10 });

		const mixed = await mint({
			name: "Laptop and servers",
			scope: "read",
			serverIds: [serverId, serverIdTwo],
			workstationIds: [primary.id],
		});
		const mixedDetail = await bearer(`/api/v1/workstations/${primary.id}`, mixed.secret);
		const mixedBody = (await mixedDetail.json()) as {
			data: { latest_report: { connectivity: { server_id: string; address: string }[] } };
		};
		// One shared public address, two distinct authorized servers.
		expect(mixedBody.data.latest_report.connectivity.map((entry) => entry.server_id)).toEqual([
			serverId,
			serverIdTwo,
		]);
		expect(mixedBody.data.latest_report.connectivity.map((entry) => entry.address)).toEqual([
			publicIp,
			publicIp,
		]);
		const mixedHistory = await bearer(
			`/api/v1/workstations/${primary.id}/connectivity?from=${from}&to=${to}&limit=10`,
			mixed.secret,
		);
		const mixedHistoryBody = (await mixedHistory.json()) as {
			targets: { server_id: string; address: string; data: unknown[] }[];
		};
		expect(mixedHistoryBody.targets).toHaveLength(2);
		expect(mixedHistoryBody.targets.map((target) => target.server_id).sort()).toEqual(
			[serverId, serverIdTwo].sort(),
		);
		expect(mixedHistoryBody.targets.map((target) => target.address)).toEqual([publicIp, publicIp]);

		expect((await bearer(`/api/v1/workstations/${other.id}`, wsOnly.secret)).status).toBe(403);

		const empty = await mint({
			name: "Nothing",
			scope: "read",
			serverIds: [],
			workstationIds: [],
		});
		expect(await (await bearer("/api/v1/workstations", empty.secret)).json()).toMatchObject({
			data: [],
			workstationIds: [],
		});

		const write = await mint({
			name: "Write laptop",
			scope: "write",
			serverIds: [],
			workstationIds: [primary.id],
		});
		expect((await bearer("/api/v1/workstations", write.secret)).status).toBe(200);
		expect(
			(await bearer(`/api/v1/workstations/${primary.id}/reports`, write.secret, "POST")).status,
		).toBe(501);
		expect(
			(await bearer(`/api/v1/workstations/${primary.id}`, write.secret, "DELETE")).status,
		).toBe(501);
		expect((await bearer("/api/v1/workstations", write.secret, "POST")).status).toBe(501);

		const revokeChallenge = (await (
			await management(
				`/api/connect/tokens/${wsOnly.token.id}/challenge`,
				"POST",
				{ action: "revoke" },
				wsOnly.token,
			)
		).json()) as { challenge: string };
		expect(
			(
				await management(
					`/api/connect/tokens/${wsOnly.token.id}/revoke`,
					"POST",
					{ challenge: revokeChallenge.challenge, confirmation: wsOnly.token.name },
					wsOnly.token,
				)
			).status,
		).toBe(200);
		expect((await bearer("/api/v1/workstations", wsOnly.secret)).status).toBe(401);

		const readKey = await fetch(`${BASE}/api/monitoring/workstations`, { headers: readHeaders() });
		expect(readKey.status).toBe(200);
		const monitoring = (await readKey.json()) as { id: string }[];
		expect(monitoring.map((row) => row.id)).toContain(primary.id);
		const monitoringDetail = await fetch(`${BASE}/api/monitoring/workstations/${primary.id}`, {
			headers: readHeaders(),
		});
		expect(monitoringDetail.status).toBe(200);
		const monitoringMetrics = await fetch(
			`${BASE}/api/monitoring/workstations/${primary.id}/metrics?from=${from}&to=${to}&limit=5`,
			{ headers: readHeaders() },
		);
		expect(await monitoringMetrics.json()).toMatchObject({
			data: [{ uptime_seconds: 86_400 }],
			page: { limit: 5 },
		});
		const monitoringConnectivity = await fetch(
			`${BASE}/api/monitoring/workstations/${primary.id}/connectivity?from=${from}&to=${to}`,
			{ headers: readHeaders() },
		);
		expect(monitoringConnectivity.status).toBe(200);

		const writeKey = await fetch(`${BASE}/api/v1/workstations`, { headers: writeHeaders() });
		expect(writeKey.status).toBe(401);
		const writeKeyMonitoring = await fetch(`${BASE}/api/monitoring/workstations`, {
			headers: writeHeaders(),
		});
		expect(writeKeyMonitoring.status).toBe(403);
	});
});
