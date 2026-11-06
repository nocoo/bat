// End-to-end workstation flow over real loopback HTTP.
// The base-cli callback is real; the "browser" is injected and posts to a local
// Access-protected authorize endpoint. No browser, scheduler task or real ping.

import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	isWorkstationToken,
	validateWorkstationAuthorize,
	validateWorkstationLoginExchange,
	validateWorkstationReport,
	WORKSTATION_MAX_RUN_MS,
	type WorkstationReportInput,
} from "@bat/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { runLogoutCommand } from "../commands/workstation/logout.js";
import { fetchTargets, revokeWorkstationKey, uploadReport } from "./api.js";
import { performWorkstationLogin } from "./login.js";
import { resolveOrigins } from "./origins.js";
import { runWorkstationProbe, type SystemCollector } from "./probe/run.js";
import { getWorkstationPaths, readCredential, writeCredential } from "./store.js";

const ACCESS_TOKEN = "fixture-access-jwt";
const REPORT_MAX_BYTES = 65_536;

interface AuthorizeCode {
	challenge: string;
	installationId: string;
	state: string;
	callback: string;
}

interface FixtureServer {
	origin: string;
	server: Server;
	validTokens: Set<string>;
	reports: Map<string, string>;
	closed: Promise<void>;
}

function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = "";
		let size = 0;
		request.on("data", (chunk: Buffer) => {
			size += chunk.length;
			if (size > REPORT_MAX_BYTES) {
				reject(new Error("body too large"));
				request.destroy();
				return;
			}
			body += chunk.toString("utf-8");
		});
		request.on("end", () => resolve(body));
		request.on("error", reject);
	});
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body);
	response.writeHead(status, {
		"Content-Type": "application/json",
		"Content-Length": Buffer.byteLength(payload),
	});
	response.end(payload);
}

function bearerIsValid(request: IncomingMessage, tokens: Set<string>): boolean {
	const header = request.headers.authorization ?? "";
	const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
	return tokens.has(token);
}

async function startFixture(): Promise<FixtureServer> {
	const codes = new Map<string, AuthorizeCode>();
	const validTokens = new Set<string>();
	const reports = new Map<string, string>();
	let origin = "";

	const server = createServer(async (request, response) => {
		try {
			const url = new URL(request.url ?? "/", "http://127.0.0.1");
			if (url.pathname === "/api/workstation-auth/authorize") {
				if (request.method !== "POST" || request.headers["x-access-token"] !== ACCESS_TOKEN) {
					sendJson(response, 403, { error: "access required" });
					return;
				}
				const input = JSON.parse(await readBody(request)) as Record<string, unknown>;
				const authorized = validateWorkstationAuthorize(input);
				if (!authorized.ok) {
					sendJson(response, 400, { error: authorized.error });
					return;
				}
				const code = randomUUID();
				codes.set(code, {
					challenge: authorized.value.code_challenge,
					installationId: authorized.value.installation_id,
					state: authorized.value.state,
					callback: authorized.value.callback,
				});
				sendJson(response, 200, {
					redirect_url: `${authorized.value.callback}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(authorized.value.state)}`,
				});
				return;
			}

			if (url.pathname === "/api/workstation-auth/exchange") {
				const input = JSON.parse(await readBody(request)) as Record<string, unknown>;
				const parsed = validateWorkstationLoginExchange(input);
				if (!parsed.ok) {
					sendJson(response, 400, { error: parsed.error });
					return;
				}
				const pending = codes.get(parsed.value.code);
				codes.delete(parsed.value.code);
				if (!pending || pending.installationId !== parsed.value.installation_id) {
					sendJson(response, 400, { error: "unknown code" });
					return;
				}
				const digest = createHash("sha256").update(parsed.value.code_verifier).digest("base64url");
				if (digest !== pending.challenge) {
					sendJson(response, 400, { error: "pkce mismatch" });
					return;
				}
				const token =
					`batw_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`.slice(0, 48);
				validTokens.add(token);
				sendJson(response, 200, {
					workstation_id: randomUUID(),
					token,
					worker_url: origin,
				});
				return;
			}

			if (url.pathname === "/api/workstation-probe/targets") {
				if (request.method !== "GET" || !bearerIsValid(request, validTokens)) {
					sendJson(response, 401, { error: "invalid workstation key" });
					return;
				}
				sendJson(response, 200, {
					data: [{ server_id: "srv_local", name: "loopback", address: "127.0.0.1", family: 4 }],
					interval_seconds: 600,
					ping_count: 3,
				});
				return;
			}

			if (url.pathname === "/api/workstation-probe/reports") {
				if (request.method !== "POST" || !bearerIsValid(request, validTokens)) {
					sendJson(response, 401, { error: "invalid workstation key" });
					return;
				}
				const raw = await readBody(request);
				let parsedBody: unknown;
				try {
					parsedBody = JSON.parse(raw);
				} catch {
					sendJson(response, 400, { error: "invalid json" });
					return;
				}
				const validated = validateWorkstationReport(parsedBody, Math.floor(Date.now() / 1000));
				if (!validated.ok) {
					sendJson(response, 400, { error: validated.error });
					return;
				}
				const normalized = JSON.stringify(validated.value);
				const existing = reports.get(validated.value.report_id);
				if (existing !== undefined) {
					if (existing === normalized) {
						response.writeHead(204);
						response.end();
					} else {
						sendJson(response, 409, { error: "report_id reused with different content" });
					}
					return;
				}
				reports.set(validated.value.report_id, normalized);
				response.writeHead(204);
				response.end();
				return;
			}

			if (url.pathname === "/api/workstation-probe/revoke") {
				if (request.method !== "POST") {
					sendJson(response, 405, { error: "method" });
					return;
				}
				const header = request.headers.authorization ?? "";
				const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
				if (!validTokens.delete(token)) {
					sendJson(response, 401, { error: "invalid workstation key" });
					return;
				}
				response.writeHead(204);
				response.end();
				return;
			}

			sendJson(response, 404, { error: "not found" });
		} catch (err) {
			sendJson(response, 500, { error: (err as Error).message });
		}
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address() as AddressInfo;
	origin = `http://127.0.0.1:${address.port}`;
	const closed = new Promise<void>((resolve) => server.on("close", resolve));
	return { origin, server, validTokens, reports, closed };
}

function loopbackTarget() {
	return {
		server_id: "srv_local",
		name: "loopback",
		address: "127.0.0.1",
		family: 4 as const,
	};
}

function collector(): SystemCollector {
	return {
		identity: () => ({ hostname: "fixture", os: "Darwin", arch: "arm64", uptime_seconds: 10 }),
		cpuBefore: () => ({ idle: 100, total: 200 }),
		cpuAfter: () => ({ idle: 150, total: 400 }),
		cpuModel: () => "Fixture CPU",
		cpuCount: () => 4,
		wait: async () => undefined,
		memory: async () => ({ total_bytes: 1000, available_bytes: 400, used_pct: 60 }),
		disks: async () => ({
			disk: [{ mount: "/", total_bytes: 1000, available_bytes: 500, used_pct: 50 }],
			errors: [],
		}),
		network: () => [
			{ name: "lo0", addresses: [{ address: "127.0.0.1", family: 4, internal: true }] },
		],
	};
}

function fakePing() {
	return vi.fn().mockResolvedValue({
		connectivity: {
			server_id: "srv_local",
			address: "127.0.0.1",
			family: 4,
			sent: 3,
			received: 3,
			rtts_ms: [0.1, 0.1, 0.1],
			status: "reachable",
		},
	});
}

let home: string;
let fixture: FixtureServer;

beforeEach(async () => {
	home = mkdtempSync(join(tmpdir(), "bat-ws-e2e-"));
	fixture = await startFixture();
});

afterEach(async () => {
	fixture.server.close();
	await fixture.closed;
	rmSync(home, { recursive: true, force: true });
});

describe("workstation end-to-end over loopback HTTP", () => {
	test("authorizes, probes, uploads idempotently, revokes and logs out", async () => {
		const paths = getWorkstationPaths(home);
		const origins = resolveOrigins(fixture.origin);
		let browserUrl: URL | undefined;

		const outcome = await performWorkstationLogin({
			paths,
			origins,
			open: async (url: string) => {
				browserUrl = new URL(url);
				const authorize = await fetch(`${fixture.origin}/api/workstation-auth/authorize`, {
					method: "POST",
					headers: { "x-access-token": ACCESS_TOKEN, "Content-Type": "application/json" },
					body: JSON.stringify({
						installation_id: browserUrl.searchParams.get("installation_id"),
						code_challenge: browserUrl.searchParams.get("code_challenge"),
						code_challenge_method: browserUrl.searchParams.get("code_challenge_method"),
						state: browserUrl.searchParams.get("state"),
						callback: browserUrl.searchParams.get("callback"),
					}),
				});
				expect(authorize.status).toBe(200);
				const result = (await authorize.json()) as { redirect_url: string };
				const callback = await fetch(result.redirect_url);
				expect(callback.status).toBe(200);
			},
		});

		expect(outcome).not.toBeNull();
		expect(browserUrl?.pathname).toBe("/workstation-login");
		expect(browserUrl?.searchParams.get("code_challenge_method")).toBe("S256");
		expect(browserUrl?.searchParams.get("hostname")).toBeTruthy();
		const credential = readCredential(paths);
		expect(credential).not.toBeNull();
		expect(credential?.worker_url).toBe(fixture.origin);
		expect(isWorkstationToken(credential?.token ?? "")).toBe(true);

		const targets = await fetchTargets(fixture.origin, credential?.token ?? "");
		expect(targets.data).toStrictEqual([loopbackTarget()]);

		const probe = await runWorkstationProbe({
			paths,
			credential: credential ?? undefined,
			collector: collector(),
			exec: vi.fn(),
			platform: "darwin",
			ping: fakePing(),
			output: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
		});
		expect(probe.exitCode).toBe(0);
		const report = probe.report as WorkstationReportInput;
		expect(fixture.reports.has(report.report_id)).toBe(true);

		await expect(
			uploadReport(fixture.origin, credential?.token ?? "", report),
		).resolves.toBeUndefined();
		await expect(
			uploadReport(fixture.origin, credential?.token ?? "", { ...report, hostname: "other" }),
		).rejects.toThrow(/409/);

		await revokeWorkstationKey(fixture.origin, credential?.token ?? "");
		await expect(fetchTargets(fixture.origin, credential?.token ?? "")).rejects.toThrow(
			/401|invalid/,
		);

		const second = await performWorkstationLogin({
			paths,
			origins,
			open: async (url: string) => {
				const loginUrl = new URL(url);
				const authorize = await fetch(`${fixture.origin}/api/workstation-auth/authorize`, {
					method: "POST",
					headers: { "x-access-token": ACCESS_TOKEN, "Content-Type": "application/json" },
					body: JSON.stringify({
						installation_id: loginUrl.searchParams.get("installation_id"),
						code_challenge: loginUrl.searchParams.get("code_challenge"),
						code_challenge_method: loginUrl.searchParams.get("code_challenge_method"),
						state: loginUrl.searchParams.get("state"),
						callback: loginUrl.searchParams.get("callback"),
					}),
				});
				const result = (await authorize.json()) as { redirect_url: string };
				await fetch(result.redirect_url);
			},
		});
		expect(second).not.toBeNull();

		await expect(runLogoutCommand({ paths })).resolves.toBe(0);
		expect(readCredential(paths)).toBeNull();
		expect(fixture.validTokens.size).toBe(0);
	});

	test("refuses to start when the authorize page denies access", async () => {
		const paths = getWorkstationPaths(home);
		const origins = resolveOrigins(fixture.origin);

		const outcome = await performWorkstationLogin({
			paths,
			origins,
			login: async () => ({ success: false, error: "access denied" }),
			open: async () => {
				const response = await fetch(`${fixture.origin}/api/workstation-auth/authorize`, {
					method: "POST",
					headers: { "x-access-token": "wrong", "Content-Type": "application/json" },
					body: "{}",
				});
				expect(response.status).toBe(403);
			},
		});

		expect(outcome).toBeNull();
		expect(readCredential(paths)).toBeNull();
	});

	test("keeps the credential when the login exchange is rejected", async () => {
		const paths = getWorkstationPaths(home);
		const origins = resolveOrigins(fixture.origin);
		await writeCredential(paths, {
			workstation_id: "771e8400-e29b-41d4-a716-446655440000",
			worker_url: fixture.origin,
			token: `batw_${"a".repeat(43)}`,
		});

		const outcome = await performWorkstationLogin({
			paths,
			origins,
			exchange: async () => {
				throw new Error("pkce mismatch");
			},
			open: async (url: string) => {
				const loginUrl = new URL(url);
				const authorize = await fetch(`${fixture.origin}/api/workstation-auth/authorize`, {
					method: "POST",
					headers: { "x-access-token": ACCESS_TOKEN, "Content-Type": "application/json" },
					body: JSON.stringify({
						installation_id: loginUrl.searchParams.get("installation_id"),
						code_challenge: loginUrl.searchParams.get("code_challenge"),
						code_challenge_method: loginUrl.searchParams.get("code_challenge_method"),
						state: loginUrl.searchParams.get("state"),
						callback: loginUrl.searchParams.get("callback"),
					}),
				});
				const result = (await authorize.json()) as { redirect_url: string };
				await fetch(result.redirect_url);
			},
		});

		expect(outcome).toBeNull();
		expect(readCredential(paths)?.token).toBe(`batw_${"a".repeat(43)}`);
	});

	test("the probe maximum is the shared 120 second budget", () => {
		expect(WORKSTATION_MAX_RUN_MS).toBe(120_000);
	});
});
