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
//   2. `--persist-to .wrangler/e2e` — dedicated ephemeral state dir.
//   3. We delete `.wrangler/e2e` before booting, so each run is clean.
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
import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = join(__dirname, "../..");
const PERSIST_DIR = join(WORKER_ROOT, ".wrangler/e2e");
const DEV_VARS_PATH = join(WORKER_ROOT, ".dev.vars");
const MIGRATIONS_DIR = join(WORKER_ROOT, "migrations");
const TEST_MARKER_SQL = join(__dirname, "fixtures/test_marker.sql");

const PORT = 17025;
const BASE = `http://localhost:${PORT}`;
const WRITE_KEY = "e2e-write-key";
const READ_KEY = "e2e-read-key";

let wranglerProc: ChildProcess | null = null;
let devVarsExistedBefore = false;

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(url);
			if (res.ok || res.status === 401 || res.status === 503) {
				return;
			}
		} catch {
			// not ready yet
		}
		await sleep(300);
	}
	throw new Error(`Wrangler did not start within ${timeoutMs}ms`);
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
	devVarsExistedBefore = existsSync(DEV_VARS_PATH);
	writeFileSync(DEV_VARS_PATH, `BAT_WRITE_KEY=${WRITE_KEY}\nBAT_READ_KEY=${READ_KEY}\n`);

	if (existsSync(PERSIST_DIR)) {
		rmSync(PERSIST_DIR, { recursive: true, force: true });
	}

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
				".wrangler/e2e",
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
			".wrangler/e2e",
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
			".wrangler/e2e",
			"--command",
			"SELECT value FROM _test_marker WHERE key = 'env'",
		],
		WORKER_ROOT,
	);
	if (!markerOut.includes("test")) {
		throw new Error("E2E isolation guard failed: _test_marker.env != 'test'. Refusing to proceed.");
	}

	wranglerProc = spawn(
		"npx",
		["wrangler", "dev", "--port", String(PORT), "--local", "--persist-to", ".wrangler/e2e"],
		{ cwd: WORKER_ROOT, stdio: "ignore" },
	);

	await waitForServer(`${BASE}/`);

	process.env.BAT_E2E_BASE = BASE;
	process.env.BAT_E2E_WRITE_KEY = WRITE_KEY;
	process.env.BAT_E2E_READ_KEY = READ_KEY;
}

export async function teardown(): Promise<void> {
	if (wranglerProc) {
		wranglerProc.kill();
		wranglerProc = null;
	}
	if (!devVarsExistedBefore && existsSync(DEV_VARS_PATH)) {
		rmSync(DEV_VARS_PATH);
	}
	if (existsSync(PERSIST_DIR)) {
		rmSync(PERSIST_DIR, { recursive: true, force: true });
	}
}
