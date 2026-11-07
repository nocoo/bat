// Tests for the headless pairing login: no browser anywhere on the machine.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkstationPairStatus } from "@bat/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { pairingStatus, startPairing } from "./api.js";
import { PAIRING_POLL_MS, performHeadlessLogin } from "./headless.js";
import type { WorkstationCredential } from "./store.js";
import { getWorkstationPaths, readCredential } from "./store.js";

const WORKSTATION_ID = "771e8400-e29b-41d4-a716-446655440000";
const TOKEN = `batw_${"a".repeat(43)}`;
const ORIGINS = {
	dashboard: "https://bat.hexly.ai",
	machine: "https://bat-ingest.worker.hexly.ai",
};
const CREDENTIAL: WorkstationCredential = {
	workstation_id: WORKSTATION_ID,
	token: TOKEN,
	worker_url: ORIGINS.machine,
};

let home: string;

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), "bat-ws-headless-"));
});

afterEach(() => {
	rmSync(home, { recursive: true, force: true });
});

function deps(overrides: Record<string, unknown> = {}) {
	const paths = getWorkstationPaths(home);
	const announce = vi.fn();
	const start = vi.fn(async () => ({
		pairing_code: "ABCD2345",
		code: "c".repeat(43),
		name: "Headless laptop",
		expires_at: 1_000_300,
	}));
	const status = vi.fn(async () => ({
		status: "approved" as WorkstationPairStatus,
		name: "Headless laptop",
		expires_at: 1_000_300,
	}));
	const exchange = vi.fn(async () => CREDENTIAL);
	let clock = 1_000_000;
	return {
		paths,
		origins: ORIGINS,
		name: "Headless laptop",
		start,
		status,
		exchange,
		announce,
		sleep: vi.fn(async () => {
			clock += PAIRING_POLL_MS / 1000;
		}),
		now: () => clock,
		...overrides,
	};
}

describe("performHeadlessLogin", () => {
	test("prints the pairing code, waits for approval and stores the key", async () => {
		const d = deps();
		const outcome = await performHeadlessLogin(d as never);
		expect(outcome?.credential.token).toBe(TOKEN);
		expect(d.announce).toHaveBeenCalledWith({
			code: "ABCD-2345",
			url: "https://bat.hexly.ai/workstations",
			name: "Headless laptop",
			expiresAt: 1_000_300,
		});
		expect(d.start).toHaveBeenCalledWith(
			ORIGINS,
			expect.objectContaining({ name: "Headless laptop", installation_id: expect.any(String) }),
		);
		expect(d.exchange).toHaveBeenCalledWith(
			ORIGINS,
			expect.objectContaining({ code: "c".repeat(43), installation_id: expect.any(String) }),
		);
		expect(readCredential(d.paths)?.workstation_id).toBe(WORKSTATION_ID);
	});

	test("keeps polling while the operator has not approved yet", async () => {
		const d = deps();
		let calls = 0;
		d.status = vi.fn(async () => {
			calls += 1;
			return {
				status: (calls < 3 ? "pending" : "approved") as WorkstationPairStatus,
				name: "Headless laptop",
				expires_at: 1_000_300,
			};
		});
		const outcome = await performHeadlessLogin(d as never);
		expect(outcome).not.toBeNull();
		expect(calls).toBe(3);
	});

	test("gives up when the code expires and never stores a credential", async () => {
		const d = deps();
		d.status = vi.fn(async () => ({
			status: "expired" as WorkstationPairStatus,
			name: "x",
			expires_at: 1_000_300,
		}));
		const outcome = await performHeadlessLogin(d as never);
		expect(outcome).toBeNull();
		expect(readCredential(d.paths)).toBeNull();
	});

	test("stops at the deadline even if the status keeps saying pending", async () => {
		const d = deps();
		d.status = vi.fn(async () => ({
			status: "pending" as WorkstationPairStatus,
			name: "x",
			expires_at: 2_000_000,
		}));
		const outcome = await performHeadlessLogin(d as never);
		expect(outcome).toBeNull();
		expect(readCredential(d.paths)).toBeNull();
	});

	test("reports a failed start or exchange without persisting anything", async () => {
		const failedStart = deps();
		failedStart.start = vi.fn(async () => {
			throw new Error("pairing rejected");
		});
		expect(await performHeadlessLogin(failedStart as never)).toBeNull();

		const failedExchange = deps();
		failedExchange.exchange = vi.fn(async () => {
			throw new Error("not approved");
		});
		expect(await performHeadlessLogin(failedExchange as never)).toBeNull();
		expect(readCredential(failedExchange.paths)).toBeNull();
	});
});

describe("headless defaults and API validation", () => {
	test("uses the real clock, sleeper and announcer when no overrides are given", async () => {
		const paths = getWorkstationPaths(home);
		const outcome = await performHeadlessLogin({
			paths,
			origins: ORIGINS,
			name: "Default laptop",
			start: async () => ({
				pairing_code: "ABCD2345",
				code: "c".repeat(43),
				name: "Default laptop",
				expires_at: Math.floor(Date.now() / 1000) + 300,
			}),
			status: async () => ({
				status: "approved" as WorkstationPairStatus,
				name: "Default laptop",
				expires_at: Math.floor(Date.now() / 1000) + 300,
			}),
			exchange: async () => CREDENTIAL,
			sleep: async () => undefined,
		});
		expect(outcome?.credential.token).toBe(TOKEN);
		expect(readCredential(paths)?.workstation_id).toBe(WORKSTATION_ID);
	});

	test("stops when the caller aborts the wait", async () => {
		const paths = getWorkstationPaths(home);
		const controller = new AbortController();
		controller.abort();
		const outcome = await performHeadlessLogin({
			paths,
			origins: ORIGINS,
			name: "Aborted",
			start: async () => ({
				pairing_code: "ABCD2345",
				code: "c".repeat(43),
				name: "Aborted",
				expires_at: 2_000_000,
			}),
			status: async () => ({
				status: "pending" as WorkstationPairStatus,
				name: "Aborted",
				expires_at: 2_000_000,
			}),
			exchange: async () => CREDENTIAL,
			signal: controller.signal,
			sleep: async () => undefined,
		});
		expect(outcome).toBeNull();
	});

	test("surfaces a failing status poll", async () => {
		const paths = getWorkstationPaths(home);
		const outcome = await performHeadlessLogin({
			paths,
			origins: ORIGINS,
			name: "Broken",
			start: async () => ({
				pairing_code: "ABCD2345",
				code: "c".repeat(43),
				name: "Broken",
				expires_at: 2_000_000,
			}),
			status: async () => {
				throw new Error("network down");
			},
			exchange: async () => CREDENTIAL,
			sleep: async () => undefined,
		});
		expect(outcome).toBeNull();
	});
});

describe("pairing API validation", () => {
	test("rejects a malformed pairing start response", async () => {
		const responses: unknown[] = [
			null,
			{ pairing_code: "AB", code: "c".repeat(43), expires_at: 1 },
			{ pairing_code: "ABCD2345", code: "short", expires_at: 1 },
			{ pairing_code: "ABCD2345", code: "c".repeat(43), expires_at: "soon" },
			{ pairing_code: "ABCD2345", code: "c".repeat(43), expires_at: Number.NaN },
		];
		for (const body of responses) {
			await expect(startPairingWith(body)).rejects.toThrow(/pairing start/);
		}
	});

	test("rejects an unknown pairing status payload or code", async () => {
		await expect(pairingStatusWith({ status: "weird", name: "x", expires_at: 1 })).rejects.toThrow(
			/unknown state/,
		);
		await expect(pairingStatusWith(null)).rejects.toThrow(/no object/);
		await expect(pairingStatus(ORIGINS, "nope")).rejects.toThrow(/invalid pairing code/);
	});
});

async function startPairingWith(body: unknown) {
	const original = globalThis.fetch;
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			status: 201,
			headers: { "Content-Type": "application/json" },
		})) as unknown as typeof fetch;
	try {
		return await startPairing(ORIGINS, {
			installation_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
			name: "Headless",
			code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
		});
	} finally {
		globalThis.fetch = original;
	}
}

async function pairingStatusWith(body: unknown) {
	const original = globalThis.fetch;
	globalThis.fetch = (async () =>
		new Response(JSON.stringify(body), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})) as unknown as typeof fetch;
	try {
		return await pairingStatus(ORIGINS, "ABCD-2345");
	} finally {
		globalThis.fetch = original;
	}
}
