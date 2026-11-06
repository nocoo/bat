import { readFileSync } from "node:fs";
import { join } from "node:path";
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
	const focused = readFileSync(join(root, "scripts/environments/focused.sql"), "utf8").replaceAll(
		"strftime('%s','now')",
		String(anchor),
	);
	if (dataset === "focused") return focused + workstationFixtureSql(anchor);
	const quote = (value) => `'${JSON.stringify(value).replaceAll("'", "''")}'`;
	const tier2 = {
		ports: {
			listening: [
				{ port: 443, bind: "0.0.0.0", protocol: "tcp", pid: 1200, process: "nginx" },
				{ port: 5432, bind: "127.0.0.1", protocol: "tcp", pid: 1400, process: "postgres" },
			],
		},
		systemd: {
			failed_count: 1,
			failed: [
				{
					unit: "backup.service",
					load_state: "loaded",
					active_state: "failed",
					sub_state: "failed",
					description: "Nightly archive upload",
				},
			],
		},
		security: {
			ssh_password_auth: false,
			ssh_root_login: "no",
			ssh_failed_logins_7d: 12,
			firewall_active: true,
			firewall_default_policy: "deny",
			fail2ban_active: true,
			fail2ban_banned_count: 3,
			unattended_upgrades_active: true,
		},
		docker: {
			installed: true,
			version: "28.5.1",
			containers: [
				{
					id: "demo-catalog",
					name: "catalog-api",
					image: "example.test/catalog:2.3",
					status: "Up 2 days",
					state: "running",
					cpu_pct: 12,
					mem_bytes: 268435456,
					restart_count: 0,
					started_at: anchor - 172800,
				},
				{
					id: "demo-backup",
					name: "nightly-backup",
					image: "example.test/backup:1.4",
					status: "Exited (1)",
					state: "exited",
					cpu_pct: 0,
					mem_bytes: 0,
					restart_count: 2,
					started_at: anchor - 3600,
				},
			],
			images: { total_count: 4, total_bytes: 2147483648, reclaimable_bytes: 536870912 },
		},
		disk_deep: {
			top_dirs: [
				{ path: "/var/lib/postgresql", size_bytes: 8589934592 },
				{ path: "/var/log", size_bytes: 1073741824 },
			],
			journal_bytes: 268435456,
			large_files: [{ path: "/var/backups/catalog-2026.sql.gz", size_bytes: 2147483648 }],
		},
		software: {
			detected: [
				{
					id: "nginx",
					name: "Nginx",
					category: "web",
					version: "1.28.0",
					source: "binary",
					running: true,
					listening_ports: [443],
				},
				{
					id: "postgres",
					name: "PostgreSQL",
					category: "database",
					version: "17.6",
					source: "process",
					running: true,
					listening_ports: [5432],
				},
			],
			scan_duration_ms: 240,
			version_duration_ms: 120,
		},
		websites: {
			sites: [
				{ domain: "catalog.example.test", web_server: "nginx", ssl: true },
				{ domain: "preview.example.test", web_server: "nginx", ssl: false },
			],
		},
	};
	let sql = focused;
	sql += `UPDATE metrics_raw SET mem_used_pct=85.2,mem_available=1271310319,disk_json='[{"mount":"/","total_bytes":53687091200,"avail_bytes":4241280205,"used_pct":92.1}]' WHERE host_id='pw-host-alpha';`;
	sql +=
		"UPDATE hosts SET description='Synthetic catalog service — primary application and database', timezone='UTC' WHERE host_id='pw-host-alpha';";
	sql +=
		"UPDATE hosts SET description='Synthetic preview environment — ARM capacity pool' WHERE host_id='pw-host-beta';";
	for (const host of ["pw-host-alpha", "pw-host-beta"]) {
		const columns = Object.keys(tier2)
			.map((k) => `${k}_json`)
			.join(",");
		sql += `INSERT INTO tier2_snapshots(host_id,ts,${columns}) VALUES('${host}',${anchor},${Object.values(tier2).map(quote).join(",")});`;
		for (let i = 2; i <= 120; i++) {
			const cpu = 30 + 15 * Math.sin(i / 8);
			sql += `INSERT OR IGNORE INTO metrics_raw(host_id,ts,cpu_load1,cpu_usage_pct,cpu_count,mem_total,mem_available,mem_used_pct,disk_json,net_json,uptime_seconds) VALUES('${host}',${anchor - i * 30},1.2,${cpu},8,8589934592,5368709120,37.5,'[{"mount":"/","total_bytes":53687091200,"avail_bytes":32212254720,"used_pct":40}]','[{"iface":"eth0","rx_bytes_rate":125000,"tx_bytes_rate":62500,"rx_errors":0,"tx_errors":0}]',${86400 - i * 30});`;
		}
	}
	sql += `INSERT INTO hosts(host_id,hostname,os,arch,last_seen,is_active,description) VALUES ('demo-offline','archive.example.test','Debian 12','x86_64',${anchor - 86400},1,'Synthetic archive node — awaiting maintenance'),('demo-paused','standby.example.test','Ubuntu 24.04','aarch64',${anchor - 7200},0,'Synthetic standby node — intentionally paused');`;
	sql += `UPDATE metrics_raw SET psi_cpu_some_avg10=1.2,psi_mem_some_avg60=0.4,psi_io_some_avg60=0.8,tcp_established=48,tcp_time_wait=12,tcp_orphan=0,tcp_allocated=64,context_switches_sec=1200,forks_sec=8,procs_running=3,procs_blocked=0,oom_kills=0,fd_allocated=850,fd_max=1048576,disk_io_json='${JSON.stringify([{ device: "vda", read_iops: 24, write_iops: 16, read_bytes_sec: 262144, write_bytes_sec: 131072, io_util_pct: 12, read_await_ms: 1.4, write_await_ms: 2.1, io_queue_depth: 0.3 }])}'; UPDATE hosts SET top_processes_ts=${anchor},top_processes_json='${JSON.stringify([{ pid: 1400, name: "postgres", cmd: "postgres -D /var/lib/postgresql/data", state: "S", ppid: 1, user: "postgres", cpu_pct: 18, mem_rss: 536870912, mem_pct: 6.25, mem_virt: 1073741824, num_threads: 4, uptime: 86400, majflt_rate: 0, io_read_rate: 262144, io_write_rate: 131072, processor: 2 }])}';`;
	return sql + workstationFixtureSql(anchor);
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
	await post(
		"/api/hosts/demo-offline/maintenance",
		{ start: "02:00", end: "04:00", reason: "Scheduled archive maintenance" },
		"PUT",
	);
	await post("/api/connect/tokens", {
		name: "Demo read-only inventory",
		scope: "read",
		serverIds: ["pw-host-alpha"],
		expiresAt: null,
	});
}
