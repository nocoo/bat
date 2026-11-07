// Headless workstation login: no browser on the machine.
//
// The CLI starts a pairing (PKCE challenge + display name), prints an eight
// character code and waits. An operator approves that code in the dashboard
// while signed in to Access, and only then does the exchange succeed.

import { formatPairingCode, WORKSTATION_PAIRING_TTL_SECONDS } from "@bat/shared";
import { error, info, success } from "../lib/output.js";
import { exchangeLogin, pairingStatus, startPairing } from "./api.js";
import { generatePkce, type LoginOutcome } from "./login.js";
import type { WorkstationOrigins } from "./origins.js";
import type { StoreDeps, WorkstationCredential, WorkstationPaths } from "./store.js";
import { ensureInstallationId, writeCredential } from "./store.js";

export const PAIRING_POLL_MS = 5_000;

export interface HeadlessDeps {
	paths: WorkstationPaths;
	origins: WorkstationOrigins;
	name: string;
	store?: StoreDeps;
	start?: typeof startPairing;
	status?: typeof pairingStatus;
	exchange?: typeof exchangeLogin;
	sleep?: (ms: number) => Promise<void>;
	now?: () => number;
	/** Emits the pairing instructions; tests capture them. */
	announce?: (text: { code: string; url: string; name: string; expiresAt: number }) => void;
	signal?: AbortSignal;
}

/**
 * Run the pairing. Returns null when the operator never approves within the
 * code lifetime; nothing is persisted before a successful exchange.
 */
export async function performHeadlessLogin(deps: HeadlessDeps): Promise<LoginOutcome | null> {
	const now = deps.now ?? (() => Math.floor(Date.now() / 1000));
	const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const installationId = await ensureInstallationId(deps.paths, deps.store);
	const pkce = generatePkce();

	let start: Awaited<ReturnType<typeof startPairing>>;
	try {
		start = await (deps.start ?? startPairing)(deps.origins, {
			installation_id: installationId,
			name: deps.name,
			code_challenge: pkce.challenge,
		});
	} catch (err) {
		error(`Pairing failed: ${(err as Error).message}`);
		return null;
	}

	(deps.announce ?? defaultAnnounce)({
		code: formatPairingCode(start.pairing_code),
		url: `${deps.origins.dashboard}/workstations`,
		name: start.name,
		expiresAt: start.expires_at,
	});

	const deadline = Math.min(start.expires_at, now() + WORKSTATION_PAIRING_TTL_SECONDS);
	for (;;) {
		if (deps.signal?.aborted) {
			error("Pairing cancelled");
			return null;
		}
		if (now() >= deadline) {
			error("Pairing code expired before it was approved");
			return null;
		}
		await sleep(PAIRING_POLL_MS);
		let status: Awaited<ReturnType<typeof pairingStatus>>;
		try {
			status = await (deps.status ?? pairingStatus)(deps.origins, start.pairing_code, {
				...(deps.signal ? { signal: deps.signal } : {}),
			});
		} catch (err) {
			error(`Pairing status failed: ${(err as Error).message}`);
			return null;
		}
		if (status.status === "expired") {
			error("Pairing code expired before it was approved");
			return null;
		}
		if (status.status === "approved") {
			break;
		}
	}

	let credential: WorkstationCredential;
	try {
		credential = await (deps.exchange ?? exchangeLogin)(deps.origins, {
			code: start.code,
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

function defaultAnnounce(text: {
	code: string;
	url: string;
	name: string;
	expiresAt: number;
}): void {
	info(`Pairing code: ${text.code}`);
	info(`  name: ${text.name}`);
	info(`  approve at: ${text.url} → "Pair a workstation"`);
	info(`  expires: ${new Date(text.expiresAt * 1000).toLocaleTimeString()}`);
	info("");
	info("Waiting for approval...");
	success("(leave this terminal open)");
}
