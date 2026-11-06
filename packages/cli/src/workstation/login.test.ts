// Tests for the workstation PKCE login flow.

import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoginDeps as BaseLoginDeps, LoginResult } from "@nocoo/base-cli";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	consentHostname,
	generatePkce,
	performWorkstationLogin,
	runWorkstationLogin,
} from "./login.js";
import type { WorkstationOrigins } from "./origins.js";
import { getWorkstationPaths, readCredential, readInstallationId } from "./store.js";

const WORKSTATION_ID = "771e8400-e29b-41d4-a716-446655440000";
const TOKEN = `batw_${"a".repeat(43)}`;

const ORIGINS: WorkstationOrigins = {
	dashboard: "https://bat.hexly.ai",
	machine: "https://bat-ingest.worker.hexly.ai",
};

let home: string;
let captured: BaseLoginDeps | undefined;

function fakeLogin(result: LoginResult, code?: string) {
	return vi.fn(async (deps: BaseLoginDeps) => {
		captured = deps;
		if (code) {
			deps.onSaveToken(code);
		}
		return result;
	});
}

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bat-ws-login-"));
	captured = undefined;
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

describe("generatePkce", () => {
	test("produces a base64url verifier and its S256 challenge", () => {
		const { verifier, challenge } = generatePkce();
		expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
		expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});
});

describe("performWorkstationLogin", () => {
	test("passes PKCE parameters, exchanges the code and stores the credential", async () => {
		const paths = getWorkstationPaths(home);
		const login = fakeLogin({ success: true, params: { code: "code-1" } }, "code-1");
		const exchange = vi.fn().mockResolvedValue({
			workstation_id: WORKSTATION_ID,
			worker_url: ORIGINS.machine,
			token: TOKEN,
		});

		const outcome = await performWorkstationLogin({ paths, origins: ORIGINS, login, exchange });

		expect(outcome?.credential.token).toBe(TOKEN);
		expect(outcome?.installationId).toBe(readInstallationId(paths));
		expect(readCredential(paths)?.workstation_id).toBe(WORKSTATION_ID);

		expect(captured?.apiUrl).toBe(ORIGINS.dashboard);
		expect(captured?.loginPath).toBe("/workstation-login");
		expect(captured?.tokenParam).toBe("code");
		expect(captured?.extraParams).toMatchObject({
			installation_id: outcome?.installationId,
			code_challenge_method: "S256",
			hostname: expect.any(String),
		});
		expect(captured?.extraParams?.hostname?.length).toBeGreaterThan(0);
		expect(captured?.extraParams?.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(captured?.openBrowser).toBeTypeOf("function");

		expect(exchange).toHaveBeenCalledWith(ORIGINS, {
			code: "code-1",
			code_verifier: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
			installation_id: outcome?.installationId,
		});
	});

	test("passes the injected hostname to the consent page", async () => {
		const paths = getWorkstationPaths(home);
		const login = fakeLogin({ success: true, params: {} }, "code-1");
		const exchange = vi.fn().mockResolvedValue({
			workstation_id: WORKSTATION_ID,
			worker_url: ORIGINS.machine,
			token: TOKEN,
		});

		await performWorkstationLogin({
			paths,
			origins: ORIGINS,
			login,
			exchange,
			hostname: () => "studio-mac",
		});
		expect(captured?.extraParams?.hostname).toBe("studio-mac");
	});

	test("reuses an existing installation UUID", async () => {
		const { ensureInstallationId } = await import("./store.js");
		const paths = getWorkstationPaths(home);
		const installationId = await ensureInstallationId(paths);
		const login = fakeLogin({ success: true, params: {} }, "code-1");
		const exchange = vi.fn().mockResolvedValue({
			workstation_id: WORKSTATION_ID,
			worker_url: ORIGINS.machine,
			token: TOKEN,
		});

		const outcome = await performWorkstationLogin({ paths, origins: ORIGINS, login, exchange });
		expect(outcome?.installationId).toBe(installationId);
	});

	test("returns null when the browser step fails", async () => {
		const paths = getWorkstationPaths(home);
		const login = fakeLogin({ success: false, error: "timeout" });

		await expect(performWorkstationLogin({ paths, origins: ORIGINS, login })).resolves.toBeNull();
		expect(readCredential(paths)).toBeNull();
	});

	test("returns null with a stable message when the failure carries no error", async () => {
		const paths = getWorkstationPaths(home);
		const login = fakeLogin({ success: false });
		await expect(performWorkstationLogin({ paths, origins: ORIGINS, login })).resolves.toBeNull();
	});

	test("exchanges through HTTP when no exchange dependency is injected", async () => {
		const paths = getWorkstationPaths(home);
		const login = fakeLogin({ success: true, params: {} }, "code-1");
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					workstation_id: WORKSTATION_ID,
					token: TOKEN,
					worker_url: ORIGINS.machine,
				}),
				{ status: 200, headers: { "Content-Type": "application/json" } },
			),
		);
		vi.stubGlobal("fetch", fetchMock);

		try {
			const outcome = await performWorkstationLogin({ paths, origins: ORIGINS, login });
			expect(outcome?.credential.token).toBe(TOKEN);
			expect(fetchMock).toHaveBeenCalledOnce();
			expect(fetchMock.mock.calls[0]?.[0]).toBe(`${ORIGINS.machine}/api/workstation-auth/exchange`);
		} finally {
			vi.unstubAllGlobals();
		}
	});

	test("returns null when no authorization code arrives", async () => {
		const paths = getWorkstationPaths(home);
		const login = fakeLogin({ success: true, params: {} });

		await expect(performWorkstationLogin({ paths, origins: ORIGINS, login })).resolves.toBeNull();
	});

	test("returns null and stores nothing when the exchange fails", async () => {
		const paths = getWorkstationPaths(home);
		const login = fakeLogin({ success: true, params: {} }, "code-1");
		const exchange = vi.fn().mockRejectedValue(new Error("untrusted worker_url"));

		await expect(
			performWorkstationLogin({ paths, origins: ORIGINS, login, exchange }),
		).resolves.toBeNull();
		expect(readCredential(paths)).toBeNull();
		expect(readInstallationId(paths)).toMatch(/^[0-9a-f-]{36}$/);
	});

	test("uses the injected browser opener", async () => {
		const paths = getWorkstationPaths(home);
		const open = vi.fn().mockResolvedValue(undefined);
		const login = vi.fn(async (deps: BaseLoginDeps) => {
			captured = deps;
			deps.onSaveToken("code-1");
			return { success: true, params: {} } satisfies LoginResult;
		});
		const exchange = vi.fn().mockResolvedValue({
			workstation_id: WORKSTATION_ID,
			worker_url: ORIGINS.machine,
			token: TOKEN,
		});

		await performWorkstationLogin({ paths, origins: ORIGINS, login, exchange, open });
		expect(captured?.openBrowser).toBe(open);
	});
});

describe("consentHostname", () => {
	test("bounds the local hostname for the consent query", () => {
		expect(consentHostname("workstation-1")).toBe("workstation-1");
		expect(consentHostname("   ")).toBe("unknown");
		expect(consentHostname("a\r\nb\0c")).toBe("abc");
		expect(consentHostname("h".repeat(400))).toHaveLength(253);
	});
});

describe("runWorkstationLogin", () => {
	test("reports success with the workstation id", async () => {
		const paths = getWorkstationPaths(home);
		const login = fakeLogin({ success: true, params: {} }, "code-1");
		const exchange = vi.fn().mockResolvedValue({
			workstation_id: WORKSTATION_ID,
			worker_url: ORIGINS.machine,
			token: TOKEN,
		});

		const result = await runWorkstationLogin({ paths, origins: ORIGINS, login, exchange });

		expect(result.exitCode).toBe(0);
		expect(result.report?.workstationId).toBe(WORKSTATION_ID);
		expect(result.report?.workerUrl).toBe(ORIGINS.machine);
	});

	test("returns exit code 1 without a report on failure", async () => {
		const paths = getWorkstationPaths(home);
		const login = fakeLogin({ success: false, error: "denied" });

		const result = await runWorkstationLogin({ paths, origins: ORIGINS, login });
		expect(result.exitCode).toBe(1);
		expect(result.report).toBeUndefined();
	});
});
