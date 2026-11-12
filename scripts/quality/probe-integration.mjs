import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { removeOwned, storageRoot } from "../environments/runtime.mjs";
import { startTestEnvironment } from "../environments/test-process.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { BAT_PROBE_BIN } = process.env;

const HOST_TIMEOUT_MS = 90_000;
const METRICS_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;
const PROBE_STOP_GRACE_MS = 5000;
const OUTPUT_LIMIT = 4000;

function fail(message) {
	throw new Error(message);
}

function resolveProbeBinary() {
	const binary = BAT_PROBE_BIN
		? resolve(BAT_PROBE_BIN)
		: join(root, "probe/target/debug/bat-probe");
	if (!existsSync(binary))
		fail(
			`Probe binary missing at ${binary}. Build it first: cargo build --manifest-path probe/Cargo.toml`,
		);
	return binary;
}

function assertBuiltAssets() {
	const assets = join(root, "packages/worker/static/index.html");
	if (!existsSync(assets))
		fail(
			"Built Worker assets are missing. Build them first: bun run build (UI build writes packages/worker/static)",
		);
}

function probeConfig({ workerUrl, writeKey, hostId }) {
	return [
		`worker_url = "${workerUrl}"`,
		`write_key = "${writeKey}"`,
		`host_id = "${hostId}"`,
		"interval = 10",
		"",
	].join("\n");
}

function startProbe(binary, configPath) {
	const child = spawn(binary, ["--config", configPath], {
		stdio: ["ignore", "pipe", "pipe"],
		env: process.env,
	});
	let output = "";
	const collect = (chunk) => {
		output = (output + chunk).slice(-OUTPUT_LIMIT);
	};
	child.stdout.on("data", collect);
	child.stderr.on("data", collect);
	return {
		child,
		output: () => output,
		exited: () => child.exitCode !== null || child.signalCode !== null,
	};
}

async function stopProbe(probe) {
	if (!probe) return;
	const child = probe.child;
	if (!probe.exited()) {
		child.kill("SIGTERM");
		const exited = new Promise((done) => child.once("exit", done));
		await Promise.race([exited, new Promise((r) => setTimeout(r, PROBE_STOP_GRACE_MS))]);
		if (!probe.exited()) child.kill("SIGKILL");
		await Promise.race([exited, new Promise((r) => setTimeout(r, PROBE_STOP_GRACE_MS))]);
	}
}

async function getJson(url, key) {
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${key}` },
		signal: AbortSignal.timeout(5000),
	});
	if (!response.ok) throw new Error(`GET ${url} returned ${response.status}`);
	return response.json();
}

async function waitFor(label, timeoutMs, probe, probeFailure, check) {
	const deadline = Date.now() + timeoutMs;
	let lastError = "";
	while (Date.now() < deadline) {
		if (probe.exited())
			throw new Error(
				`${probeFailure} Probe exited early: ${probe.output().trim() || "(no output)"}`,
			);
		try {
			const result = await check();
			if (result) return result;
			lastError = "";
		} catch (error) {
			lastError = error instanceof Error ? error.message : String(error);
		}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
	throw new Error(`${label} timed out after ${timeoutMs}ms${lastError ? `: ${lastError}` : ""}`);
}

async function main() {
	const binary = resolveProbeBinary();
	assertBuiltAssets();

	const hostId = `e2e-rust-probe-${randomUUID()}`;
	const directory = mkdtempSync(join(tmpdir(), "bat-probe-integration-"));
	const configPath = join(directory, "probe.toml");
	let environment;
	let probe;
	let owner;
	try {
		environment = await startTestEnvironment("empty");
		owner = environment.access?.kid;
		const worker = environment.worker;
		if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(worker ?? ""))
			fail(`Unexpected local worker base: ${worker}`);

		writeFileSync(
			configPath,
			probeConfig({
				workerUrl: worker,
				writeKey: environment.writeKey,
				hostId,
			}),
			{ mode: 0o600 },
		);

		probe = startProbe(binary, configPath);
		await new Promise((r) => setTimeout(r, 500));
		if (probe.exited())
			fail(`Probe exited before reporting: ${probe.output().trim() || "(no output)"}`);

		const host = await waitFor(
			`Host ${hostId} never appeared in GET /api/hosts`,
			HOST_TIMEOUT_MS,
			probe,
			"Probe died before the host was registered.",
			async () => {
				const hosts = await getJson(`${worker}/api/hosts`, environment.readKey);
				if (!Array.isArray(hosts)) throw new Error("Unexpected /api/hosts payload");
				return hosts.find((item) => item.host_id === hostId) ?? null;
			},
		);
		console.log(`Host registered: ${host.host_id} (status ${host.status})`);

		const from = Math.floor(Date.now() / 1000) - 300;
		const to = Math.floor(Date.now() / 1000) + 60;
		const metrics = await waitFor(
			`No Rust probe metrics stored for ${hostId}`,
			METRICS_TIMEOUT_MS,
			probe,
			"Probe died before metrics were stored.",
			async () => {
				const payload = await getJson(
					`${worker}/api/hosts/${encodeURIComponent(hostId)}/metrics?from=${from}&to=${to}`,
					environment.readKey,
				);
				return Array.isArray(payload?.data) && payload.data.length > 0 ? payload : null;
			},
		);
		console.log(
			`Metrics stored: ${metrics.data.length} point(s), resolution ${metrics.resolution}`,
		);
		console.log("L3 probe integration: PASS");
	} finally {
		await stopProbe(probe);
		if (environment) {
			try {
				await environment.close();
			} catch (error) {
				console.error(
					`Local runtime close failed: ${error instanceof Error ? error.message : error}`,
				);
			}
		}
		if (owner) {
			try {
				removeOwned(join(storageRoot, owner), owner);
			} catch (error) {
				console.error(
					`Owned store cleanup failed: ${error instanceof Error ? error.message : error}`,
				);
			}
		}
		rmSync(directory, { recursive: true, force: true });
	}
}

await main();
