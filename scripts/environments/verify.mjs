import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { launch } from "./launcher.mjs";
import { readRecordedRecording, SERVER_ALIASES } from "./recorded-demo.mjs";
import { createRuntime, productionConfig, removeOwned, storageRoot } from "./runtime.mjs";

const near = (actual, expected) =>
	actual === null && expected === null
		? true
		: Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) < 1e-6;

const hostsProjection = (detail) => ({
	os: detail.os,
	kernel: detail.kernel,
	arch: detail.arch,
	cpu_model: detail.cpu_model,
	cpu_logical: detail.cpu_logical,
	cpu_physical: detail.cpu_physical,
	mem_total_bytes: detail.mem_total_bytes,
	swap_total_bytes: detail.swap_total_bytes,
	virtualization: detail.virtualization,
	disks: detail.disks,
	boot_mode: detail.boot_mode,
	timezone: detail.timezone,
	dns_resolvers: detail.dns_resolvers,
	dns_search: detail.dns_search,
	boot_time: detail.boot_time,
	last_seen: detail.last_seen,
	top_processes_json: detail.top_processes_json,
	top_processes_ts: detail.top_processes_ts,
});

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

	const recording = readRecordedRecording();
	const latest = recording.workstation.detail.latest_report;
	const anchor = runtime.anchor;
	const hosts = await (await fetch(`${prefix}/api/hosts`)).json();
	assert.equal(hosts.length, 8);
	assert.equal(new Set(hosts.map((host) => host.host_id)).size, 8);
	assert.equal(new Set(hosts.map((host) => host.hid)).size, 8);
	assert.equal(new Set(hosts.map((host) => host.hostname)).size, 8);
	for (const host of hosts) {
		assert.equal(host.hostname.endsWith(".example.test"), true);
		assert.notEqual(host.host_id, "demo-offline");
	}
	assert.deepEqual(
		hosts.map((host) => host.host_id).sort(),
		SERVER_ALIASES.map((alias) => alias.host_id).sort(),
	);

	const details = [];
	const rawHistory = [];
	const hourlyHistory = [];
	const tier2History = [];
	for (const host of hosts) {
		const detailResponse = await fetch(`${prefix}/api/hosts/${host.hid}`);
		assert.equal(detailResponse.status, 200);
		const detail = await detailResponse.json();
		assert.equal(detail.host_id, host.host_id);
		assert.equal(JSON.parse(detail.top_processes_json).length, 50);
		details.push(detail);

		const raw = await (
			await fetch(`${prefix}/api/hosts/${host.host_id}/metrics?from=${anchor - 3600}&to=${anchor}`)
		).json();
		assert.equal(raw.resolution, "raw");
		assert.equal(raw.data.length, 120);
		rawHistory.push({ host_id: host.host_id, data: raw.data });

		const hourly = await (
			await fetch(
				`${prefix}/api/hosts/${host.host_id}/metrics?from=${anchor - 172800}&to=${anchor}`,
			)
		).json();
		assert.equal(hourly.resolution, "hourly");
		assert.equal(hourly.data.length, 24);
		hourlyHistory.push({ host_id: host.host_id, data: hourly.data });

		const tier2Response = await fetch(`${prefix}/api/hosts/${host.host_id}/tier2`);
		assert.equal(tier2Response.status, 200);
		tier2History.push(await tier2Response.json());
	}
	const template = hostsProjection(details[0]);
	for (const detail of details.slice(1)) assert.deepEqual(hostsProjection(detail), template);
	assert.equal(new Set(details.map((detail) => detail.public_ip)).size, 8);

	// The demo catalog carries varied billing: every alias that has billing
	// data shows the three inputs together, and the priced count matches the
	// number of aliases the catalog seeds.
	const pricedHosts = hosts.filter((host) => host.renews_at !== null);
	assert.equal(pricedHosts.length, 6);
	assert.equal(hosts.length - pricedHosts.length, 2);
	for (const detail of details) {
		const set = [detail.cost_amount_cny, detail.paid_at, detail.renews_at].filter(
			(value) => value !== null,
		).length;
		assert.equal(set, detail.renews_at === null ? 0 : 3);
	}
	const remaining = pricedHosts.map((host) => {
		const today = new Date(anchor * 1000);
		const midnight = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
		const renewal = Date.parse(`${host.renews_at}T00:00:00Z`);
		assert.ok(Number.isFinite(renewal));
		return Math.round((renewal - midnight) / 86400000);
	});
	assert.ok(
		remaining.some((days) => days < 0),
		"a renewal is overdue",
	);
	assert.ok(
		remaining.some((days) => days >= 0 && days <= 7),
		"a renewal is due this week",
	);
	assert.ok(
		remaining.some((days) => days > 7),
		"a renewal is still far away",
	);
	// The second alias also reports the captured second filesystem; every other
	// alias shares the merged primary filesystem.
	const secondFilesystemHostId = SERVER_ALIASES[1].host_id;
	const primaryRaw = rawHistory.find((entry) => entry.host_id !== secondFilesystemHostId);
	const primaryHourly = hourlyHistory.find((entry) => entry.host_id !== secondFilesystemHostId);
	for (const entry of rawHistory) {
		if (entry.host_id === secondFilesystemHostId) {
			continue;
		}
		assert.deepEqual(entry.data, primaryRaw.data);
	}
	for (const entry of hourlyHistory) {
		if (entry.host_id === secondFilesystemHostId) {
			continue;
		}
		assert.deepEqual(entry.data, primaryHourly.data);
	}
	for (const entry of rawHistory) {
		const devices = new Set(JSON.parse(entry.data.at(-1).disk_json).map((disk) => disk.device));
		assert.equal(devices.size, entry.host_id === secondFilesystemHostId ? 2 : 1);
	}
	for (const tier2 of tier2History.slice(1)) {
		assert.deepEqual({ ...tier2, host_id: null }, { ...tier2History[0], host_id: null });
	}

	const workstations = await (await fetch(`${prefix}/api/workstations`)).json();
	assert.equal(workstations.length, 1);
	const workstation = workstations[0];
	assert.equal(workstation.id, "00000000-0000-4000-8000-000000000001");
	assert.equal(workstation.owner, "email:operator@example.test");
	assert.equal(
		workstation.latest_report.report_id,
		recording.workstation.detail.latest_report.report_id,
	);
	assert.equal(
		workstation.latest_report.started_at,
		anchor - recording.workstation.detail.latest_report.started_at_age_seconds,
	);
	assert.equal(workstation.latest_report.connectivity.length, 8);
	for (const entry of workstation.latest_report.connectivity) {
		const alias = SERVER_ALIASES.find((candidate) => candidate.host_id === entry.server_id);
		assert.ok(alias);
		const captured = recording.workstation.detail.latest_report.connectivity.find(
			(candidate) => candidate.server_id === alias.server_id,
		);
		assert.deepEqual(entry.rtts_ms, captured.rtts_ms);
		assert.equal(entry.sent, captured.sent);
		assert.equal(entry.received, captured.received);
		assert.equal(entry.status, captured.status);
	}

	const metrics = await (
		await fetch(
			`${prefix}/api/workstations/${workstation.id}/metrics?from=${anchor - 86400}&to=${anchor}&limit=100`,
		)
	).json();
	const capturedMetrics = [...recording.workstation.metrics.data].sort(
		(left, right) => right.received_at_age_seconds - left.received_at_age_seconds,
	);
	assert.equal(metrics.data.length, capturedMetrics.length);
	for (const [index, point] of metrics.data.entries()) {
		const captured = capturedMetrics[index];
		assert.equal(point.received_at, anchor - captured.received_at_age_seconds);
		assert.equal(point.cpu_usage_pct, captured.cpu_usage_pct);
		assert.equal(point.mem_used_pct, captured.mem_used_pct);
		assert.equal(point.mem_total_bytes, captured.mem_total_bytes);
		assert.equal(point.uptime_seconds, captured.uptime_seconds);
	}

	const connectivity = await (
		await fetch(
			`${prefix}/api/workstations/${workstation.id}/connectivity?from=${anchor - 86400}&to=${anchor}&limit=100`,
		)
	).json();
	assert.equal(connectivity.targets.length, 8);
	const hostsById = new Map(hosts.map((host) => [host.host_id, host]));
	for (const target of connectivity.targets) {
		const host = hostsById.get(target.server_id);
		assert.ok(host);
		assert.equal(target.address, host.public_ip);
		assert.equal(target.data.length, 4);
		const captured = recording.workstation.connectivity.targets.find(
			(candidate) =>
				SERVER_ALIASES.find((alias) => alias.host_id === target.server_id)?.server_id ===
				candidate.server_id,
		);
		for (const [index, point] of target.data.entries()) {
			const source = captured.data[index];
			assert.equal(point.received_at, anchor - source.received_at_age_seconds);
			assert.equal(point.status, source.status);
			const isLatest = source.received_at_age_seconds === latest.received_at_age_seconds;
			if (source.received === 0) {
				assert.equal(point.rtt_avg_ms, null);
				assert.equal(point.rtt_min_ms, null);
				assert.equal(point.rtt_max_ms, null);
			} else if (isLatest) {
				assert.equal(point.rtt_avg_ms, source.rtt_avg_ms);
				assert.equal(point.rtt_min_ms, source.rtt_min_ms);
				assert.equal(point.rtt_max_ms, source.rtt_max_ms);
			} else {
				assert.equal(near(point.rtt_avg_ms, source.rtt_avg_ms), true);
				assert.equal(point.rtt_min_ms, source.rtt_min_ms);
				assert.equal(point.rtt_max_ms, source.rtt_max_ms);
			}
		}
		const latestPoint = target.data.at(-1);
		const capturedLatest = captured.data.at(-1);
		assert.equal(latestPoint.received_at, anchor - capturedLatest.received_at_age_seconds);
		if (capturedLatest.received === 0) {
			assert.equal(latestPoint.rtt_avg_ms, null);
			assert.equal(latestPoint.rtt_min_ms, null);
			assert.equal(latestPoint.rtt_max_ms, null);
		} else {
			assert.equal(latestPoint.rtt_avg_ms, capturedLatest.rtt_avg_ms);
			assert.equal(latestPoint.rtt_min_ms, capturedLatest.rtt_min_ms);
			assert.equal(latestPoint.rtt_max_ms, capturedLatest.rtt_max_ms);
		}
	}

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
	// The instance serves a private assets copy so `bun run build` rewriting
	// packages/worker/static cannot kill a running worker.
	assert.equal(local.assets.directory, join(runtime.path, "static"));
	assert.equal(existsSync(join(runtime.path, "static", "index.html")), true);
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
	// A launcher restart wipes the in-memory instance map: an unknown previous
	// id must create the requested mode instead of bricking the open tab.
	const restarted = await (await select("e2e", randomUUID())).json();
	assert.equal(restarted.mode, "e2e");
	assert.notEqual(restarted.id, first.id);
	// A previous id that still exists but is inactive is a real expiry.
	const dormant = app.instances.get(first.id);
	dormant.active = false;
	assert.equal((await select("e2e", first.id)).status, 410);
	dormant.active = true;
	// A dead worker expires its instance with an honest 410 instead of a
	// permanent 503, drops the store, and the next switch rebuilds fresh.
	const victim = restarted;
	const victimRuntime = app.instances.get(victim.id).runtime;
	process.kill(-victimRuntime.workerPid, "SIGKILL");
	const dead = await fetch(`${app.base}/__bat/instances/${victim.id}/api/hosts`);
	assert.equal(dead.status, 410);
	assert.equal(app.instances.has(victim.id), false);
	assert.equal(existsSync(victimRuntime.path), false);
	const reborn = await (await select("e2e", victim.id)).json();
	assert.notEqual(reborn.id, victim.id);
	assert.equal((await fetch(`${app.base}/__bat/instances/${reborn.id}/api/hosts`)).status, 200);
	console.log(
		"PASS: real recorded catalog (8 aliases, one workstation), authentication, ownership guard, parallel E2E stores, config parity, instance assets isolation, real settings CRUD, environment recovery (unknown previous, inactive previous, dead worker)",
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

const before = readdirSync(storageRoot).sort();
await assert.rejects(createRuntime({ dataset: "invalid" }), /Unknown fixture catalog/);
assert.deepEqual(readdirSync(storageRoot).sort(), before);
console.log("PASS: failed seeding retains logs and cleans verified temporary state");
