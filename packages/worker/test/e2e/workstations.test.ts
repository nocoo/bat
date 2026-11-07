// L2 — workstations end to end over real local HTTP.
//
// Covers Access-gated enrollment, the PKCE exchange, dedicated `batw_` keys,
// target discovery, idempotent reports, history reads and revocation. The
// harness supplies a local Access fixture key; no remote credentials are used.

import { createHash, randomUUID } from "node:crypto";
import { describe, expect, test } from "vitest";
import { BASE, browserHeaders, makeIdentityPayload, readHeaders, writeHeaders } from "./helpers";

const INSTALLATION = randomUUID();
const VERIFIER = "l".repeat(64);
const CALLBACK = "http://127.0.0.1:8765/callback";

function challenge(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

function uuid(): string {
	return randomUUID();
}

function managementHeaders(): Record<string, string> {
	return { "Content-Type": "application/json", Origin: BASE, "X-Bat-Management": "1" };
}

function report(reportId: string, connectivity: unknown[] = []) {
	const finished = Math.floor(Date.now() / 1000);
	return {
		report_id: reportId,
		started_at: finished - 8,
		finished_at: finished,
		sample_window_ms: 8_000,
		cli_version: "2.5.0",
		hostname: "e2e-workstation",
		os: "macOS 15.2",
		arch: "arm64",
		uptime_seconds: 86_400,
		cpu: { model: "Apple M3 Pro", count: 12, usage_pct: 21.5 },
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
		connectivity,
		collection_errors: [],
		targets_error: null,
	};
}

async function authorize(headers: Record<string, string>) {
	return fetch(`${BASE}/api/workstation-auth/authorize`, {
		method: "POST",
		headers,
		body: JSON.stringify({
			installation_id: INSTALLATION,
			code_challenge: challenge(VERIFIER),
			code_challenge_method: "S256",
			state: "e2e-state-0123456789",
			callback: CALLBACK,
			name: "E2E MacBook",
		}),
	});
}

async function exchange(code: string) {
	return fetch(`${BASE}/api/workstation-auth/exchange`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			code,
			code_verifier: VERIFIER,
			installation_id: INSTALLATION,
		}),
	});
}

async function pairStart(installation: string, name: string) {
	return fetch(`${BASE}/api/workstation-auth/pair`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			installation_id: installation,
			name,
			code_challenge: challenge(VERIFIER),
		}),
	});
}

async function pairStatus(pairingCode: string) {
	return fetch(`${BASE}/api/workstation-auth/pair/${pairingCode}`);
}

describe("L2: workstations", () => {
	test("enrollment, probe, history and revocation over real HTTP", async () => {
		const serverId = `e2e-ws-${uuid().slice(0, 8)}`;
		const publicIp = "8.8.8.8";
		const identity = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ ...makeIdentityPayload(serverId), public_ip: publicIp }),
		});
		expect([200, 204]).toContain(identity.status);

		const headers = await browserHeaders();
		const enrolled = await authorize(headers);
		expect(enrolled.status).toBe(201);
		const { redirect_url } = (await enrolled.json()) as { redirect_url: string };
		const redirect = new URL(redirect_url);
		expect(redirect.origin).toBe("http://127.0.0.1:8765");
		expect(redirect.pathname).toBe("/callback");
		const code = redirect.searchParams.get("code");
		expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);

		const exchanged = await exchange(code as string);
		expect(exchanged.status).toBe(200);
		const issued = (await exchanged.json()) as { workstation_id: string; token: string };
		expect(issued.token).toMatch(/^batw_[A-Za-z0-9_-]{43}$/);
		expect(await exchange(code as string).then((response) => response.status)).toBe(401);

		const workstationHeaders = { Authorization: `Bearer ${issued.token}` };
		const targets = await fetch(`${BASE}/api/workstation-probe/targets`, {
			headers: workstationHeaders,
		});
		expect(targets.status).toBe(200);
		const targetsBody = (await targets.json()) as {
			data: Array<{ server_id: string; address: string; family: number }>;
			interval_seconds: number;
			ping_count: number;
		};
		expect(targetsBody.interval_seconds).toBe(600);
		expect(targetsBody.ping_count).toBe(3);
		const target = targetsBody.data.find((entry) => entry.server_id === serverId);
		expect(target).toMatchObject({ address: publicIp, family: 4 });

		const payload = report(uuid(), [
			{
				server_id: serverId,
				address: publicIp,
				family: 4,
				sent: 3,
				received: 2,
				rtts_ms: [0, 12.5, null],
				status: "partial",
			},
		]);
		const accepted = await fetch(`${BASE}/api/workstation-probe/reports`, {
			method: "POST",
			headers: { ...workstationHeaders, "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		expect(accepted.status).toBe(200);
		expect(await accepted.json()).toMatchObject({ status: "accepted", duplicate: false });

		const duplicate = await fetch(`${BASE}/api/workstation-probe/reports`, {
			method: "POST",
			headers: { ...workstationHeaders, "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		expect(await duplicate.json()).toMatchObject({ status: "accepted", duplicate: true });

		const conflict = await fetch(`${BASE}/api/workstation-probe/reports`, {
			method: "POST",
			headers: { ...workstationHeaders, "Content-Type": "application/json" },
			body: JSON.stringify({ ...payload, uptime_seconds: 1 }),
		});
		expect(conflict.status).toBe(409);

		const unauthorizedTarget = await fetch(`${BASE}/api/workstation-probe/reports`, {
			method: "POST",
			headers: { ...workstationHeaders, "Content-Type": "application/json" },
			body: JSON.stringify(
				report(uuid(), [
					{
						server_id: "not-authorized",
						address: publicIp,
						family: 4,
						sent: 3,
						received: 0,
						rtts_ms: [null, null, null],
						status: "timeout",
					},
				]),
			),
		});
		expect(unauthorizedTarget.status).toBe(403);

		const jwt = headers["Cf-Access-Jwt-Assertion"] as string;
		const records = await fetch(`${BASE}/api/workstations`, {
			headers: { "Cf-Access-Jwt-Assertion": jwt },
		});
		expect(records.status).toBe(200);
		const list = (await records.json()) as Array<{
			id: string;
			name: string;
			disabled: boolean;
			last_seen_at: number | null;
			latest_report: { report_id: string } | null;
		}>;
		const record = list.find((entry) => entry.id === issued.workstation_id);
		expect(record).toMatchObject({
			name: "E2E MacBook",
			disabled: false,
			latest_report: { report_id: payload.report_id },
		});
		expect(record?.last_seen_at).toBeGreaterThan(0);

		const detail = await fetch(`${BASE}/api/workstations/${issued.workstation_id}`, {
			headers: { "Cf-Access-Jwt-Assertion": jwt },
		});
		expect(detail.status).toBe(200);
		expect(await detail.json()).toMatchObject({
			id: issued.workstation_id,
			name: "E2E MacBook",
			latest_report: { report_id: payload.report_id },
		});
		const missing = await fetch(`${BASE}/api/workstations/${uuid()}`, {
			headers: { "Cf-Access-Jwt-Assertion": jwt },
		});
		expect(missing.status).toBe(404);

		const metrics = await fetch(
			`${BASE}/api/workstations/${issued.workstation_id}/metrics?limit=10`,
			{ headers: { "Cf-Access-Jwt-Assertion": jwt } },
		);
		expect(metrics.status).toBe(200);
		const metricsBody = (await metrics.json()) as {
			data: Array<{ cpu_usage_pct: number }>;
			page: { limit: number; next_offset: number | null };
		};
		expect(metricsBody.data).toHaveLength(1);
		expect(metricsBody.data[0]?.cpu_usage_pct).toBe(21.5);

		const connectivity = await fetch(
			`${BASE}/api/workstations/${issued.workstation_id}/connectivity`,
			{ headers: { "Cf-Access-Jwt-Assertion": jwt } },
		);
		expect(connectivity.status).toBe(200);
		const connectivityBody = (await connectivity.json()) as {
			targets: Array<{ server_id: string; data: Array<{ rtt_min_ms: number }> }>;
		};
		expect(connectivityBody.targets).toHaveLength(1);
		expect(connectivityBody.targets[0]?.server_id).toBe(serverId);
		expect(connectivityBody.targets[0]?.data[0]?.rtt_min_ms).toBe(0);

		const revoked = await fetch(`${BASE}/api/workstations/${issued.workstation_id}`, {
			method: "DELETE",
			headers,
		});
		expect(revoked.status).toBe(200);
		const afterRevoke = await fetch(`${BASE}/api/workstation-probe/targets`, {
			headers: workstationHeaders,
		});
		expect(afterRevoke.status).toBe(401);
	});

	test("same-second replay keeps the first credential valid", async () => {
		const serverId = `e2e-ws-replay-${uuid().slice(0, 8)}`;
		expect(
			(
				await fetch(`${BASE}/api/identity`, {
					method: "POST",
					headers: writeHeaders(),
					body: JSON.stringify({ ...makeIdentityPayload(serverId), public_ip: "8.8.8.8" }),
				})
			).status,
		).toBe(204);
		const installation = randomUUID();
		const authorized = await fetch(`${BASE}/api/workstation-auth/authorize`, {
			method: "POST",
			headers: managementHeaders(),
			body: JSON.stringify({
				installation_id: installation,
				code_challenge: challenge(VERIFIER),
				code_challenge_method: "S256",
				state: `e2e-replay-${installation.slice(0, 8)}`,
				callback: CALLBACK,
				name: "Replay laptop",
			}),
		});
		expect(authorized.status).toBe(201);
		const code = new URL(
			((await authorized.json()) as { redirect_url: string }).redirect_url,
		).searchParams.get("code") as string;
		const exchange = () =>
			fetch(`${BASE}/api/workstation-auth/exchange`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, code_verifier: VERIFIER, installation_id: installation }),
			});
		const first = await exchange();
		expect(first.status).toBe(200);
		const issued = (await first.json()) as { token: string };
		// The replay is rejected and must not rotate the credential issued above.
		expect((await exchange()).status).toBe(401);
		expect(
			(
				await fetch(`${BASE}/api/workstation-probe/targets`, {
					headers: { Authorization: `Bearer ${issued.token}` },
				})
			).status,
		).toBe(200);
	});

	test("report IDs are scoped per workstation", async () => {
		const enroll = async (name: string) => {
			const installation = randomUUID();
			const authorized = await fetch(`${BASE}/api/workstation-auth/authorize`, {
				method: "POST",
				headers: managementHeaders(),
				body: JSON.stringify({
					installation_id: installation,
					code_challenge: challenge(VERIFIER),
					code_challenge_method: "S256",
					state: `e2e-scope-${installation.slice(0, 8)}`,
					callback: CALLBACK,
					name,
				}),
			});
			const code = new URL(
				((await authorized.json()) as { redirect_url: string }).redirect_url,
			).searchParams.get("code") as string;
			const exchanged = await fetch(`${BASE}/api/workstation-auth/exchange`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ code, code_verifier: VERIFIER, installation_id: installation }),
			});
			return (await exchanged.json()) as { workstation_id: string; token: string };
		};
		const first = await enroll("Scoped laptop one");
		const second = await enroll("Scoped laptop two");
		const sharedReportId = uuid();
		for (const issued of [first, second]) {
			const response = await fetch(`${BASE}/api/workstation-probe/reports`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${issued.token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(report(sharedReportId, [])),
			});
			expect(response.status).toBe(200);
		}
		for (const issued of [first, second]) {
			const detail = (await (
				await fetch(`${BASE}/api/workstations/${issued.workstation_id}`, {
					headers: managementHeaders(),
				})
			).json()) as { latest_report: { report_id: string } | null };
			expect(detail.latest_report?.report_id).toBe(sharedReportId);
		}
	});

	test("a late older sample never becomes latest, and revocation keeps history", async () => {
		const serverId = `e2e-ws-late-${uuid().slice(0, 8)}`;
		expect(
			(
				await fetch(`${BASE}/api/identity`, {
					method: "POST",
					headers: writeHeaders(),
					body: JSON.stringify({ ...makeIdentityPayload(serverId), public_ip: "8.8.8.8" }),
				})
			).status,
		).toBe(204);
		const installation = randomUUID();
		const authorized = await fetch(`${BASE}/api/workstation-auth/authorize`, {
			method: "POST",
			headers: managementHeaders(),
			body: JSON.stringify({
				installation_id: installation,
				code_challenge: challenge(VERIFIER),
				code_challenge_method: "S256",
				state: `e2e-late-state-${installation.slice(0, 8)}`,
				callback: CALLBACK,
				name: "Late laptop",
			}),
		});
		const code = new URL(
			((await authorized.json()) as { redirect_url: string }).redirect_url,
		).searchParams.get("code") as string;
		const exchanged = await fetch(`${BASE}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code, code_verifier: VERIFIER, installation_id: installation }),
		});
		const issued = (await exchanged.json()) as { workstation_id: string; token: string };
		const workstationHeaders = {
			Authorization: `Bearer ${issued.token}`,
			"Content-Type": "application/json",
		};
		const newer = report(uuid(), []);
		expect(
			(
				await fetch(`${BASE}/api/workstation-probe/reports`, {
					method: "POST",
					headers: workstationHeaders,
					body: JSON.stringify(newer),
				})
			).status,
		).toBe(200);
		const before = (await (
			await fetch(`${BASE}/api/workstations/${issued.workstation_id}`, {
				headers: managementHeaders(),
			})
		).json()) as { last_seen_at: number; latest_report: { report_id: string } | null };
		const older = {
			...newer,
			report_id: uuid(),
			finished_at: newer.finished_at - 120,
			started_at: newer.started_at - 120,
		};
		expect(
			(
				await fetch(`${BASE}/api/workstation-probe/reports`, {
					method: "POST",
					headers: workstationHeaders,
					body: JSON.stringify(older),
				})
			).status,
		).toBe(200);
		const after = (await (
			await fetch(`${BASE}/api/workstations/${issued.workstation_id}`, {
				headers: managementHeaders(),
			})
		).json()) as { last_seen_at: number; latest_report: { report_id: string } | null };
		expect(after.latest_report?.report_id).toBe(newer.report_id);
		expect(after.last_seen_at).toBe(before.last_seen_at);

		// Revoke only the presented credential: history and the workstation survive.
		expect(
			(
				await fetch(`${BASE}/api/workstation-probe/revoke`, {
					method: "POST",
					headers: { Authorization: `Bearer ${issued.token}` },
				})
			).status,
		).toBe(204);
		const revokedTargets = await fetch(`${BASE}/api/workstation-probe/targets`, {
			headers: { Authorization: `Bearer ${issued.token}` },
		});
		expect(revokedTargets.status).toBe(401);
		expect(revokedTargets.headers.get("Cache-Control")).toContain("no-store");
		expect(
			(
				await fetch(`${BASE}/api/workstations/${issued.workstation_id}`, {
					headers: managementHeaders(),
				})
			).status,
		).toBe(200);
		const metrics = await fetch(
			`${BASE}/api/workstations/${issued.workstation_id}/metrics?limit=10`,
			{ headers: managementHeaders() },
		);
		expect(((await metrics.json()) as { data: unknown[] }).data).toHaveLength(2);

		// Re-login with the same installation rotates a new key for the same ID.
		const again = await fetch(`${BASE}/api/workstation-auth/authorize`, {
			method: "POST",
			headers: managementHeaders(),
			body: JSON.stringify({
				installation_id: installation,
				code_challenge: challenge(VERIFIER),
				code_challenge_method: "S256",
				state: `e2e-late-state-${installation.slice(0, 8)}`,
				callback: CALLBACK,
			}),
		});
		const againCode = new URL(
			((await again.json()) as { redirect_url: string }).redirect_url,
		).searchParams.get("code") as string;
		const relogin = (await (
			await fetch(`${BASE}/api/workstation-auth/exchange`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					code: againCode,
					code_verifier: VERIFIER,
					installation_id: installation,
				}),
			})
		).json()) as { workstation_id: string; token: string };
		expect(relogin.workstation_id).toBe(issued.workstation_id);
		expect(
			(
				await fetch(`${BASE}/api/workstation-probe/targets`, {
					headers: { Authorization: `Bearer ${relogin.token}` },
				})
			).status,
		).toBe(200);
	});

	test("enrollment and revocation need Access plus a same-origin confirmation", async () => {
		const anonymous = await fetch(`${BASE}/api/workstation-auth/authorize`, {
			method: "POST",
			headers: { ...readHeaders(), "Content-Type": "application/json" },
			body: JSON.stringify({}),
		});
		expect(anonymous.status).toBe(403);

		const headers = await browserHeaders();
		const crossOrigin = await fetch(`${BASE}/api/workstation-auth/authorize`, {
			method: "POST",
			headers: { ...headers, Origin: "https://evil.example" },
			body: JSON.stringify({
				installation_id: randomUUID(),
				code_challenge: challenge(VERIFIER),
				code_challenge_method: "S256",
				state: "e2e-state-0123456789",
				callback: CALLBACK,
			}),
		});
		expect(crossOrigin.status).toBe(403);

		const remoteCallback = await fetch(`${BASE}/api/workstation-auth/authorize`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				installation_id: randomUUID(),
				code_challenge: challenge(VERIFIER),
				code_challenge_method: "S256",
				state: "e2e-state-0123456789",
				callback: "https://bat.hexly.ai/callback",
			}),
		});
		expect(remoteCallback.status).toBe(400);

		const noGetMint = await fetch(`${BASE}/api/workstation-auth/authorize`, { headers });
		expect(noGetMint.status).toBe(404);

		const exchangeWithoutKey = await fetch(`${BASE}/api/workstation-probe/targets`, {
			headers: readHeaders(),
		});
		expect(exchangeWithoutKey.status).toBe(401);
	});
});

describe("L2: headless pairing", () => {
	test("pair, approve, exchange, rename over real HTTP", async () => {
		const installation = uuid();
		const started = await pairStart(installation, "Headless e2e laptop");
		expect(started.status).toBe(201);
		const pair = (await started.json()) as {
			pairing_code: string;
			code: string;
			name: string;
			expires_at: number;
		};
		expect(pair.pairing_code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
		expect(pair.name).toBe("Headless e2e laptop");

		// The machine may poll before approval, and the exchange must refuse.
		const pending = await pairStatus(pair.pairing_code);
		expect(((await pending.json()) as { status: string }).status).toBe("pending");
		const early = await fetch(`${BASE}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				code: pair.code,
				code_verifier: VERIFIER,
				installation_id: installation,
			}),
		});
		expect(early.status).toBe(401);

		const approved = await fetch(`${BASE}/api/workstations/pair`, {
			method: "POST",
			headers: { ...managementHeaders(), ...(await browserHeaders()) },
			body: JSON.stringify({ pairing_code: pair.pairing_code }),
		});
		expect(approved.status).toBe(200);
		expect(((await approved.json()) as { name: string }).name).toBe("Headless e2e laptop");

		const afterApproval = await pairStatus(pair.pairing_code);
		expect(((await afterApproval.json()) as { status: string }).status).toBe("approved");

		const exchanged = await fetch(`${BASE}/api/workstation-auth/exchange`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				code: pair.code,
				code_verifier: VERIFIER,
				installation_id: installation,
			}),
		});
		expect(exchanged.status).toBe(200);
		const credential = (await exchanged.json()) as { workstation_id: string; token: string };
		expect(credential.token.startsWith("batw_")).toBe(true);

		const renamed = await fetch(`${BASE}/api/workstations/${credential.workstation_id}`, {
			method: "PATCH",
			headers: { ...managementHeaders(), ...(await browserHeaders()) },
			body: JSON.stringify({ name: "Renamed headless laptop" }),
		});
		expect(renamed.status).toBe(200);
		expect(((await renamed.json()) as { name: string }).name).toBe("Renamed headless laptop");

		const detail = await fetch(`${BASE}/api/workstations/${credential.workstation_id}`, {
			headers: await browserHeaders(),
		});
		expect(((await detail.json()) as { name: string }).name).toBe("Renamed headless laptop");
	});
});
