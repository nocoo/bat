import type { ConnectToken } from "@bat/shared";
import { expect, test } from "vitest";
import { BASE, makeIdentityPayload, writeHeaders } from "./helpers.js";

const A = "e2e-connect-multi-a",
	B = "e2e-connect-multi-b";
const managementHeaders = {
	"Content-Type": "application/json",
	Origin: BASE,
	"X-Bat-Management": "1",
};
const get = (path: string) => fetch(`${BASE}${path}`, { headers: managementHeaders });
const post = (path: string, body: unknown, token?: ConnectToken) =>
	fetch(`${BASE}${path}`, {
		method: "POST",
		headers: {
			...managementHeaders,
			...(token ? { "If-Match": `"${token.id}:${token.version}"` } : {}),
		},
		body: JSON.stringify(body),
	});
const patch = (path: string, body: unknown, token: ConnectToken) =>
	fetch(`${BASE}${path}`, {
		method: "PATCH",
		headers: { ...managementHeaders, "If-Match": `"${token.id}:${token.version}"` },
		body: JSON.stringify(body),
	});
async function metadata(response: Response, status = 200) {
	expect(response.status).toBe(status);
	return ((await response.json()) as { data: ConnectToken }).data;
}
async function challenge(token: ConnectToken, action: "reveal" | "rotate" | "revoke") {
	const response = await post(`/api/connect/tokens/${token.id}/challenge`, { action }, token);
	expect(response.status).toBe(200);
	return ((await response.json()) as { challenge: string }).challenge;
}
async function reveal(token: ConnectToken) {
	const response = await post(
		`/api/connect/tokens/${token.id}/reveal`,
		{ challenge: await challenge(token, "reveal"), confirmation: token.name },
		token,
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("Cache-Control")).toContain("no-store");
	return ((await response.json()) as { token: string }).token;
}

test("many-to-many keys share server CAS, preserve independent server revisions, and change live authorization through the canonical management API", async () => {
	for (const server of [A, B]) {
		expect(
			(
				await fetch(`${BASE}/api/identity`, {
					method: "POST",
					headers: writeHeaders(),
					body: JSON.stringify(makeIdentityPayload(server)),
				})
			).status,
		).toBe(204);
	}
	let multi = await metadata(
		await post("/api/connect/tokens", { name: "HTTP multi", scope: "write", serverIds: [B, A, B] }),
		201,
	);
	let peer = await metadata(
		await post("/api/connect/tokens", {
			name: "HTTP shared server",
			scope: "write",
			serverIds: [A],
		}),
		201,
	);
	expect(multi.serverIds).toEqual([A, B]);
	expect(multi.expiresAt).toBeNull();
	const secret = await reveal(multi),
		peerSecret = await reveal(peer);
	const empty = await metadata(
		await post("/api/connect/tokens", { name: "HTTP no servers", scope: "read", serverIds: [] }),
		201,
	);
	expect(empty.serverIds).toEqual([]);
	const inventory = await get("/api/connect/tokens");
	expect(inventory.status).toBe(200);
	const inventoryText = await inventory.text();
	expect(inventoryText.includes(secret) || inventoryText.includes(peerSecret)).toBe(false);
	const contract = await get("/api/connect/openapi.json");
	expect(contract.status).toBe(200);
	expect(await contract.json()).toMatchObject({
		openapi: "3.1.0",
		paths: { "/api/connect/tokens": { post: { security: [{ CloudflareAccess: [] }] } } },
	});

	const request = (
		path: string,
		credential = secret,
		method = "GET",
		body?: unknown,
		headers: Record<string, string> = {},
	) =>
		fetch(`${BASE}${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${credential}`,
				"Content-Type": "application/json",
				...headers,
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		});
	const serverEtag = async (server: string, credential = secret) => {
		const response = await request(`/api/v1/servers/${server}`, credential);
		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toContain("no-transform");
		const etag = response.headers.get("ETag") ?? "";
		expect(etag).toMatch(/^"[^"\s]+"$/);
		return etag;
	};
	const change = (server: string, etag: string, key: string, credential = secret) =>
		request(
			`/api/v1/servers/${server}/description`,
			credential,
			"PATCH",
			{ description: key },
			{ "If-Match": etag, "Idempotency-Key": key },
		);
	expect(await (await request("/api/v1/capabilities")).json()).toMatchObject({
		serverIds: [A, B],
		permissions: ["read", "write"],
	});
	expect(await (await request("/api/v1/servers")).json()).toMatchObject({
		data: [{ host_id: A }, { host_id: B }],
		serverIds: [A, B],
	});
	expect((await request(`/api/v1/servers/${B}`, peerSecret)).status).toBe(403);
	const aEtag = await serverEtag(A),
		bEtag = await serverEtag(B);
	expect(await serverEtag(A, peerSecret)).toBe(aEtag);
	expect(aEtag).not.toBe(bEtag);
	expect((await change(B, aEtag, "multi-wrong-server-etag")).status).toBe(412);
	const concurrent = await Promise.all([
		change(A, aEtag, "multi-racing-first"),
		change(A, aEtag, "multi-racing-second", peerSecret),
	]);
	expect(concurrent.map((response) => response.status).sort()).toEqual([204, 412]);
	expect(await serverEtag(B)).toBe(bEtag);
	const freshA = await serverEtag(A);
	expect((await change(A, freshA, "multi-original-intent")).status).toBe(204);
	const replay = await change(A, freshA, "multi-original-intent");
	expect(replay.status).toBe(204);
	expect(replay.headers.get("Idempotency-Replayed")).toBe("true");
	expect((await change(B, bEtag, "multi-original-intent")).status).toBe(409);
	expect((await request("/api/v1/requests/multi-original-intent")).status).toBe(200);

	const replacements = await Promise.all([
		patch(`/api/connect/tokens/${multi.id}`, { serverIds: [B] }, multi),
		patch(`/api/connect/tokens/${multi.id}`, { serverIds: [] }, multi),
	]);
	expect(replacements.map((response) => response.status).sort()).toEqual([200, 412]);
	multi = await metadata(replacements.find((response) => response.status === 200) as Response);
	multi = await metadata(
		await patch(
			`/api/connect/tokens/${multi.id}`,
			{ serverIds: [B], scope: "read", expiresAt: "2099-01-01T00:00:00Z" },
			multi,
		),
	);
	expect(multi.scope).toBe("read");
	expect(multi.expiresAt).toBe("2099-01-01T00:00:00.000Z");
	expect((await reveal(multi)) === secret).toBe(true);
	expect((await request(`/api/v1/servers/${A}`)).status).toBe(403);
	expect((await request(`/api/v1/servers/${B}`)).status).toBe(200);
	expect((await change(B, bEtag, "multi-read-denied")).status).toBe(403);
	expect((await request("/api/v1/requests/multi-original-intent")).status).toBe(404);
	const fetched = await get(`/api/connect/tokens/${multi.id}`);
	expect(fetched.headers.get("ETag")).toBe(`"${multi.id}:${multi.version}"`);
	expect((await metadata(fetched)).serverIds).toEqual([B]);
	const audit = await get(`/api/connect/tokens/${multi.id}/audit`);
	expect(audit.status).toBe(200);
	expect(((await audit.json()) as { data: unknown[] }).data).toContainEqual(
		expect.objectContaining({ operation: "management.tokens.update", server_ids: [B] }),
	);
	const scopedAudit = await request(`/api/v1/servers/${B}/audit`);
	expect((await scopedAudit.text()).includes(A)).toBe(false);
	peer = await metadata(
		await post(
			`/api/connect/tokens/${peer.id}/rotate`,
			{ challenge: await challenge(peer, "rotate"), confirmation: peer.name },
			peer,
		),
	);
	expect((await request("/api/v1/capabilities", peerSecret)).status).toBe(401);
	const rotatedSecret = await reveal(peer);
	expect(rotatedSecret === peerSecret).toBe(false);
	expect((await request(`/api/v1/servers/${A}`, rotatedSecret)).status).toBe(200);
	multi = await metadata(
		await post(
			`/api/connect/tokens/${multi.id}/revoke`,
			{ challenge: await challenge(multi, "revoke"), confirmation: multi.name },
			multi,
		),
	);
	expect(multi.revokedAt).not.toBeNull();
	expect((await request("/api/v1/capabilities")).status).toBe(401);
	expect((await request(`/api/v1/servers/${A}`, rotatedSecret)).status).toBe(200);
});
