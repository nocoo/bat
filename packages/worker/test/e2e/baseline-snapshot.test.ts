// C0 — D1 repo refactor baseline normalized API snapshot.
//
// Per docs/20-d1-to-kv-migration.md v6 §6: this is the permanent regression
// guard for the Phase 1 storage refactor. It seeds a deterministic dataset
// scoped to the `bl-*` namespace, exercises the read endpoints listed in
// v6 §6.5, normalizes volatile fields (timestamps, generated ids, ordering
// noise), and asserts against a checked-in snapshot. Writes are exercised
// via the "write-then-reread diff" pattern.
//
// Every seed write asserts a specific status / response shape — silent
// best-effort skipping is forbidden. After seeding, each snapshot test also
// runs a sanity assertion (filtered list non-empty, expected fields present)
// before writing the snapshot, so a broken refactor can't regress to "empty
// list" without failing the sanity check.
//
// This file is the source of truth for "behaviour unchanged" — every
// subsequent C1–C11 commit must keep it green.

import { hashHostId } from "@bat/shared";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { normalize } from "./baseline/normalize";
import { BASE, assertStatus, makeMetricsPayload, readHeaders, writeHeaders } from "./helpers";

// /api/ingest enforces a 5-minute clock-skew bound, so metric timestamps must
// be relative to NOW. T0 is reserved for boot_time anchors. All volatile
// fields are scrubbed by `normalize` before snapshotting.
const T0 = 1_750_000_000;
const NOW = Math.floor(Date.now() / 1000);
const H1 = "bl-host-001";
const H2 = "bl-host-002";
const H3 = "bl-host-003";
const HIDS = { [H1]: hashHostId(H1), [H2]: hashHostId(H2), [H3]: hashHostId(H3) };
const KNOWN_HOSTS = new Set([H1, H2, H3]);
// Stable names for snapshot inclusion. Cleanup-before-seed below removes any
// leftovers from a prior failed run so the same names are usable across runs.
const TAG_NAME = "bl-prod";
const ASSET_NAME = "bl-asset";
const AGENT_SOURCE = "bl_src";
const AGENT_MATCH = "bl_match";
const AGENT_NICKNAME = "bl-agent";

// Track resources created during seeding so cleanup can remove them and
// write-then-reread tests can reference them.
const created: {
	webhookId?: number;
	tagId?: string;
	agentId?: string;
	assetId?: string;
} = {};

describe("C0 baseline: normalized API snapshot (permanent regression guard)", () => {
	beforeAll(async () => {
		await seedBaselineDataset();
	}, 120_000);

	afterAll(async () => {
		await cleanupBaselineDataset();
	});

	// --- Reads (snapshotted, with sanity assertions) -----------------------

	test("GET /api/hosts — list filtered to bl-* hosts", async () => {
		await snap("hosts.list", () => fetchJson("/api/hosts"), {
			filter: (json) => filterByHostId(json),
			sanity: (filtered) => {
				expect(Array.isArray(filtered)).toBe(true);
				expect((filtered as unknown[]).length).toBe(3);
			},
		});
	});

	test("GET /api/hosts/:id (H1)", async () => {
		await snap("hosts.detail.h1", () => fetchJson(`/api/hosts/${HIDS[H1]}`), {
			sanity: (json) => {
				expect((json as { host_id: string }).host_id).toBe(H1);
				expect((json as { description: string | null }).description).toBe("bl-baseline-desc");
			},
		});
	});

	test("GET /api/hosts/:id/metrics?from..to (24h window — raw resolution)", async () => {
		const to = NOW + 60;
		const from = to - 24 * 3600;
		await snap(
			"hosts.metrics.h1.24h",
			() => fetchJson(`/api/hosts/${HIDS[H1]}/metrics?from=${from}&to=${to}`),
			{
				sanity: (json) => {
					const data = (json as { data: unknown[]; resolution: string }).data;
					expect(Array.isArray(data)).toBe(true);
					expect((json as { resolution: string }).resolution).toBe("raw");
					expect(data.length).toBeGreaterThanOrEqual(3);
				},
			},
		);
	});

	test("GET /api/hosts/:id/metrics?from..to (7d window — hourly resolution)", async () => {
		const to = NOW + 60;
		const from = to - 7 * 86400;
		await snap(
			"hosts.metrics.h1.7d",
			() => fetchJson(`/api/hosts/${HIDS[H1]}/metrics?from=${from}&to=${to}`),
			{
				sanity: (json) => {
					expect((json as { resolution: string }).resolution).toBe("hourly");
				},
			},
		);
	});

	test("GET /api/hosts/:id/maintenance (window present)", async () => {
		await snap("hosts.maintenance.h1", () => fetchJson(`/api/hosts/${HIDS[H1]}/maintenance`), {
			sanity: (json) => {
				expect(json).toMatchObject({ start: "01:00", end: "02:00", reason: "bl-baseline" });
			},
		});
	});

	test("GET /api/alerts (filtered to H1 — disk_full)", async () => {
		await snap("alerts.list", () => fetchJson("/api/alerts"), {
			filter: (json) => filterByHostId(json),
			sanity: (filtered) => {
				const arr = filtered as Array<{ rule_id: string }>;
				expect(arr.some((a) => a.rule_id === "disk_full")).toBe(true);
			},
		});
	});

	test("GET /api/webhooks (filtered to H1's webhook)", async () => {
		await snap("webhooks.list", () => fetchJson("/api/webhooks"), {
			filter: (json) => filterByHostId(json),
			sanity: (filtered) => {
				expect((filtered as unknown[]).length).toBe(1);
			},
		});
	});

	test("GET /api/allowed-ports (subset for bl-* hosts)", async () => {
		await snap("ports.list", () => fetchJson("/api/allowed-ports"), {
			filter: (json) => filterPortMap(json),
			sanity: (filtered) => {
				const map = filtered as Record<string, number[]>;
				expect(map[H1]).toEqual([22, 80, 443]);
			},
		});
	});

	test("GET /api/agents (filtered to bl-* match key)", async () => {
		await snap("agents.list", () => fetchJson("/api/agents"), {
			filter: (json) => filterByPrefix(json, "match_key", "bl_"),
			sanity: (filtered) => {
				expect((filtered as unknown[]).length).toBeGreaterThanOrEqual(1);
			},
		});
	});

	test("GET /api/assets (filtered to bl-* name)", async () => {
		await snap("assets.list", () => fetchJson("/api/assets"), {
			filter: (json) => filterByPrefix(json, "name", "bl-"),
			sanity: (filtered) => {
				expect((filtered as unknown[]).length).toBe(1);
			},
		});
	});

	test("GET /api/bindings (filtered to bl-* asset/agent)", async () => {
		await snap("bindings.list", () => fetchJson("/api/bindings"), {
			filter: (json) => filterAgentAssetByName(json),
			sanity: (filtered) => {
				expect((filtered as unknown[]).length).toBe(1);
			},
		});
	});

	test("GET /api/tags (filtered to bl-* tag)", async () => {
		await snap("tags.list", () => fetchJson("/api/tags"), {
			filter: (json) => filterByPrefix(json, "name", "bl-"),
			sanity: (filtered) => {
				expect((filtered as unknown[]).length).toBe(1);
			},
		});
	});

	test("GET /api/settings", async () => {
		await snap("settings.get", () => fetchJson("/api/settings"), {
			sanity: (json) => {
				expect((json as { retention_days: number }).retention_days).toBe(7);
			},
		});
	});

	test("GET /api/fleet/status (shape only — counts depend on global state)", async () => {
		await snap("fleet.status", () => fetchJson("/api/fleet/status"), {
			filter: (json) => filterFleetStatusShape(json),
			sanity: (filtered) => {
				expect(filtered).toHaveProperty("status");
				expect(filtered).toHaveProperty("version");
			},
		});
	});

	test("GET /api/live (liveness probe)", async () => {
		await snap("live", () => fetchJson("/api/live"), {
			sanity: (json) => {
				expect((json as { status: string }).status).toBe("ok");
				expect((json as { database: { connected: boolean } }).database.connected).toBe(true);
			},
		});
	});

	test("GET /api/monitoring/hosts (filtered to bl-* hosts)", async () => {
		await snap("monitoring.hosts", () => fetchJson("/api/monitoring/hosts"), {
			filter: (json) => filterMonitoringHostsList(json),
			sanity: (filtered) => {
				const obj = filtered as { hosts: Array<{ host_id: string }> };
				expect(obj.hosts.length).toBe(3);
				expect(obj.hosts.every((h) => KNOWN_HOSTS.has(h.host_id))).toBe(true);
			},
		});
	});

	test("GET /api/monitoring/hosts/:id (H1)", async () => {
		await snap("monitoring.host.h1", () => fetchJson(`/api/monitoring/hosts/${HIDS[H1]}`), {
			sanity: (json) => {
				expect((json as { host_id: string }).host_id).toBe(H1);
			},
		});
	});

	test("GET /api/monitoring/groups (filtered to bl-* tag)", async () => {
		await snap("monitoring.groups", () => fetchJson("/api/monitoring/groups"), {
			filter: (json) => filterMonitoringGroupsList(json),
			sanity: (filtered) => {
				const obj = filtered as { groups: Array<{ tag: string }> };
				expect(obj.groups.length).toBe(1);
				expect(obj.groups[0]?.tag).toBe(TAG_NAME);
			},
		});
	});

	test("GET /api/monitoring/alerts (filtered to bl-* hosts)", async () => {
		await snap("monitoring.alerts", () => fetchJson("/api/monitoring/alerts"), {
			filter: (json) => filterMonitoringAlerts(json),
			sanity: (filtered) => {
				const arr = (filtered as { alerts: Array<{ rule_id: string }> }).alerts;
				expect(arr.some((a) => a.rule_id === "disk_full")).toBe(true);
			},
		});
	});

	// --- Writes (write-then-reread diff) -----------------------------------

	test("PATCH /api/hosts/:id/description updates only description", async () => {
		const before = (await fetchJson(`/api/hosts/${HIDS[H2]}`)) as Record<string, unknown>;
		const res = await fetch(`${BASE}/api/hosts/${HIDS[H2]}/description`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({ description: "h2-desc" }),
		});
		expect(res.status).toBe(204);
		const after = (await fetchJson(`/api/hosts/${HIDS[H2]}`)) as Record<string, unknown>;
		expect(after.description).toBe("h2-desc");
		expectShallowEqualExcept(before, after, ["description"]);
		const restoreRes = await fetch(`${BASE}/api/hosts/${HIDS[H2]}/description`, {
			method: "PATCH",
			headers: writeHeaders(),
			body: JSON.stringify({ description: null }),
		});
		expect(restoreRes.status).toBe(204);
	});

	test("PUT /api/hosts/:id/maintenance round-trip", async () => {
		const get = (): Promise<unknown> => fetchJson(`/api/hosts/${HIDS[H3]}/maintenance`);
		expect(await get()).toBeNull();
		const setRes = await fetch(`${BASE}/api/hosts/${HIDS[H3]}/maintenance`, {
			method: "PUT",
			headers: writeHeaders(),
			body: JSON.stringify({ start: "02:00", end: "03:00", reason: "bl-test" }),
		});
		expect(setRes.status).toBe(204);
		expect(await get()).toMatchObject({ start: "02:00", end: "03:00", reason: "bl-test" });
		const delRes = await fetch(`${BASE}/api/hosts/${HIDS[H3]}/maintenance`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(delRes.status).toBe(204);
		expect(await get()).toBeNull();
	});

	test("POST /api/identity is upsert-idempotent on hostname change", async () => {
		const before = (await fetchJson(`/api/hosts/${HIDS[H2]}`)) as Record<string, unknown>;
		const newHostname = "h2-renamed.bl.example.com";
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ ...buildIdentity(H2, newHostname) }),
		});
		expect(res.status).toBe(204);
		const after = (await fetchJson(`/api/hosts/${HIDS[H2]}`)) as Record<string, unknown>;
		expect(after.hostname).toBe(newHostname);
		// restore
		await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(buildIdentity(H2, "h2.bl.example.com")),
		});
		const restored = (await fetchJson(`/api/hosts/${HIDS[H2]}`)) as Record<string, unknown>;
		expect(restored.hostname).toBe("h2.bl.example.com");
		// `before` is captured for symmetry with other write-then-reread tests
		// even though we don't compare it field-by-field here (identity refreshes
		// last_seen / identity_updated_at by design).
		expect(before).toBeDefined();
	});

	test("POST /api/ingest is idempotent on duplicate (host_id, ts)", async () => {
		const ts = NOW - 5;
		const payload = makeMetricsPayload(H2, ts);
		const res1 = await fetch(`${BASE}/api/ingest`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(payload),
		});
		expect(res1.status).toBe(204);
		const res2 = await fetch(`${BASE}/api/ingest`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(payload),
		});
		expect(res2.status).toBe(204);
		const detail = (await fetchJson(
			`/api/hosts/${HIDS[H2]}/metrics?from=${ts - 1}&to=${ts + 1}`,
		)) as { data: unknown[] };
		expect(detail.data.length).toBe(1);
	});

	test("POST /api/agents create + GET /api/agents/:id round-trip", async () => {
		const sk = "bl_w_src";
		const mk = "bl_w_match";
		const createRes = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: sk,
				match_key: mk,
				host_id: H1,
				nickname: "bl-w-agent",
			}),
		});
		expect(createRes.status).toBe(201);
		const agent = (await createRes.json()) as { id: string };
		expect(agent.id).toMatch(/^agt_/);
		const getRes = await fetch(`${BASE}/api/agents/${agent.id}`, { headers: readHeaders() });
		expect(getRes.status).toBe(200);
		const detail = (await getRes.json()) as { id: string; match_key: string };
		expect(detail.match_key).toBe(mk);
		// cleanup
		const delRes = await fetch(`${BASE}/api/agents/${agent.id}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(delRes.status).toBe(204);
	});

	test("POST /api/assets create + GET /api/assets/:id round-trip", async () => {
		const name = "bl-w-asset";
		const createRes = await fetch(`${BASE}/api/assets`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				type: "cloud_service",
				name,
				host_id: H1,
				subtype: "workers",
			}),
		});
		expect(createRes.status).toBe(201);
		const asset = (await createRes.json()) as { id: string };
		expect(asset.id).toMatch(/^ast_/);
		const getRes = await fetch(`${BASE}/api/assets/${asset.id}`, { headers: readHeaders() });
		expect(getRes.status).toBe(200);
		const detail = (await getRes.json()) as { id: string; name: string };
		expect(detail.name).toBe(name);
		// cleanup
		const delRes = await fetch(`${BASE}/api/assets/${asset.id}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(delRes.status).toBe(204);
	});

	test("POST /api/bindings + DELETE round-trip via paired index", async () => {
		// Use an ad-hoc agent + asset so cleanup is local to this test.
		const aRes = await fetch(`${BASE}/api/agents`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				source_key: "bl_b_src",
				match_key: "bl_b_match",
				host_id: H1,
				nickname: "bl-b-agent",
			}),
		});
		expect(aRes.status).toBe(201);
		const agent = (await aRes.json()) as { id: string };

		const sRes = await fetch(`${BASE}/api/assets`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({
				type: "cloud_service",
				name: "bl-b-asset",
				host_id: H1,
				subtype: "workers",
			}),
		});
		expect(sRes.status).toBe(201);
		const asset = (await sRes.json()) as { id: string };

		const bRes = await fetch(`${BASE}/api/bindings`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ agent_id: agent.id, asset_id: asset.id }),
		});
		expect(bRes.status).toBe(201);

		// Idempotent re-create returns 200
		const bRes2 = await fetch(`${BASE}/api/bindings`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ agent_id: agent.id, asset_id: asset.id }),
		});
		expect(bRes2.status).toBe(200);

		const dRes = await fetch(`${BASE}/api/bindings/${agent.id}/${asset.id}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
		expect(dRes.status).toBe(204);

		// cleanup parent records
		await fetch(`${BASE}/api/assets/${asset.id}`, { method: "DELETE", headers: writeHeaders() });
		await fetch(`${BASE}/api/agents/${agent.id}`, { method: "DELETE", headers: writeHeaders() });
	});
});

// --- Seeding -----------------------------------------------------------------

function buildIdentity(hostId: string, hostname: string): Record<string, unknown> {
	return {
		host_id: hostId,
		hostname,
		os: "Ubuntu 24.04 LTS",
		kernel: "6.8.0-bl",
		arch: "x86_64",
		cpu_model: "AMD EPYC bl",
		uptime_seconds: 86_400,
		boot_time: T0 - 86_400,
		cpu_logical: 8,
		cpu_physical: 4,
		mem_total_bytes: 16_000_000_000,
		swap_total_bytes: 2_000_000_000,
		virtualization: "kvm",
		boot_mode: "uefi",
		public_ip: "203.0.113.1",
		net_interfaces: [
			{ iface: "eth0", mac: "aa:bb:cc:00:00:01", ipv4: ["10.0.0.1"], ipv6: [], speed_mbps: 1000 },
		],
		disks: [{ device: "sda", size_bytes: 500_000_000_000, rotational: false }],
	};
}

async function seedBaselineDataset(): Promise<void> {
	// Cleanup leftovers from a prior failed run before seeding. The names we
	// use are stable across runs; without this step, the second run would see
	// "tag name already exists" or similar 409s.
	await preSeedCleanup();

	// 3 hosts
	for (const [hid, hostname] of [
		[H1, "h1.bl.example.com"],
		[H2, "h2.bl.example.com"],
		[H3, "h3.bl.example.com"],
	] as const) {
		const res = await fetch(`${BASE}/api/identity`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(buildIdentity(hid, hostname)),
		});
		assertStatus(res.status, 204, `seed identity ${hid}`);
	}

	// Description sets H1 detail to a known stable value (snapshot relies on it)
	const descRes = await fetch(`${BASE}/api/hosts/${HIDS[H1]}/description`, {
		method: "PATCH",
		headers: writeHeaders(),
		body: JSON.stringify({ description: "bl-baseline-desc" }),
	});
	assertStatus(descRes.status, 204, "seed description");

	// Maintenance window on H1
	const mwRes = await fetch(`${BASE}/api/hosts/${HIDS[H1]}/maintenance`, {
		method: "PUT",
		headers: writeHeaders(),
		body: JSON.stringify({ start: "01:00", end: "02:00", reason: "bl-baseline" }),
	});
	assertStatus(mwRes.status, 204, "seed maintenance");

	// 3 metric points on H1 — last one trips disk_full (used_pct = 90 > 85)
	for (let i = 0; i < 3; i++) {
		const ts = NOW - 90 + i * 30;
		const payload = makeMetricsPayload(H1, ts);
		// On the last point, push disk used_pct over the alert threshold so
		// alert_states gets a row we can snapshot deterministically.
		if (i === 2) {
			const disks = (payload as unknown as { disk: Array<{ used_pct: number }> }).disk;
			const first = disks[0];
			if (first) {
				first.used_pct = 90;
			}
		}
		const res = await fetch(`${BASE}/api/ingest`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify(payload),
		});
		assertStatus(res.status, 204, `seed metric ${i}`);
	}

	// Allowed ports on H1 (host-scoped routes use raw host_id, not hid)
	for (const port of [22, 80, 443]) {
		const res = await fetch(`${BASE}/api/hosts/${H1}/allowed-ports`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ port, reason: "bl" }),
		});
		// 201 on first add, 200 on idempotent re-add — both are valid here.
		if (res.status !== 200 && res.status !== 201) {
			throw new Error(`seed allowed-port ${port} expected 200|201, got ${res.status}`);
		}
	}

	// Webhook bound to H1
	const whRes = await fetch(`${BASE}/api/webhooks`, {
		method: "POST",
		headers: writeHeaders(),
		body: JSON.stringify({ host_id: H1 }),
	});
	assertStatus(whRes.status, 201, "seed webhook");
	const wh = (await whRes.json()) as { id: number };
	created.webhookId = wh.id;

	// Tag + edge to H1 + H2 (so tag has host_count=2 and monitoring/groups picks it up)
	const tagRes = await fetch(`${BASE}/api/tags`, {
		method: "POST",
		headers: writeHeaders(),
		body: JSON.stringify({ name: TAG_NAME, color: 1 }),
	});
	assertStatus(tagRes.status, 201, "seed tag");
	const tag = (await tagRes.json()) as { id: string };
	created.tagId = tag.id;
	for (const hid of [H1, H2]) {
		const edgeRes = await fetch(`${BASE}/api/hosts/${hid}/tags`, {
			method: "POST",
			headers: writeHeaders(),
			body: JSON.stringify({ tag_id: tag.id }),
		});
		assertStatus(edgeRes.status, 201, `seed tag edge ${hid}`);
	}

	// Settings (idempotent — does not depend on prior state)
	const settingsRes = await fetch(`${BASE}/api/settings`, {
		method: "PUT",
		headers: writeHeaders(),
		body: JSON.stringify({ retention_days: 7 }),
	});
	assertStatus(settingsRes.status, 200, "seed settings");

	// Agent + asset + binding
	const agentRes = await fetch(`${BASE}/api/agents`, {
		method: "POST",
		headers: writeHeaders(),
		body: JSON.stringify({
			source_key: AGENT_SOURCE,
			match_key: AGENT_MATCH,
			host_id: H1,
			nickname: AGENT_NICKNAME,
		}),
	});
	assertStatus(agentRes.status, 201, "seed agent");
	const agent = (await agentRes.json()) as { id: string };
	created.agentId = agent.id;

	const assetRes = await fetch(`${BASE}/api/assets`, {
		method: "POST",
		headers: writeHeaders(),
		body: JSON.stringify({
			type: "cloud_service",
			name: ASSET_NAME,
			host_id: H1,
			subtype: "workers",
		}),
	});
	assertStatus(assetRes.status, 201, "seed asset");
	const asset = (await assetRes.json()) as { id: string };
	created.assetId = asset.id;

	const bindRes = await fetch(`${BASE}/api/bindings`, {
		method: "POST",
		headers: writeHeaders(),
		body: JSON.stringify({ agent_id: agent.id, asset_id: asset.id }),
	});
	assertStatus(bindRes.status, 201, "seed binding");
}

async function cleanupBaselineDataset(): Promise<void> {
	if (created.agentId && created.assetId) {
		await fetch(`${BASE}/api/bindings/${created.agentId}/${created.assetId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
	}
	if (created.assetId) {
		await fetch(`${BASE}/api/assets/${created.assetId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
	}
	if (created.agentId) {
		await fetch(`${BASE}/api/agents/${created.agentId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
	}
	if (created.tagId) {
		await fetch(`${BASE}/api/tags/${created.tagId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
	}
	if (created.webhookId !== undefined) {
		await fetch(`${BASE}/api/webhooks/${created.webhookId}`, {
			method: "DELETE",
			headers: writeHeaders(),
		});
	}
}

// Best-effort: remove any bl-* leftover resources from a previous failed run.
// Errors are ignored; the seed step that follows asserts everything created
// here is in a clean state.
async function preSeedCleanup(): Promise<void> {
	// Bindings first (referential integrity)
	try {
		const list = (await (
			await fetch(`${BASE}/api/bindings`, { headers: readHeaders() })
		).json()) as Array<{
			agent_id: string;
			asset_id: string;
			agent_nickname?: string;
			asset_name?: string;
		}>;
		for (const b of list) {
			if ((b.agent_nickname ?? "").startsWith("bl-") || (b.asset_name ?? "").startsWith("bl-")) {
				await fetch(`${BASE}/api/bindings/${b.agent_id}/${b.asset_id}`, {
					method: "DELETE",
					headers: writeHeaders(),
				});
			}
		}
	} catch {
		// ignore
	}
	// Assets
	try {
		const list = (await (
			await fetch(`${BASE}/api/assets`, { headers: readHeaders() })
		).json()) as Array<{
			id: string;
			name: string;
		}>;
		for (const a of list) {
			if (a.name?.startsWith("bl-")) {
				await fetch(`${BASE}/api/assets/${a.id}`, { method: "DELETE", headers: writeHeaders() });
			}
		}
	} catch {
		// ignore
	}
	// Agents
	try {
		const list = (await (
			await fetch(`${BASE}/api/agents`, { headers: readHeaders() })
		).json()) as Array<{
			id: string;
			match_key?: string;
			nickname?: string;
		}>;
		for (const a of list) {
			if ((a.match_key ?? "").startsWith("bl_") || (a.nickname ?? "").startsWith("bl-")) {
				await fetch(`${BASE}/api/agents/${a.id}`, { method: "DELETE", headers: writeHeaders() });
			}
		}
	} catch {
		// ignore
	}
	// Tags
	try {
		const list = (await (
			await fetch(`${BASE}/api/tags`, { headers: readHeaders() })
		).json()) as Array<{
			id: string;
			name: string;
		}>;
		for (const t of list) {
			if (t.name?.startsWith("bl-")) {
				await fetch(`${BASE}/api/tags/${t.id}`, { method: "DELETE", headers: writeHeaders() });
			}
		}
	} catch {
		// ignore
	}
	// Webhooks
	try {
		const list = (await (
			await fetch(`${BASE}/api/webhooks`, { headers: readHeaders() })
		).json()) as Array<{
			id: number;
			host_id: string;
		}>;
		for (const w of list) {
			if (KNOWN_HOSTS.has(w.host_id)) {
				await fetch(`${BASE}/api/webhooks/${w.id}`, { method: "DELETE", headers: writeHeaders() });
			}
		}
	} catch {
		// ignore
	}
}

// --- Snapshot helpers --------------------------------------------------------

interface SnapOptions {
	filter?: (json: unknown) => unknown;
	sanity?: (filtered: unknown) => void;
}

async function snap(
	name: string,
	fetcher: () => Promise<unknown>,
	opts: SnapOptions = {},
): Promise<void> {
	const raw = await fetcher();
	const filtered = opts.filter ? opts.filter(raw) : raw;
	if (opts.sanity) {
		opts.sanity(filtered);
	}
	const norm = normalize(filtered);
	const path = `./baseline/__snapshots__/${name}.json`;
	// biome-ignore lint/suspicious/noMisplacedAssertion: helper invoked from inside a test()
	await expect(`${JSON.stringify(norm, null, 2)}\n`).toMatchFileSnapshot(path);
}

async function fetchJson(path: string): Promise<unknown> {
	const res = await fetch(`${BASE}${path}`, { headers: readHeaders() });
	if (!res.ok) {
		throw new Error(`GET ${path} → ${res.status}`);
	}
	return res.json();
}

function filterByHostId(json: unknown): unknown {
	if (Array.isArray(json)) {
		return json.filter((row) => {
			if (row && typeof row === "object" && "host_id" in row) {
				return KNOWN_HOSTS.has((row as { host_id: string }).host_id);
			}
			return false;
		});
	}
	return json;
}

function filterByPrefix(json: unknown, field: string, prefix: string): unknown {
	if (Array.isArray(json)) {
		return json.filter((row) => {
			if (row && typeof row === "object" && field in row) {
				const v = (row as Record<string, unknown>)[field];
				return typeof v === "string" && v.startsWith(prefix);
			}
			return false;
		});
	}
	return json;
}

function filterAgentAssetByName(json: unknown): unknown {
	if (Array.isArray(json)) {
		return json.filter((row) => {
			if (row && typeof row === "object") {
				const r = row as Record<string, unknown>;
				const aName = typeof r.agent_nickname === "string" ? (r.agent_nickname as string) : "";
				const sName = typeof r.asset_name === "string" ? (r.asset_name as string) : "";
				return aName.startsWith(AGENT_NICKNAME) || sName === ASSET_NAME;
			}
			return false;
		});
	}
	return json;
}

function filterPortMap(json: unknown): unknown {
	if (json && typeof json === "object" && !Array.isArray(json)) {
		const out: Record<string, number[]> = {};
		for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
			if (KNOWN_HOSTS.has(k) && Array.isArray(v)) {
				out[k] = v as number[];
			}
		}
		return out;
	}
	return json;
}

function filterFleetStatusShape(json: unknown): unknown {
	// Fleet status is an aggregate over the whole DB, polluted by other tests.
	// Strip the absolute counts and snapshot only the structural shape.
	if (json && typeof json === "object") {
		const o = json as Record<string, unknown>;
		return {
			status: typeof o.status === "string" ? "<STATUS>" : null,
			version: o.version,
			has_total_hosts: typeof o.total_hosts === "number",
			has_healthy: typeof o.healthy === "number",
			has_warning: typeof o.warning === "number",
			has_critical: typeof o.critical === "number",
			has_maintenance: typeof o.maintenance === "number",
		};
	}
	return json;
}

function filterMonitoringHostsList(json: unknown): unknown {
	// /api/monitoring/hosts returns { status, hosts: [...] }
	if (json && typeof json === "object" && "hosts" in json) {
		const hosts = (json as { hosts: unknown[] }).hosts;
		const filtered = Array.isArray(hosts) ? filterByHostId(hosts) : [];
		return { status: (json as { status: unknown }).status, hosts: filtered };
	}
	return json;
}

function filterMonitoringGroupsList(json: unknown): unknown {
	if (json && typeof json === "object" && "groups" in json) {
		const groups = (json as { groups: unknown[] }).groups;
		const filtered = Array.isArray(groups)
			? groups.filter((g) => {
					if (g && typeof g === "object" && "tag" in g) {
						const t = (g as { tag: string }).tag;
						return typeof t === "string" && t === TAG_NAME;
					}
					return false;
				})
			: [];
		return { status: (json as { status: unknown }).status, groups: filtered };
	}
	return json;
}

function filterMonitoringAlerts(json: unknown): unknown {
	if (json && typeof json === "object" && "alerts" in json) {
		const alerts = (json as { alerts: unknown[] }).alerts;
		const filtered = Array.isArray(alerts) ? filterByHostId(alerts) : [];
		return { status: (json as { status: unknown }).status, alerts: filtered };
	}
	return json;
}

function expectShallowEqualExcept(
	a: Record<string, unknown>,
	b: Record<string, unknown>,
	exceptKeys: string[],
): void {
	const av = { ...a };
	const bv = { ...b };
	for (const k of exceptKeys) {
		delete av[k];
		delete bv[k];
	}
	// biome-ignore lint/suspicious/noMisplacedAssertion: helper invoked from inside a test()
	expect(av).toEqual(bv);
}
