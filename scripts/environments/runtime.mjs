import { Database } from "bun:sqlite";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	exportJWK,
	generateKeyPair,
	SignJWT,
} from "../../packages/worker/node_modules/jose/dist/webapi/index.js";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const workerRoot = join(root, "packages/worker");
export const storageRoot = join(workerRoot, ".wrangler/environments");
const cli = join(workerRoot, "node_modules/wrangler/bin/wrangler.js");
const remoteKeys = [
	"CLOUDFLARE_API_TOKEN",
	"CLOUDFLARE_ACCOUNT_ID",
	"CF_API_TOKEN",
	"CLOUDFLARE_API_KEY",
	"CLOUDFLARE_EMAIL",
	"CF_API_KEY",
	"CF_EMAIL",
	"CF_ACCOUNT_ID",
	"CF_ACCESS_CLIENT_SECRET",
	"CF_ACCESS_CLIENT_ID",
	"BAT_WRITE_KEY",
	"BAT_READ_KEY",
];
export function isolatedEnvironment(source = process.env) {
	const env = { ...source, WRANGLER_SEND_METRICS: "false" };
	for (const key of remoteKeys) delete env[key];
	return env;
}
export function assertTestEnvironment() {
	if (remoteKeys.some((key) => process.env[key]))
		throw new Error("E2E refuses production credentials");
}
function files(path) {
	return readdirSync(path, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? files(join(path, e.name)) : [join(path, e.name)],
	);
}
export function verifyOwnership(path, owner) {
	if (resolve(path) !== join(storageRoot, owner) || !/^(demo|e2e-[a-f0-9-]{36})$/.test(owner))
		throw new Error("Foreign storage path");
	if (realpathSync(path) !== resolve(path)) throw new Error("Symlink storage rejected");
	const manifest = JSON.parse(readFileSync(join(path, "owner.json"), "utf8"));
	if (manifest.owner !== owner || manifest.application !== "bat")
		throw new Error("Foreign storage owner");
	const dbs = files(join(path, "state")).filter(
		(p) => p.endsWith(".sqlite") && !p.endsWith("/metadata.sqlite") && p.includes("/d1/"),
	);
	if (dbs.length !== 1) throw new Error("Expected one owned D1 database");
	if (realpathSync(dbs[0]) !== resolve(dbs[0])) throw new Error("Symlink database rejected");
	const db = new Database(dbs[0], { readwrite: true, create: false });
	try {
		const marker = db.query("SELECT value FROM _test_marker WHERE key='owner'").get();
		const context = db.query("SELECT value FROM _test_marker WHERE key='env'").get();
		if (marker?.value !== owner || context?.value !== (owner === "demo" ? "demo" : "test"))
			throw new Error("D1 ownership marker mismatch");
	} finally {
		db.close();
	}
	return manifest;
}
export function removeOwned(path, owner) {
	if (existsSync(join(path, "running.lock")))
		throw new Error("Storage is running; stop its launcher before reset");
	verifyOwnership(path, owner);
	rmSync(path, { recursive: true });
}
export function productionConfig() {
	const base = Bun.TOML.parse(readFileSync(join(workerRoot, "wrangler.toml"), "utf8"));
	const { env, ...common } = base;
	return { ...common, ...env.production };
}
export function localConfig(path, identity, owner) {
	const prod = productionConfig();
	const config = {
		...prod,
		name: "bat-local",
		main: join(workerRoot, "src/entry.ts"),
		routes: [],
		workers_dev: false,
		preview_urls: false,
		assets: { ...prod.assets, directory: join(workerRoot, "static") },
		d1_databases: [
			{
				binding: "DB",
				database_name: "bat-db",
				database_id: "00000000-0000-0000-0000-000000000001",
				migrations_dir: join(workerRoot, "migrations"),
			},
		],
		kv_namespaces: prod.kv_namespaces?.map((k) => ({
			binding: k.binding,
			id: "00000000000000000000000000000001",
		})),
		vars: {
			ENVIRONMENT: "development",
			CONNECT_DEPLOYMENT_ID: owner,
			CF_ACCESS_TEAM_DOMAIN: "bat-fixture.invalid",
			CF_ACCESS_AUD: owner,
			CF_ACCESS_LOCAL_JWKS: JSON.stringify({ keys: [identity.publicKey] }),
			CONNECT_MANAGERS: "email:operator@example.test",
			BAT_WRITE_KEY: identity.writeKey,
			BAT_READ_KEY: identity.readKey,
			CONNECT_TOKEN_KEYS: JSON.stringify({
				active: "fixture",
				keys: { fixture: identity.connectKey },
			}),
		},
		dev: { ip: "127.0.0.1", port: 0 },
		triggers: { crons: [] },
		observability: { enabled: false },
	};
	if (JSON.stringify(config).includes('"remote":true')) throw new Error("Remote bindings rejected");
	writeFileSync(join(path, "wrangler.json"), JSON.stringify(config, null, 2), { mode: 0o600 });
	return config;
}
async function execute(path, args) {
	const child = spawn(
		process.execPath.includes("bun") ? "node" : process.execPath,
		[cli, ...args, "--config", join(path, "wrangler.json"), "--env-file", join(path, "empty.env")],
		{ cwd: workerRoot, env: isolatedEnvironment(), stdio: ["ignore", "pipe", "pipe"] },
	);
	let output = "";
	child.stdout.on("data", (c) => (output += c));
	child.stderr.on("data", (c) => (output += c));
	const code = await new Promise((ok, fail) => {
		child.once("error", fail);
		child.once("exit", ok);
	});
	if (code !== 0)
		throw new Error(`Local Wrangler command failed (${code}): ${output.slice(-2500)}`);
	return output;
}
async function stopWorker(child) {
	if (!child || child.exitCode !== null || child.signalCode !== null) return;
	const exited = new Promise((resolve) => child.once("exit", resolve));
	child.kill();
	await Promise.race([exited, Bun.sleep(5000)]);
	if (child.exitCode === null && child.signalCode === null)
		throw new Error("Worker did not stop; owned storage retained");
}
export async function createRuntime({
	mode = "e2e",
	dataset = "empty",
	anchor = Math.floor(Date.now() / 1000),
} = {}) {
	if (!["demo", "e2e"].includes(mode)) throw new Error("Invalid local mode");
	const owner = mode === "demo" ? "demo" : `e2e-${randomUUID()}`;
	const path = join(storageRoot, owner);
	const fresh = !existsSync(path);
	mkdirSync(path, { recursive: true });
	const lock = join(path, "running.lock");
	const lockFd = openSync(lock, "wx", 0o600);
	closeSync(lockFd);
	writeFileSync(lock, String(process.pid));
	let provider, child;
	try {
		let identity;
		if (fresh) {
			mkdirSync(path, { recursive: true });
			writeFileSync(
				join(path, "owner.json"),
				JSON.stringify({
					application: "bat",
					owner,
					anchor,
					dataset,
					fixtureVersion: 2,
					ready: false,
				}),
				{ mode: 0o600 },
			);
			const pair = await generateKeyPair("RS256", { extractable: true });
			identity = {
				publicKey: { ...(await exportJWK(pair.publicKey)), kid: owner, alg: "RS256" },
				privateKey: await exportJWK(pair.privateKey),
				writeKey: randomBytes(32).toString("hex"),
				readKey: randomBytes(32).toString("hex"),
				connectKey: randomBytes(32).toString("base64url"),
			};
			writeFileSync(join(path, "identity.json"), JSON.stringify(identity), { mode: 0o600 });
		} else {
			const manifest = verifyOwnership(path, owner);
			if (!manifest.ready)
				throw new Error(
					"Incomplete fixture initialization; inspect the retained store before explicit reset",
				);
			anchor = manifest.anchor;
			identity = JSON.parse(readFileSync(join(path, "identity.json"), "utf8"));
		}
		provider = Bun.serve({
			hostname: "127.0.0.1",
			port: 0,
			fetch: (request) =>
				new URL(request.url).pathname === "/profile"
					? Response.json({
							name: "Morgan Chen",
							avatar:
								"data:image/svg+xml," +
								encodeURIComponent(
									'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="#365f70"/><text x="48" y="59" text-anchor="middle" fill="white" font-family="sans-serif" font-size="32">MC</text></svg>',
								),
						})
					: new Response("Not found", { status: 404 }),
		});
		const config = localConfig(path, identity, owner);
		config.vars.AUTHOR_PROFILE_URL = `http://127.0.0.1:${provider.port}/profile`;
		writeFileSync(join(path, "wrangler.json"), JSON.stringify(config, null, 2), { mode: 0o600 });
		writeFileSync(join(path, "empty.env"), "");
		const sql = async (statement) => {
			writeFileSync(join(path, "command.sql"), statement);
			return execute(path, [
				"d1",
				"execute",
				"bat-db",
				"--local",
				"--persist-to",
				join(path, "state"),
				"--file",
				join(path, "command.sql"),
			]);
		};
		if (fresh)
			await sql(
				`CREATE TABLE _test_marker(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO _test_marker VALUES ('env','${mode === "demo" ? "demo" : "test"}'),('owner','${owner}');`,
			);
		verifyOwnership(path, owner);
		await execute(path, [
			"d1",
			"migrations",
			"apply",
			"bat-db",
			"--local",
			"--persist-to",
			join(path, "state"),
		]);
		if (fresh && dataset !== "empty") {
			const { fixtureSql } = await import("./fixtures.mjs");
			await sql(fixtureSql(dataset, anchor));
		}
		const log = join(path, "worker.log"),
			fd = openSync(log, "w");
		child = spawn(
			"node",
			[
				cli,
				"dev",
				"--config",
				join(path, "wrangler.json"),
				"--env-file",
				join(path, "empty.env"),
				"--local",
				"--persist-to",
				join(path, "state"),
				"--port",
				"0",
				"--inspector-port",
				"0",
			],
			{ cwd: workerRoot, env: isolatedEnvironment(), stdio: ["ignore", fd, fd] },
		);
		closeSync(fd);
		let base,
			healthy = false;
		for (let i = 0; i < 120; i++) {
			if (child.exitCode !== null) throw new Error(`Worker exited; see ${log}`);
			const ready = readFileSync(log, "utf8").matchAll(
				/Ready on http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/g,
			);
			const last = [...ready].at(-1);
			if (last) {
				base = `http://127.0.0.1:${last[1]}`;
				try {
					if ((await fetch(`${base}/api/live`, { signal: AbortSignal.timeout(2000) })).ok) {
						healthy = true;
						break;
					}
				} catch {}
			}
			await Bun.sleep(250);
		}
		if (!healthy) {
			child.kill();
			throw new Error(`Local Worker readiness timeout: ${log}`);
		}
		const { importJWK } = await import(
			"../../packages/worker/node_modules/jose/dist/webapi/index.js"
		);
		const key = await importJWK(identity.privateKey, "RS256");
		const token = async (email = "operator@example.test", options = {}) =>
			new SignJWT({ email, name: "Morgan Chen", ...options })
				.setProtectedHeader({ alg: "RS256", kid: owner })
				.setIssuer("https://bat-fixture.invalid")
				.setAudience(owner)
				.setIssuedAt()
				.setExpirationTime("2h")
				.sign(key);
		if (fresh && dataset === "demo") {
			const { seedScenarios } = await import("./fixtures.mjs");
			await seedScenarios(base, await token());
		}
		if (fresh) {
			const manifest = verifyOwnership(path, owner);
			writeFileSync(join(path, "owner.json"), JSON.stringify({ ...manifest, ready: true }), {
				mode: 0o600,
			});
		}
		let closed = false;
		return {
			path,
			owner,
			base,
			anchor,
			identity,
			token,
			sql,
			async close({ remove = mode === "e2e" } = {}) {
				if (closed) return;
				closed = true;
				verifyOwnership(path, owner);
				provider.stop(true);
				await stopWorker(child);
				rmSync(lock);
				if (remove) removeOwned(path, owner);
			},
		};
	} catch (error) {
		provider?.stop(true);
		await stopWorker(child);
		rmSync(lock, { force: true });
		if (mode === "e2e") {
			const evidence = join(workerRoot, ".wrangler/environment-failures");
			mkdirSync(evidence, { recursive: true });
			const log = join(path, "worker.log");
			writeFileSync(
				join(evidence, `${owner}.log`),
				String(error) + (existsSync(log) ? `\n${readFileSync(log, "utf8")}` : ""),
				{ mode: 0o600 },
			);
			try {
				removeOwned(path, owner);
			} catch {
				throw new Error(`Startup failed; ownership could not be verified, retained ${path}`, {
					cause: error,
				});
			}
		}
		throw error;
	}
}
