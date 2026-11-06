// L2 — real CLI workstation flow against the local Worker over HTTP.
//
// This file owns the cross-package contract: the exported CLI login (real
// loopback PKCE listener), the probe orchestrator with fake system/ping inputs,
// real target discovery/report upload, browser-observed D1 reads, duplicate and
// conflict handling, and key revocation through logout. No browser is opened,
// no system scheduler or ACL is touched, and no production credentials are used.

import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { runLogoutCommand } from "../../../cli/src/commands/workstation/logout.js";
import { fetchTargets } from "../../../cli/src/workstation/api.js";
import { performWorkstationLogin } from "../../../cli/src/workstation/login.js";
import {
	runWorkstationProbe,
	type SystemCollector,
} from "../../../cli/src/workstation/probe/run.js";
import { getWorkstationPaths, readCredential } from "../../../cli/src/workstation/store.js";
import { BASE, browserHeaders, makeIdentityPayload, writeHeaders } from "./helpers";

/** Native Worker origin: the CLI derives machine traffic here, not through the gateway. */
const MACHINE = process.env.BAT_E2E_WORKER ?? BASE;

const PRODUCTION_CREDENTIALS = [
	"CLOUDFLARE_API_TOKEN",
	"CLOUDFLARE_ACCOUNT_ID",
	"CF_API_TOKEN",
	"BAT_WRITE_KEY",
	"BAT_READ_KEY",
	"CF_ACCESS_CLIENT_SECRET",
	"CF_ACCESS_CLIENT_ID",
];

interface AuthorizeResponse {
	redirect_url: string;
}

/** Fake browser: consents through the Access-protected POST, then follows the callback. */
function browserConsent(workstationName: string) {
	return async (loginUrl: string): Promise<void> => {
		const url = new URL(loginUrl);
		expect(url.pathname).toBe("/workstation-login");
		const required = {
			installation_id: url.searchParams.get("installation_id"),
			code_challenge: url.searchParams.get("code_challenge"),
			code_challenge_method: url.searchParams.get("code_challenge_method"),
			state: url.searchParams.get("state"),
			callback: url.searchParams.get("callback"),
		};
		for (const [key, value] of Object.entries(required)) {
			expect(value, key).toBeTruthy();
		}
		expect(required.code_challenge_method).toBe("S256");
		expect(["127.0.0.1", "localhost", "[::1]"]).toContain(
			new URL(required.callback as string).hostname,
		);

		const authorized = await fetch(`${BASE}/api/workstation-auth/authorize`, {
			method: "POST",
			headers: await browserHeaders(),
			body: JSON.stringify({ ...required, name: workstationName }),
		});
		expect(authorized.status).toBe(201);
		const { redirect_url } = (await authorized.json()) as AuthorizeResponse;
		const callback = new URL(redirect_url);
		expect(callback.origin).toBe(new URL(required.callback as string).origin);
		expect(callback.pathname).toBe("/callback");
		expect(callback.searchParams.get("state")).toBe(required.state);

		// A real browser navigation: the CLI's loopback listener validates state,
		// records the code, and answers the page.
		const delivered = await fetch(redirect_url);
		expect(delivered.status).toBe(200);
	};
}

function fakeCollector(): SystemCollector {
	return {
		identity: () => ({
			hostname: "l2-cli-laptop",
			os: "BatTest 1.0",
			arch: "x86_64",
			uptime_seconds: 86_400,
		}),
		cpuBefore: () => ({ idle: 100, total: 1_000 }),
		cpuAfter: () => ({ idle: 150, total: 1_200 }),
		cpuModel: () => "Test CPU",
		cpuCount: () => 4,
		wait: async () => {},
		memory: async () => ({
			total_bytes: 8_000_000_000,
			available_bytes: 4_000_000_000,
			used_pct: 50,
		}),
		disks: async () => ({
			disk: [
				{
					mount: "/",
					total_bytes: 10_000_000_000,
					available_bytes: 6_000_000_000,
					used_pct: 40,
				},
			],
			errors: [],
		}),
		network: () => [
			{
				name: "eth0",
				addresses: [{ address: "192.168.1.20", family: 4, internal: false }],
			},
		],
	};
}

describe("L2: CLI workstation contract", () => {
	test("login, probe, report idempotency, browser read and logout use real HTTP", async () => {
		for (const key of PRODUCTION_CREDENTIALS) {
			expect(process.env[key], `${key} must stay unset in L2`).toBeUndefined();
		}

		const serverId = `e2e-cli-${randomUUID().slice(0, 8)}`;
		const publicIp = "8.8.8.8";
		const identity = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ ...makeIdentityPayload(serverId), public_ip: publicIp }),
		});
		expect([200, 204]).toContain(identity.status);

		const home = mkdtempSync(join(tmpdir(), "bat-cli-l2-"));
		const paths = getWorkstationPaths(home);
		try {
			let opened = 0;
			const outcome = await performWorkstationLogin({
				paths,
				origins: { dashboard: BASE, machine: MACHINE },
				hostname: () => "l2-cli-laptop",
				open: async (url) => {
					opened += 1;
					await browserConsent("L2 CLI laptop")(url);
				},
			});
			expect(opened).toBe(1);
			expect(outcome).not.toBeNull();
			if (!outcome) throw new Error("login did not return a credential");
			expect(outcome.installationId).toMatch(/^[0-9a-f-]{36}$/);
			expect(outcome.credential.workstation_id).toMatch(/^[0-9a-f-]{36}$/);
			expect(outcome.credential.token).toMatch(/^batw_[A-Za-z0-9_-]{43}$/);
			expect(outcome.credential.worker_url).toBe(MACHINE);
			expect(existsSync(paths.credentialPath)).toBe(true);
			expect(readCredential(paths)?.workstation_id).toBe(outcome.credential.workstation_id);

			const targets = await fetchTargets(outcome.credential.worker_url, outcome.credential.token);
			expect(targets.interval_seconds).toBe(600);
			expect(targets.ping_count).toBe(3);
			expect(targets.data.find((entry) => entry.server_id === serverId)).toMatchObject({
				address: publicIp,
				family: 4,
			});

			let clock = Date.now();
			const now = () => {
				const value = clock;
				clock += 250;
				return value;
			};
			const probe = await runWorkstationProbe({
				paths,
				collector: fakeCollector(),
				now,
				platform: "linux",
				ping: async (target) => ({
					connectivity: {
						server_id: target.server_id,
						address: target.address,
						family: target.family,
						sent: 3,
						received: 3,
						rtts_ms: [1.2, 1.3, 1.4],
						status: "reachable",
					},
				}),
			});
			expect(probe.exitCode).toBe(0);
			const report = probe.report;
			expect(report).toBeDefined();
			if (!report) throw new Error("probe did not build a report");
			expect(report.hostname).toBe("l2-cli-laptop");
			// The probe must report exactly the authorized target response the client
			// consumed: every id/address/family, three sent and three answered samples.
			const expectedConnectivity = targets.data.map((target) => ({
				server_id: target.server_id,
				address: target.address,
				family: target.family,
				sent: 3,
				received: 3,
				rtts_ms: [1.2, 1.3, 1.4],
				status: "reachable",
			}));
			expect(report.connectivity).toEqual(expectedConnectivity);
			expect(report.connectivity.map((entry) => entry.server_id)).toContain(serverId);
			for (const entry of report.connectivity) {
				expect(entry.rtts_ms).toHaveLength(3);
				expect(entry.sent).toBe(3);
				expect(entry.status).toBe("reachable");
			}

			const keyHeaders = {
				Authorization: `Bearer ${outcome.credential.token}`,
				"Content-Type": "application/json",
			};
			// The Worker reports acceptance as 200 with a JSON body, not 204.
			const accepted = await fetch(`${MACHINE}/api/workstation-probe/reports`, {
				method: "POST",
				headers: keyHeaders,
				body: JSON.stringify(report),
			});
			expect(accepted.status).toBe(200);
			expect(await accepted.json()).toMatchObject({ status: "accepted", duplicate: true });

			const conflict = await fetch(`${MACHINE}/api/workstation-probe/reports`, {
				method: "POST",
				headers: keyHeaders,
				body: JSON.stringify({ ...report, uptime_seconds: report.uptime_seconds + 1 }),
			});
			expect(conflict.status).toBe(409);

			const detail = await fetch(`${BASE}/api/workstations/${outcome.credential.workstation_id}`, {
				headers: await browserHeaders(),
			});
			expect(detail.status).toBe(200);
			const record = (await detail.json()) as {
				name: string;
				last_seen_at: number | null;
				public_ip: string | null;
				disabled: boolean;
				latest_report: {
					hostname: string;
					os: string;
					arch: string;
					cpu: { model: string; count: number; usage_pct: number | null };
					mem: { used_pct: number };
					disk: { mount: string }[];
					network: { interfaces: { name: string }[] };
					connectivity: {
						server_id: string;
						address: string;
						family: number;
						sent: number;
						received: number;
						rtts_ms: (number | null)[];
						status: string;
					}[];
				} | null;
			};
			expect(record.name).toBe("L2 CLI laptop");
			expect(record.disabled).toBe(false);
			expect(record.last_seen_at).toBeTypeOf("number");
			expect(record.public_ip).toBeNull();
			expect(record.latest_report).toMatchObject({
				hostname: "l2-cli-laptop",
				os: "BatTest 1.0",
				arch: "x86_64",
				cpu: { model: "Test CPU", count: 4 },
				mem: { used_pct: 50 },
				disk: [{ mount: "/" }],
				network: { interfaces: [{ name: "eth0" }] },
			});
			// Browser detail must expose the connectivity exactly as stored from the report.
			expect(record.latest_report?.connectivity).toEqual(report.connectivity);

			const revoked = await fetch(`${MACHINE}/api/workstation-probe/revoke`, {
				method: "POST",
				headers: { Authorization: `Bearer ${outcome.credential.token}` },
			});
			expect(revoked.status).toBe(204);

			// The credential file still exists; logout treats the trusted 401 as done.
			expect(await runLogoutCommand({ paths })).toBe(0);
			expect(existsSync(paths.credentialPath)).toBe(false);
			const afterRevoke = await fetch(`${MACHINE}/api/workstation-probe/targets`, {
				headers: { Authorization: `Bearer ${outcome.credential.token}` },
			});
			expect(afterRevoke.status).toBe(401);
		} finally {
			rmSync(home, { recursive: true, force: true });
		}
	});
});
