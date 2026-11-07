import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRecordedRecording, recordedDemoSql } from "./recorded-demo.mjs";
import { root } from "./runtime.mjs";

const workstationOwner = "email:operator@example.test";
const sqlLiteral = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlJson = (value) => sqlLiteral(JSON.stringify(value));

function reportId(seed) {
	return `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}

function connectivity(serverId, address, family, rtts, status) {
	return {
		server_id: serverId,
		address,
		family,
		sent: 3,
		received: rtts.filter((rtt) => rtt !== null).length,
		rtts_ms: rtts,
		status,
	};
}

function fieldLaptopReport(anchor, index) {
	const finishedAt = anchor - 60 - index * 600;
	const cpu =
		index === 0 ? 24.6 : Math.round((30 + 18 * Math.sin(index / 7) + (index % 4)) * 10) / 10;
	const memUsed = Math.round((58 + 6 * Math.cos(index / 9)) * 10) / 10;
	const alphaRtts =
		index === 0
			? [0, 0.4, 0.7]
			: index === 25
				? [null, null, null]
				: index === 60
					? [null, null, null]
					: [18 + (index % 5), 22 + (index % 7), 19 + (index % 3)];
	const betaRtts =
		index === 0
			? [42.5, null, 40.1]
			: index === 18
				? [null, null, null]
				: [51 + (index % 9), null, 49 + (index % 6)];
	const alphaStatus =
		index === 0 ? "reachable" : index === 25 ? "timeout" : index === 60 ? "error" : "reachable";
	const betaStatus = index === 0 ? "partial" : index === 18 ? "unreachable" : "partial";
	const memTotal = 38654705664;
	return {
		report_id: reportId(1000 + index),
		started_at: finishedAt - 2,
		finished_at: finishedAt,
		sample_window_ms: 1000,
		cli_version: "2.4.2",
		hostname: "field-laptop",
		os: "macOS 15.5",
		arch: "aarch64",
		uptime_seconds: 864000 - index * 600,
		cpu: { model: "Apple M3 Pro", count: 12, usage_pct: cpu },
		mem: {
			total_bytes: memTotal,
			available_bytes: Math.round(memTotal * (1 - memUsed / 100)),
			used_pct: memUsed,
		},
		disk: [
			{
				mount: "/",
				total_bytes: 994662584320,
				available_bytes: 386547056640,
				used_pct: Math.round((52 + 2 * Math.sin(index / 8)) * 10) / 10,
			},
			{
				mount: "/Volumes/Archive",
				total_bytes: 2000398934016,
				available_bytes: 1400279253811,
				used_pct: 30,
			},
		],
		network: {
			interfaces: [
				{
					name: "en0",
					addresses: [
						{ address: "192.168.1.24", family: 4, internal: false },
						{ address: "fe80::1c2d:3e4f:5a6b:7c8d", family: 6, internal: false },
					],
				},
				{
					name: "lo0",
					addresses: [{ address: "127.0.0.1", family: 4, internal: true }],
				},
			],
		},
		connectivity: [
			connectivity("pw-host-alpha", "203.0.113.10", 4, alphaRtts, alphaStatus),
			connectivity("pw-host-beta", "198.51.100.20", 4, betaRtts, betaStatus),
		],
		collection_errors:
			index === 0 ? ["disk collector: statfs(/Volumes/Archive) permission denied"] : [],
		targets_error: null,
	};
}

function studioDesktopReport(anchor, index) {
	const finishedAt = anchor - 7200 - index * 600;
	return {
		report_id: reportId(2000 + index),
		started_at: finishedAt - 2,
		finished_at: finishedAt,
		sample_window_ms: 1000,
		cli_version: "2.4.2",
		hostname: "studio-desktop",
		os: "Ubuntu 24.04.2 LTS",
		arch: "x86_64",
		uptime_seconds: 345600 - index * 600,
		cpu: { model: "AMD Ryzen 9 7950X", count: 32, usage_pct: index === 0 ? null : 41.2 },
		mem: { total_bytes: 68719476736, available_bytes: 42949672960, used_pct: 62.4 },
		disk: [
			{
				mount: "/",
				total_bytes: 2040109465600,
				available_bytes: 587202560000,
				used_pct: 71.2,
			},
		],
		network: {
			interfaces: [
				{
					name: "enp5s0",
					addresses: [
						{ address: "10.20.0.18", family: 4, internal: false },
						{ address: "fd12:3456:789a::18", family: 6, internal: false },
					],
				},
			],
		},
		connectivity:
			index === 0
				? [
						connectivity("pw-host-alpha", "203.0.113.10", 4, [null, null, null], "unreachable"),
						connectivity("pw-host-beta", "198.51.100.20", 4, [null, null, null], "error"),
					]
				: [
						connectivity("pw-host-alpha", "203.0.113.10", 4, [64.2, 66.8, 61.4], "reachable"),
						connectivity("pw-host-beta", "198.51.100.20", 4, [82.1, null, 79.5], "partial"),
					],
		collection_errors: index === 0 ? ["ping: local resolver failure"] : [],
		targets_error: index === 0 ? "target discovery failed: connect token expired" : null,
	};
}

function retiredLaptopReport(anchor) {
	const finishedAt = anchor - 1800;
	return {
		report_id: reportId(3000),
		started_at: finishedAt - 1,
		finished_at: finishedAt,
		sample_window_ms: 1000,
		cli_version: "2.3.0",
		hostname: "retired-laptop",
		os: "Debian 12.7",
		arch: "x86_64",
		uptime_seconds: 900,
		cpu: { model: "Intel Core i5-8250U", count: 8, usage_pct: 12.5 },
		mem: { total_bytes: 8589934592, available_bytes: 5153960755, used_pct: 40 },
		disk: [
			{
				mount: "/",
				total_bytes: 256060514304,
				available_bytes: 184238915584,
				used_pct: 28.1,
			},
		],
		network: {
			interfaces: [
				{
					name: "wlp2s0",
					addresses: [{ address: "192.168.7.44", family: 4, internal: false }],
				},
			],
		},
		connectivity: [],
		collection_errors: [],
		targets_error: null,
	};
}

function workstationRows(anchor) {
	return [
		{
			id: "11111111-1111-4111-8111-111111111111",
			name: "Field laptop",
			installation: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			created_at: anchor - 86400,
			last_seen_at: anchor - 50,
			public_ip: "203.0.113.24",
			disabled: 0,
			reports: Array.from({ length: 120 }, (_, index) => fieldLaptopReport(anchor, index)),
		},
		{
			id: "22222222-2222-4222-8222-222222222222",
			name: "Studio desktop",
			installation: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			created_at: anchor - 172800,
			last_seen_at: anchor - 7190,
			public_ip: "198.51.100.31",
			disabled: 0,
			reports: Array.from({ length: 3 }, (_, index) => studioDesktopReport(anchor, index)),
		},
		{
			id: "33333333-3333-4333-8333-333333333333",
			name: "Retired laptop",
			installation: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			created_at: anchor - 259200,
			last_seen_at: anchor - 1790,
			public_ip: "203.0.113.77",
			disabled: 1,
			reports: [retiredLaptopReport(anchor)],
		},
		{
			id: "44444444-4444-4444-8444-444444444444",
			name: "New laptop",
			installation: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
			created_at: anchor - 3600,
			last_seen_at: null,
			public_ip: null,
			disabled: 0,
			reports: [],
		},
	];
}

function workstationFixtureSql(anchor) {
	let sql = "";
	let tokenSeed = 0;
	for (const workstation of workstationRows(anchor)) {
		sql += `INSERT INTO workstations(id,owner,installation_id,name,created_at,last_seen_at,public_ip,disabled,token_hash,token_prefix,version,rotated_at) VALUES (${sqlLiteral(workstation.id)},${sqlLiteral(workstationOwner)},${sqlLiteral(workstation.installation)},${sqlLiteral(workstation.name)},${workstation.created_at},${workstation.last_seen_at ?? "NULL"},${workstation.public_ip === null ? "NULL" : sqlLiteral(workstation.public_ip)},${workstation.disabled},${sqlLiteral(String(tokenSeed++).padStart(64, "0"))},${sqlLiteral("batw_fixture")},1,NULL);`;
		for (const report of workstation.reports) {
			const receivedAt = report.finished_at + 10;
			sql += `INSERT INTO workstation_reports(report_id,workstation_id,body_hash,received_at,started_at,finished_at,cpu_usage_pct,mem_used_pct,mem_total_bytes,mem_available_bytes,uptime_seconds,payload) VALUES (${sqlLiteral(report.report_id)},${sqlLiteral(workstation.id)},${sqlLiteral(`${workstation.id}:${report.report_id}`)},${receivedAt},${report.started_at},${report.finished_at},${report.cpu.usage_pct === null ? "NULL" : report.cpu.usage_pct},${report.mem.used_pct},${report.mem.total_bytes},${report.mem.available_bytes},${report.uptime_seconds},${sqlJson(report)});`;
			for (const entry of report.connectivity) {
				sql += `INSERT INTO workstation_connectivity(report_id,workstation_id,received_at,server_id,address,family,sent,received,rtts,status) VALUES (${sqlLiteral(report.report_id)},${sqlLiteral(workstation.id)},${receivedAt},${sqlLiteral(entry.server_id)},${sqlLiteral(entry.address)},${entry.family},${entry.sent},${entry.received},${sqlJson(entry.rtts_ms)},${sqlLiteral(entry.status)});`;
			}
		}
	}
	return sql;
}

export function fixtureSql(dataset, anchor) {
	if (!["demo", "focused"].includes(dataset)) throw new Error("Unknown fixture catalog");
	if (dataset === "demo") return recordedDemoSql(readRecordedRecording(), anchor);
	const focused = readFileSync(join(root, "scripts/environments/focused.sql"), "utf8").replaceAll(
		"strftime('%s','now')",
		String(anchor),
	);
	return focused + workstationFixtureSql(anchor);
}

export async function seedScenarios(base, jwt) {
	const post = async (path, body, method = "POST") => {
		const response = await fetch(base + path, {
			method,
			headers: {
				"Content-Type": "application/json",
				"Cf-Access-Jwt-Assertion": jwt,
				Origin: base,
				"X-Bat-Management": "1",
			},
			body: JSON.stringify(body),
		});
		if (!response.ok)
			throw new Error(`Fixture ${path} failed: ${response.status} ${await response.text()}`);
		return response.status === 204 ? null : response.json();
	};
	const agent = await post("/api/agents", {
		source_key: "demo-catalog-operator",
		match_key: "catalog-build",
		host_id: "pw-host-alpha",
		nickname: "Catalog builder",
		role: "release engineer",
		status: "running",
	});
	const asset = await post("/api/assets", {
		type: "cloud_service",
		name: "Catalog edge gateway",
		host_id: "pw-host-alpha",
		subtype: "workers",
		provider: "cloudflare",
		status: "active",
		metadata: { description: "Synthetic storefront gateway", url: "https://catalog.example.test" },
	});
	await post("/api/bindings", { agent_id: agent.id, asset_id: asset.id });
	await post("/api/connect/tokens", {
		name: "Demo read-only inventory",
		scope: "read",
		serverIds: ["pw-host-alpha"],
		expiresAt: null,
	});
}
