import { type HostOverviewItem, hashHostId } from "@bat/shared";
import { expect, test } from "vitest";
import {
	BASE,
	makeIdentityPayload,
	makeMetricsPayload,
	readHeaders,
	writeHeaders,
} from "./helpers.js";

test("browser host deletion blocks probes until deliberate registration", async () => {
	const hostId = "e2e-host-delete";
	const headers = { "Content-Type": "application/json", Origin: BASE, "X-Bat-Management": "1" };
	const confirmation = JSON.stringify({ confirm_host_id: hostId });
	for (const apiHeaders of [readHeaders(), writeHeaders()]) {
		for (const [path, method] of [
			[`/api/hosts/${hostId}`, "DELETE"],
			[`/api/hosts/${hostId}/register`, "POST"],
		] as const) {
			expect(
				(
					await fetch(`${BASE}${path}`, {
						method,
						headers: { ...headers, ...apiHeaders },
						body: confirmation,
					})
				).status,
			).toBe(403);
		}
	}
	expect(
		(
			await fetch(`${BASE}/api/identity`, {
				method: "POST",
				headers: writeHeaders(),
				body: JSON.stringify(makeIdentityPayload(hostId)),
			})
		).status,
	).toBe(204);
	expect(
		(
			await fetch(`${BASE}/api/ingest`, {
				method: "POST",
				headers: writeHeaders(),
				body: JSON.stringify(makeMetricsPayload(hostId)),
			})
		).status,
	).toBe(204);
	expect(
		(
			await fetch(`${BASE}/api/hosts/${hostId}`, {
				method: "DELETE",
				headers: { ...headers, Origin: "https://evil.example" },
				body: confirmation,
			})
		).status,
	).toBe(403);
	expect(
		(
			await fetch(`${BASE}/api/hosts/${hostId}`, {
				method: "DELETE",
				headers,
				body: JSON.stringify({ confirm_host_id: "wrong" }),
			})
		).status,
	).toBe(400);
	expect(
		(
			await fetch(`${BASE}/api/hosts/${hashHostId(hostId)}`, {
				method: "DELETE",
				headers,
				body: confirmation,
			})
		).status,
	).toBe(200);
	expect(
		(await fetch(`${BASE}/api/hosts/${hashHostId(hostId)}`, { headers: readHeaders() })).status,
	).toBe(404);
	const hosts = (await (
		await fetch(`${BASE}/api/hosts`, { headers: readHeaders() })
	).json()) as HostOverviewItem[];
	expect(hosts.some((host) => host.host_id === hostId)).toBe(false);
	for (const [path, body] of [
		["identity", makeIdentityPayload(hostId)],
		["ingest", makeMetricsPayload(hostId)],
		["tier2", { host_id: hostId, timestamp: Math.floor(Date.now() / 1000) }],
	] as const) {
		const response = await fetch(`${BASE}/api/${path}`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(body),
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toMatchObject({ error: expect.stringContaining("deleted") });
	}
	expect(
		(
			await fetch(`${BASE}/api/hosts/${hostId}/register`, {
				method: "POST",
				headers,
				body: confirmation,
			})
		).status,
	).toBe(200);
	expect(
		(
			await fetch(`${BASE}/api/identity`, {
				method: "POST",
				headers: writeHeaders(),
				body: JSON.stringify(makeIdentityPayload(hostId)),
			})
		).status,
	).toBe(204);
	expect((await fetch(`${BASE}/api/hosts/${hostId}`, { headers: readHeaders() })).status).toBe(200);
});
