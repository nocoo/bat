// L2 globalSetup — boots one wrangler dev instance for the whole E2E run.
//
// Why globalSetup (vs per-file beforeAll):
//   - wrangler boot + migration apply costs ~10s. Doing it once instead of
//     per file keeps the suite fast as we split L2 into per-route files.
//   - Per-file files share BASE / WRITE_KEY / READ_KEY via env vars set here.
//
// Why we DON'T need an external dev server (zhe pattern):
//   - bat workers run via `wrangler dev --local` against in-process miniflare,
//     so spawning + waiting in this script is enough; no separate Next.js.
//
// Isolation guard (five layers, mirroring zhe docs/05-testing.md §L2):
//   1. `--local` — wrangler dev points at a local miniflare D1, never prod.
//   2. `--persist-to .wrangler/e2e/<random>` — a per-run state dir.
//   3. OS-assigned HTTP and Inspector ports prevent listener collisions.
//   4. After production migrations, we apply `fixtures/test_marker.sql` to
//      stamp the local DB, then assert the marker row exists. This file lives
//      outside `migrations/` so it's never applied to production D1 — the
//      marker doubles as a self-identification check that this loop is on a
//      test DB.
//   5. Pre-flight env scan — refuse to start if any env var that would point
//      wrangler at a remote/prod resource is set (CLOUDFLARE_API_TOKEN,
//      CLOUDFLARE_ACCOUNT_ID, WRANGLER_SEND_METRICS=true). Even though we
//      pass `--local`, defense-in-depth prevents an accidental future flag
//      from leaking auth credentials into the loop.

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = join(__dirname, "../..");
// Every invocation gets its own resources. A shared port allowed one run to
// pass readiness against another run's Worker, while a shared persist dir let
// simultaneous setup/teardown delete each other's D1 state.
const RUN_ID = randomBytes(12).toString("hex");
const PERSIST_DIR = join(WORKER_ROOT, ".wrangler/e2e", RUN_ID);
const E2E_ENV_PATH = join(WORKER_ROOT, `.wrangler/connect-e2e-${RUN_ID}.env`);
const MIGRATIONS_DIR = join(WORKER_ROOT, "migrations");
const TEST_MARKER_SQL = join(__dirname, "fixtures/test_marker.sql");

const WRITE_KEY = "e2e-write-key";
const READ_KEY = "e2e-read-key";

let wranglerProc: ChildProcess | null = null;
let wranglerOutput = "";

function readyBase(): string | null {
	const match = wranglerOutput.match(
		/\[wrangler:info\] Ready on http:\/\/(?:127\.0\.0\.1|localhost):(\d+)/,
	);
	return match ? `http://localhost:${match[1]}` : null;
}

async function waitForServer(timeoutMs = 30_000): Promise<string> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (wranglerProc && (wranglerProc.exitCode !== null || wranglerProc.signalCode !== null)) {
			throw new Error(
				`Wrangler exited before the Worker E2E server became ready:\n${wranglerOutput}`,
			);
		}
		const base = readyBase();
		if (!base) {
			await sleep(300);
			continue;
		}
		try {
			const res = await fetch(`${base}/`);
			if (res.ok || res.status === 401 || res.status === 503) {
				return base;
			}
		} catch {
			// not ready yet
		}
		await sleep(300);
	}
	throw new Error(`Wrangler did not start within ${timeoutMs}ms:\n${wranglerOutput}`);
}

async function runCommand(cmd: string[], cwd: string): Promise<string> {
	const [bin, ...args] = cmd;
	const proc = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
	let stdout = "";
	let stderr = "";
	proc.stdout?.on("data", (chunk) => {
		stdout += chunk.toString();
	});
	proc.stderr?.on("data", (chunk) => {
		stderr += chunk.toString();
	});
	const exitCode: number = await new Promise((resolve, reject) => {
		proc.on("error", reject);
		proc.on("exit", (code) => resolve(code ?? 1));
	});
	if (exitCode !== 0) {
		throw new Error(`Command failed (exit ${exitCode}): ${cmd.join(" ")}\n${stderr}`);
	}
	return stdout;
}

/** Auto-discover migrations in lexical order — replaces the hardcoded list
 *  that previously lived inline in wrangler.test.ts. New migrations no longer
 *  need a manual edit here (a recurring foot-gun documented in CLAUDE.md). */
function discoverMigrations(): string[] {
	return readdirSync(MIGRATIONS_DIR)
		.filter((f) => /^\d{4}_.+\.sql$/.test(f))
		.sort()
		.map((f) => join("migrations", f));
}

/** Isolation guard layer 5 — refuse to run if env vars are set that could
 *  point wrangler at a remote (production) Cloudflare resource. Defense in
 *  depth: even though we pass `--local`, a future flag drift or
 *  child-process inheritance must not be able to reach prod. */
function assertNoRemoteCloudflareEnv(): void {
	const offenders = ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CF_API_TOKEN"].filter(
		(k) => process.env[k],
	);
	if (offenders.length > 0) {
		throw new Error(
			`E2E isolation guard failed: refusing to start with ${offenders.join(", ")} set. These could let wrangler reach a remote Cloudflare resource. Unset them and re-run.`,
		);
	}
}

export async function setup(): Promise<void> {
	assertNoRemoteCloudflareEnv();
	mkdirSync(dirname(E2E_ENV_PATH), { recursive: true });
	const keyring = JSON.stringify({
		active: "test",
		keys: { test: randomBytes(32).toString("base64url") },
	});
	writeFileSync(
		E2E_ENV_PATH,
		`BAT_WRITE_KEY=${WRITE_KEY}\nBAT_READ_KEY=${READ_KEY}\nCONNECT_TOKEN_KEYS='${keyring}'\n`,
		{ mode: 0o600 },
	);

	const migrations = discoverMigrations();
	for (const migration of migrations) {
		await runCommand(
			[
				"npx",
				"wrangler",
				"d1",
				"execute",
				"bat-db",
				"--local",
				"--persist-to",
				PERSIST_DIR,
				"--file",
				migration,
			],
			WORKER_ROOT,
		);
	}

	// Apply test marker AFTER production migrations — this file lives outside
	// migrations/ so it never gets applied to production D1.
	await runCommand(
		[
			"npx",
			"wrangler",
			"d1",
			"execute",
			"bat-db",
			"--local",
			"--persist-to",
			PERSIST_DIR,
			"--file",
			TEST_MARKER_SQL,
		],
		WORKER_ROOT,
	);

	// Isolation guard layer 4 — assert _test_marker present. If a future
	// refactor accidentally points this loop at a non-test D1, the marker
	// row is absent (no migration 0018 applied) and we fail loud.
	const markerOut = await runCommand(
		[
			"npx",
			"wrangler",
			"d1",
			"execute",
			"bat-db",
			"--local",
			"--persist-to",
			PERSIST_DIR,
			"--command",
			"SELECT value FROM _test_marker WHERE key = 'env'",
		],
		WORKER_ROOT,
	);
	if (!markerOut.includes("test")) {
		throw new Error("E2E isolation guard failed: _test_marker.env != 'test'. Refusing to proceed.");
	}

	wranglerOutput = "";
	wranglerProc = spawn(
		"npx",
		[
			"wrangler",
			"dev",
			"--port",
			"0",
			"--inspector-port",
			"0",
			"--local",
			"--persist-to",
			PERSIST_DIR,
			"--env-file",
			E2E_ENV_PATH,
		],
		{ cwd: WORKER_ROOT, stdio: ["ignore", "pipe", "pipe"] },
	);
	for (const stream of [wranglerProc.stdout, wranglerProc.stderr]) {
		stream?.on("data", (chunk) => {
			wranglerOutput = `${wranglerOutput}${chunk}`.slice(-4_000);
		});
	}

	const base = await waitForServer();

	process.env.BAT_E2E_BASE = base;
	process.env.BAT_E2E_WRITE_KEY = WRITE_KEY;
	process.env.BAT_E2E_READ_KEY = READ_KEY;
}

export async function teardown(): Promise<void> {
	if (wranglerProc) {
		const proc = wranglerProc;
		wranglerProc = null;
		const exited = new Promise<void>((resolve) => proc.once("exit", resolve));
		proc.kill();
		await Promise.race([exited, sleep(5_000)]);
	}
	wranglerOutput = "";
	rmSync(E2E_ENV_PATH, { force: true });
	if (existsSync(PERSIST_DIR)) {
		rmSync(PERSIST_DIR, { recursive: true, force: true });
	}
}
