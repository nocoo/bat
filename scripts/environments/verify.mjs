import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { launch } from "./launcher.mjs";
import { productionConfig, removeOwned } from "./runtime.mjs";

const app = await launch({ built: true, port: 0, initial: "e2e", dataset: "demo" });
try {
	const bootstrap = await (await fetch(`${app.base}/__bat/bootstrap.js`)).text();
	const config = JSON.parse(bootstrap.slice("window.__BAT_LOCAL__=".length, -1));
	assert.equal(config.locked, false);
	assert.equal(config.initial, "e2e");
	const select = (mode, previous) =>
		fetch(`${app.base}/__bat/environment`, {
			method: "POST",
			headers: { "X-Bat-Local": config.capability, "Content-Type": "application/json" },
			body: JSON.stringify({ mode, previous }),
		});
	const first = await (await select("e2e")).json();
	assert.equal(first.mode, "e2e");
	const runtime = app.instances.get(first.id).runtime;
	const prefix = `${app.base}/__bat/instances/${first.id}`;
	assert.equal((await fetch(`${runtime.base}/api/hosts`)).status, 401);
	assert.equal(
		(
			await fetch(`${runtime.base}/api/hosts`, {
				headers: { "Cf-Access-Jwt-Assertion": "invalid" },
			})
		).status,
		403,
	);
	assert.equal(
		(
			await fetch(`${runtime.base}/api/connect/servers/pw-host-alpha/tokens`, {
				headers: { "Cf-Access-Jwt-Assertion": await runtime.token("viewer@example.test") },
			})
		).status,
		403,
	);
	const hosts = await (await fetch(`${prefix}/api/hosts`)).json();
	assert.equal(hosts.length, 3);
	const detail = await (await fetch(`${prefix}/api/hosts/f0d3fd30`)).json();
	assert.equal(JSON.parse(detail.top_processes_json)[0].name, "postgres");
	assert.throws(() => removeOwned(runtime.path, runtime.owner), /running/);
	const prod = productionConfig(),
		local = JSON.parse(readFileSync(`${runtime.path}/wrangler.json`, "utf8"));
	for (const key of [
		"compatibility_date",
		"compatibility_flags",
		"unsafe",
		"durable_objects",
		"migrations",
	])
		assert.deepEqual(local[key], prod[key]);
	const response = await fetch(`${prefix}/api/settings`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ retention_days: 30 }),
	});
	assert.equal(response.status, 200);
	const second = await (await select("e2e")).json();
	assert.notEqual(first.id, second.id);
	assert.notEqual(runtime.path, app.instances.get(second.id).runtime.path);
	const denial = await select("invalid", first.id);
	assert.equal(denial.status, 503);
	assert.equal((await fetch(`${prefix}/api/hosts`)).status, 200);
	const switched = await select("e2e", first.id);
	assert.equal((await switched.json()).id, first.id);
	console.log(
		"PASS: real catalog, authentication, ownership guard, parallel E2E stores, config parity, real settings CRUD",
	);
} finally {
	await app.close();
}
const locked = await launch({ automated: true, built: true, port: 0, ci: true, dataset: "empty" });
try {
	const config = JSON.parse(
		(await (await fetch(`${locked.base}/__bat/bootstrap.js`)).text()).slice(
			"window.__BAT_LOCAL__=".length,
			-1,
		),
	);
	assert.equal(config.visible, false);
	assert.equal(config.locked, true);
	assert.equal(
		(
			await fetch(`${locked.base}/__bat/environment`, {
				method: "POST",
				headers: { "X-Bat-Local": config.capability, "Content-Type": "application/json" },
				body: JSON.stringify({ mode: "prod" }),
			})
		).status,
		403,
	);
	const path = locked.locked.runtime.path;
	await locked.close();
	assert.equal(existsSync(path), false);
	console.log("PASS: automated server lock, CI visibility, owned cleanup");
} catch (error) {
	await locked.close();
	throw error;
}
