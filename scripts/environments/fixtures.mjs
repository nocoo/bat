import { readFileSync } from "node:fs";
import { join } from "node:path";
import { root } from "./runtime.mjs";
export function fixtureSql(dataset, anchor) {
	if (!["demo", "focused"].includes(dataset)) throw new Error("Unknown fixture catalog");
	const focused = readFileSync(join(root, "scripts/environments/focused.sql"), "utf8").replaceAll(
		"strftime('%s','now')",
		String(anchor),
	);
	if (dataset === "focused") return focused;
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
	return sql;
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
