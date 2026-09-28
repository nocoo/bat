import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	assertTestEnvironment,
	createRuntime,
	removeOwned,
	root,
	storageRoot,
	workerRoot,
} from "./runtime.mjs";

export async function launch({
	automated = false,
	initial,
	port = 7025,
	built = false,
	dataset = automated ? "focused" : "demo",
	ci = !!process.env.CI,
} = {}) {
	if (automated) {
		assertTestEnvironment();
		initial = "e2e";
	}
	if (initial && !["demo", "e2e", "prod"].includes(initial)) throw new Error("Invalid environment");
	const capability = randomBytes(32).toString("hex");
	const instances = new Map();
	let demo, demoStarting, vite;
	const create = async (mode) => {
		if (!["demo", "e2e", "prod"].includes(mode) || (automated && mode !== "e2e"))
			throw new Error("Environment locked or invalid");
		let runtime;
		if (mode === "demo") {
			demoStarting ??= createRuntime({ mode, dataset: "demo" }).catch((error) => {
				demoStarting = undefined;
				throw error;
			});
			runtime = demo = await demoStarting;
		}
		if (mode === "e2e") runtime = await createRuntime({ mode, dataset });
		let credentials = {};
		if (mode === "prod") {
			const { loadEnv } = await import("../../packages/ui/node_modules/vite/dist/node/index.js");
			const env = loadEnv("development", join(root, "packages/ui"), "");
			if (!env.CF_ACCESS_CLIENT_ID || !env.CF_ACCESS_CLIENT_SECRET)
				throw new Error(
					"Prod requires the configured Access service token and real browser authentication",
				);
			credentials = {
				"CF-Access-Client-Id": env.CF_ACCESS_CLIENT_ID,
				"CF-Access-Client-Secret": env.CF_ACCESS_CLIENT_SECRET,
			};
		}
		const id = randomUUID(),
			instance = { id, mode, runtime, credentials, pending: new Set(), active: true };
		instances.set(id, instance);
		return instance;
	};
	const summary = (i) => ({
		id: i.id,
		mode: i.mode,
		locked: automated,
		visible: !ci,
		anchor: i.runtime?.anchor,
	});
	try {
		const locked = automated ? await create("e2e") : null;
		if (!built) {
			const { createServer } = await import(
				"../../packages/ui/node_modules/vite/dist/node/index.js"
			);
			vite = await createServer({
				root: join(root, "packages/ui"),
				server: { host: "127.0.0.1", port: 0, strictPort: false, proxy: {} },
			});
			await vite.listen();
		}
		const viteBase = vite ? `http://127.0.0.1:${vite.httpServer.address().port}` : null;
		const allowedHost = (host) =>
			/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) || host === "bat.dev.hexly.ai";
		const server = Bun.serve({
			hostname: "127.0.0.1",
			port,
			idleTimeout: 120,
			async fetch(request, gateway) {
				try {
					const url = new URL(request.url);
					if (!allowedHost(request.headers.get("host") ?? ""))
						return new Response("Host denied", { status: 403 });
					const origin = request.headers.get("origin");
					if (origin && ![url.origin, "https://bat.dev.hexly.ai"].includes(origin))
						return new Response("Origin denied", { status: 403 });
					if (request.headers.get("sec-fetch-site") === "cross-site")
						return new Response("Cross-site denied", { status: 403 });
					if (viteBase && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
						const upstream = new WebSocket(
							viteBase.replace(/^http/, "ws") + url.pathname + url.search,
							"vite-hmr",
						);
						if (
							gateway.upgrade(request, {
								headers: { "Sec-WebSocket-Protocol": "vite-hmr" },
								data: { upstream, queue: [] },
							})
						)
							return;
						upstream.close();
						return new Response("WebSocket upgrade denied", { status: 400 });
					}
					const json = (body, status = 200) =>
						Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
					if (url.pathname === "/__bat/bootstrap.js")
						return new Response(
							`window.__BAT_LOCAL__=${JSON.stringify({ capability, initial, locked: automated, visible: !ci, instance: locked ? summary(locked) : null })};`,
							{ headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store" } },
						);
					if (url.pathname === "/__bat/environment") {
						if (request.headers.get("X-Bat-Local") !== capability)
							return json({ error: "Local capability required" }, 403);
						if (request.method === "GET") {
							const instance = instances.get(url.searchParams.get("id"));
							return instance?.active
								? json(summary(instance))
								: json({ error: "Instance expired" }, 410);
						}
						if (request.method !== "POST") return json({ error: "Method denied" }, 405);
						const { mode, previous } = await request.json();
						if (automated) return json({ error: "Automated environment is locked" }, 403);
						const old = previous ? instances.get(previous) : null;
						if (previous && !old?.active) return json({ error: "Instance expired" }, 410);
						if (old?.switching) return json({ error: "Switch already in progress" }, 409);
						if (old?.mode === mode) return json(summary(old));
						if (old) old.switching = true;
						let next;
						try {
							next = await create(mode);
						} catch (error) {
							if (old) old.switching = false;
							throw error;
						}
						if (old) {
							old.active = false;
							instances.delete(old.id);
							await Promise.allSettled([...old.pending]);
							if (old.mode === "e2e") await old.runtime.close();
						}
						return json(summary(next));
					}
					const match = /^\/__bat\/instances\/([a-f0-9-]{36})(\/api(?:\/.*)?)$/.exec(url.pathname);
					if (match || url.pathname.startsWith("/api/")) {
						const instance = match ? instances.get(match[1]) : locked;
						if (!instance?.active)
							return json({ error: "Instance expired. Reload to select an environment." }, 410);
						const path = match ? match[2] : url.pathname;
						const target = new URL(
							path + url.search,
							instance.runtime?.base ?? "https://bat.hexly.ai",
						);
						const headers = new Headers(request.headers);
						for (const key of [
							"host",
							"connection",
							"content-length",
							"x-bat-local",
							"CF-Access-Client-Id",
							"CF-Access-Client-Secret",
						])
							headers.delete(key);
						if (origin) headers.set("Origin", target.origin);
						const operation = (async () => {
							if (instance.runtime) {
								headers.delete("cookie");
								if (!headers.has("Authorization") && !headers.has("Cf-Access-Jwt-Assertion"))
									headers.set("Cf-Access-Jwt-Assertion", await instance.runtime.token());
							} else
								for (const [key, value] of Object.entries(instance.credentials))
									headers.set(key, value);
							const response = await fetch(target, {
								method: request.method,
								headers,
								body: ["GET", "HEAD"].includes(request.method)
									? undefined
									: await request.arrayBuffer(),
								redirect: "manual",
								signal: AbortSignal.timeout(30000),
							});
							const responseHeaders = new Headers(response.headers);
							responseHeaders.delete("set-cookie");
							responseHeaders.delete("content-encoding");
							responseHeaders.delete("content-length");
							responseHeaders.set("Cache-Control", "no-store, no-transform");
							return new Response(await response.arrayBuffer(), {
								status: response.status,
								headers: responseHeaders,
							});
						})();
						instance.pending.add(operation);
						try {
							return await operation;
						} finally {
							instance.pending.delete(operation);
						}
					}
					if (url.pathname.startsWith("/__bat/")) return json({ error: "Not found" }, 404);
					let response;
					if (viteBase)
						response = await fetch(new URL(url.pathname + url.search, viteBase), {
							headers: { Accept: request.headers.get("accept") ?? "*/*" },
						});
					else {
						const path = join(
							workerRoot,
							"static",
							decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname),
						);
						if (!path.startsWith(`${join(workerRoot, "static")}/`))
							return new Response("Invalid path", { status: 400 });
						const file = Bun.file(path);
						response = new Response(
							(await file.exists()) ? file : Bun.file(join(workerRoot, "static/index.html")),
						);
					}
					if (response.headers.get("content-type")?.includes("text/html")) {
						const headers = new Headers(response.headers);
						headers.delete("content-length");
						headers.delete("content-encoding");
						headers.set("Cache-Control", "no-store");
						return new Response(
							(await response.text()).replace(
								"<head>",
								'<head><script src="/__bat/bootstrap.js"></script>',
							),
							{ headers },
						);
					}
					return response;
				} catch (error) {
					return Response.json({ error: error.message }, { status: 503 });
				}
			},
			websocket: {
				open(socket) {
					const { upstream, queue } = socket.data;
					upstream.addEventListener("open", () => {
						for (const message of queue) upstream.send(message);
						queue.length = 0;
					});
					upstream.addEventListener("message", (event) => socket.send(event.data));
					upstream.addEventListener("close", () => socket.close());
					upstream.addEventListener("error", () => socket.close());
				},
				message(socket, message) {
					if (socket.data.upstream.readyState === WebSocket.OPEN)
						socket.data.upstream.send(message);
					else socket.data.queue.push(message);
				},
				close(socket) {
					socket.data.upstream.close();
				},
			},
		});
		const close = async () => {
			server.stop(true);
			await vite?.close();
			for (const i of instances.values()) if (i.mode === "e2e") await i.runtime.close();
			await demo?.close({ remove: false });
		};
		return { server, base: `http://127.0.0.1:${server.port}`, locked, close, instances };
	} catch (error) {
		await vite?.close();
		for (const instance of instances.values())
			if (instance.mode === "e2e") await instance.runtime.close();
		await demo?.close({ remove: false });
		throw error;
	}
}
if (import.meta.main) {
	const args = process.argv.slice(2),
		value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
	if (args.includes("--reset-demo")) {
		const path = join(storageRoot, "demo");
		if (existsSync(path)) removeOwned(path, "demo");
		console.log("Demo reset; other local data preserved");
		process.exit(0);
	}
	const runtime = await launch({
		automated: args.includes("--automated"),
		initial: value("--mode"),
		port: Number(value("--port") ?? 7025),
		built: args.includes("--built"),
		dataset: value("--dataset"),
	});
	console.log(`Bat local environment: ${runtime.base}`);
	if (value("--ready-file")) {
		mkdirSync(join(value("--ready-file"), ".."), { recursive: true });
		writeFileSync(
			value("--ready-file"),
			JSON.stringify({
				base: runtime.base,
				worker: runtime.locked?.runtime.base,
				writeKey: runtime.locked?.runtime.identity.writeKey,
				readKey: runtime.locked?.runtime.identity.readKey,
			}),
			{ mode: 0o600 },
		);
	}
	let closing = false;
	for (const signal of ["SIGINT", "SIGTERM"])
		process.on(signal, async () => {
			if (closing) return;
			closing = true;
			await runtime.close();
			process.exit(0);
		});
}
