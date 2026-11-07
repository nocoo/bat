// Workstation login: PKCE browser authorization followed by a machine exchange.
// Reuses the base-cli loopback callback and adds the PKCE challenge parameters.

import { createHash, randomBytes } from "node:crypto";
import { hostname as osHostname } from "node:os";
import { WORKSTATION_LIMITS } from "@bat/shared";
import { openBrowser, performLogin } from "@nocoo/base-cli";
import { error, info, success } from "../lib/output.js";
import { exchangeLogin } from "./api.js";
import { performHeadlessLogin } from "./headless.js";
import type { WorkstationOrigins } from "./origins.js";
import {
	ensureInstallationId,
	type StoreDeps,
	type WorkstationCredential,
	type WorkstationPaths,
	writeCredential,
} from "./store.js";

const LOGIN_TIMEOUT_MS = 120_000;

export interface PkcePair {
	verifier: string;
	challenge: string;
}

/** 43-char base64url verifier and its S256 challenge. */
export function generatePkce(): PkcePair {
	const verifier = randomBytes(32).toString("base64url");
	const challenge = createHash("sha256").update(verifier).digest("base64url");
	return { verifier, challenge };
}

/** Consent page shows a bounded local hostname, never a hardware fingerprint. */
export function consentHostname(value: string = osHostname()): string {
	const cleaned = value.replace(/[\r\n\0]/g, "").trim();
	return (cleaned || "unknown").slice(0, WORKSTATION_LIMITS.hostname);
}

/** Emits the pairing instructions; the command layer keeps output formatting. */
export type HeadlessAnnouncer = (text: {
	code: string;
	url: string;
	name: string;
	expiresAt: number;
}) => void;

export interface LoginDeps {
	paths: WorkstationPaths;
	origins: WorkstationOrigins;
	store?: StoreDeps;
	login?: typeof performLogin;
	open?: (url: string) => Promise<void>;
	exchange?: typeof exchangeLogin;
	/** Hostname source, injectable for tests. */
	hostname?: () => string;
}

export interface LoginOutcome {
	installationId: string;
	credential: WorkstationCredential;
}

/**
 * Run the PKCE login. Returns null when the browser step or the exchange failed;
 * the caller decides the exit code. Nothing is persisted before a valid exchange.
 */
export async function performWorkstationLogin(deps: LoginDeps): Promise<LoginOutcome | null> {
	const installationId = await ensureInstallationId(deps.paths, deps.store);
	const pkce = generatePkce();
	const login = deps.login ?? performLogin;

	let code: string | undefined;
	const result = await login({
		openBrowser: deps.open ?? openBrowser,
		onSaveToken: (token: string) => {
			code = token;
		},
		apiUrl: deps.origins.dashboard,
		loginPath: "/workstation-login",
		tokenParam: "code",
		timeoutMs: LOGIN_TIMEOUT_MS,
		accentColor: "#3b82f6",
		extraParams: {
			installation_id: installationId,
			code_challenge: pkce.challenge,
			code_challenge_method: "S256",
			hostname: consentHostname((deps.hostname ?? osHostname)()),
		},
	});

	if (!result.success) {
		error(`Login failed: ${result.error ?? "no response"}`);
		return null;
	}
	if (!code) {
		error("Login failed: no authorization code received");
		return null;
	}

	let credential: WorkstationCredential;
	try {
		credential = await (deps.exchange ?? exchangeLogin)(deps.origins, {
			code,
			code_verifier: pkce.verifier,
			installation_id: installationId,
		});
	} catch (err) {
		error(`Login exchange failed: ${(err as Error).message}`);
		return null;
	}

	await writeCredential(deps.paths, credential, deps.store);
	return { installationId, credential };
}

export interface LoginReport {
	installationId: string;
	workstationId: string;
	configPath: string;
	workerUrl: string;
}

export async function runWorkstationLogin(
	deps: LoginDeps & { headless?: { name: string; announce?: HeadlessAnnouncer } },
): Promise<{ exitCode: number; report?: LoginReport }> {
	info(`Dashboard: ${deps.origins.dashboard}`);
	info(`Ingest: ${deps.origins.machine}`);
	if (deps.headless === undefined) {
		info("Opening browser for workstation authorization...");
	} else {
		info(`Headless pairing for "${deps.headless.name}" — no browser on this machine.`);
	}

	const outcome =
		deps.headless === undefined
			? await performWorkstationLogin(deps)
			: await performHeadlessLogin({
					paths: deps.paths,
					origins: deps.origins,
					name: deps.headless.name,
					...(deps.store ? { store: deps.store } : {}),
					...(deps.headless.announce ? { announce: deps.headless.announce } : {}),
				});
	if (!outcome) {
		return { exitCode: 1 };
	}

	success(`Workstation linked: ${outcome.credential.workstation_id}`);
	info(`  installation: ${outcome.installationId}`);
	info(`  config: ${deps.paths.credentialPath}`);
	info("");
	info("Next steps:");
	info("  bat workstation probe      — send one report now");
	info("  bat workstation setup      — install the 10 minute schedule");

	return {
		exitCode: 0,
		report: {
			installationId: outcome.installationId,
			workstationId: outcome.credential.workstation_id,
			configPath: deps.paths.credentialPath,
			workerUrl: outcome.credential.worker_url,
		},
	};
}
