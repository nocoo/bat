// Tests for the proper-lockfile probe lock adapter.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { acquireProbeLock, PROBE_LOCK_STALE_MS, PROBE_LOCK_UPDATE_MS } from "./lock.js";

let dir: string;
let lockPath: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "bat-ws-lock-"));
	lockPath = join(dir, "probe.lock");
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

describe("acquireProbeLock", () => {
	test("keeps the stale threshold above one probe run", () => {
		expect(PROBE_LOCK_STALE_MS).toBeGreaterThan(120_000);
		expect(PROBE_LOCK_UPDATE_MS).toBeLessThan(PROBE_LOCK_STALE_MS);
	});

	test("creates the lock directory and releases it", async () => {
		const lock = await acquireProbeLock(lockPath);
		expect(lock).not.toBeNull();
		expect(existsSync(lockPath)).toBe(true);
		await lock?.release();
		expect(existsSync(lockPath)).toBe(false);
	});

	test("refuses while another process holds it", async () => {
		const first = await acquireProbeLock(lockPath);
		await expect(acquireProbeLock(lockPath)).resolves.toBeNull();
		await first?.release();
	});

	test("takes over a stale lock", async () => {
		mkdirSync(lockPath);
		const stale = (Date.now() - 10_000) / 1000;
		utimesSync(lockPath, stale, stale);

		const lock = await acquireProbeLock(lockPath, { staleMs: 5000, updateMs: 1000 });
		expect(lock).not.toBeNull();
		await lock?.release();
	});

	test("reports a compromised lock and aborts its signal", async () => {
		const lock = await acquireProbeLock(lockPath, { staleMs: 5000, updateMs: 1000 });
		expect(lock).not.toBeNull();
		rmSync(lockPath, { recursive: true, force: true });

		await new Promise((resolve) => setTimeout(resolve, 1300));
		expect(lock?.compromised()).toBeInstanceOf(Error);
		expect(lock?.signal.aborted).toBe(true);
		await lock?.release().catch(() => undefined);
	});

	test("propagates errors that are not lock contention", async () => {
		await expect(acquireProbeLock(join(dir, "missing", "probe.lock"))).rejects.toThrow();
	});

	test("ignores a leftover plain file at the lock path", async () => {
		writeFileSync(lockPath, "not a directory");
		await expect(acquireProbeLock(lockPath)).resolves.toBeNull();
	});
});

describe("concurrency", () => {
	test("three barrier-synchronised processes yield exactly one holder", async () => {
		const modulePath = fileURLToPath(new URL("./lock.ts", import.meta.url));
		const barrierPath = join(dir, "barrier");
		const script = `
import { existsSync } from "node:fs";
import { acquireProbeLock } from ${JSON.stringify(modulePath)};
const barrier = process.env.BARRIER_PATH;
process.stdout.write("ready\\n");
while (!existsSync(barrier)) {
	await new Promise((resolve) => setTimeout(resolve, 5));
}
const lock = await acquireProbeLock(process.env.LOCK_PATH);
process.stdout.write(lock ? "acquired\\n" : "busy\\n");
if (lock) {
	await new Promise((resolve) => setTimeout(resolve, 400));
	await lock.release();
}
process.exit(0);
`;

		interface ChildHandle {
			ready: Promise<void>;
			done: Promise<string>;
		}

		const startChild = (): ChildHandle => {
			let resolveReady: () => void = () => undefined;
			const ready = new Promise<void>((resolve) => {
				resolveReady = resolve;
			});
			const child = spawn("bun", ["-e", script], {
				env: { ...process.env, LOCK_PATH: lockPath, BARRIER_PATH: barrierPath },
				stdio: ["ignore", "pipe", "pipe"],
			});
			let stdout = "";
			let stderr = "";
			let result = "";
			const done = new Promise<string>((resolve, reject) => {
				child.stdout.on("data", (chunk: Buffer) => {
					stdout += chunk.toString("utf-8");
					const lines = stdout.split("\n").map((line) => line.trim());
					if (lines.includes("ready")) {
						resolveReady();
					}
					const outcome = lines.find((line) => line === "acquired" || line === "busy");
					if (outcome) {
						result = outcome;
					}
				});
				child.stderr.on("data", (chunk: Buffer) => {
					stderr += chunk.toString("utf-8");
				});
				child.on("error", reject);
				child.on("close", (code) => {
					if (code !== 0) {
						reject(new Error(stderr || `child exited with ${code}`));
						return;
					}
					resolve(result);
				});
			});
			return { ready, done };
		};

		const children = [startChild(), startChild(), startChild()];
		await Promise.all(children.map((child) => child.ready));
		writeFileSync(barrierPath, "go");

		const results = await Promise.all(children.map((child) => child.done));
		expect(results.filter((line) => line === "acquired")).toHaveLength(1);
		expect(results.filter((line) => line === "busy")).toHaveLength(2);
		expect(existsSync(lockPath)).toBe(false);
	}, 20_000);
});
