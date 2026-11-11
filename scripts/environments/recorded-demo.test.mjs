import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALL_ALERT_RULES } from "../../packages/shared/src/alerts.ts";
import { fixtureSql } from "./fixtures.mjs";
import {
	calendarDateFromAnchor,
	DEMO_SCENARIOS,
	readRecordedRecording,
	reconstructRtts,
	recordedDemoSql,
	SERVER_ALIASES,
} from "./recorded-demo.mjs";
import { DEMO_TIME_COLUMNS, demoRebaseSql } from "./runtime.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrations = join(root, "packages/worker/migrations");
const focusedSqlPath = join(root, "scripts/environments/focused.sql");
const ALERT_RULES = new Map(ALL_ALERT_RULES.map((rule) => [rule.id, rule]));
const ANCHOR = 1_800_000_000;
const SECOND_FILESYSTEM_HOST_ID = SERVER_ALIASES[1].host_id;

function migrate() {
	const db = new Database(":memory:");
	db.exec("PRAGMA foreign_keys = ON");
	for (const file of readdirSync(migrations).sort())
		db.exec(readFileSync(join(migrations, file), "utf8"));
	db.exec(
		"CREATE TABLE _test_marker(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO _test_marker VALUES ('env','test'),('owner','e2e-recorded');",
	);
	return db;
}

function seeded(anchor = ANCHOR, recording = readRecordedRecording()) {
	const db = migrate();
	db.exec(recordedDemoSql(recording, anchor));
	return db;
}

function rttSummary(rtts) {
	const values = rtts.filter((value) => value !== null);
	if (values.length === 0) return { avg: null, min: null, max: null };
	return {
		avg: values.reduce((sum, value) => sum + value, 0) / values.length,
		min: Math.min(...values),
		max: Math.max(...values),
	};
}

let db;
beforeAll(() => {
	db = seeded();
});
afterAll(() => {
	db?.close();
});

describe("recorded Demo SQL catalog", () => {
	test("rejects unusable recordings instead of emitting partial SQL", () => {
		const recording = structuredClone(readRecordedRecording());
		expect(() => recordedDemoSql({ ...recording, schema_version: 2 }, ANCHOR)).toThrow(
			/schema_version/,
		);
		const missingHourly = structuredClone(recording);
		missingHourly.server.hourly.data = [];
		expect(() => recordedDemoSql(missingHourly, ANCHOR)).toThrow(/server\.hourly\.data/);
		const shortTargets = structuredClone(recording);
		shortTargets.targets = shortTargets.targets.slice(0, 7);
		expect(() => recordedDemoSql(shortTargets, ANCHOR)).toThrow(/at least 8 entries/);
		const duplicate = structuredClone(recording);
		duplicate.targets[1].server_id = duplicate.targets[0].server_id;
		expect(() => recordedDemoSql(duplicate, ANCHOR)).toThrow(/duplicate/);
		const badAddress = structuredClone(recording);
		badAddress.targets[0].address = "not-an-ip";
		expect(() => recordedDemoSql(badAddress, ANCHOR)).toThrow(/usable address/);
		for (const field of [
			"received_at_age_seconds",
			"started_at_age_seconds",
			"finished_at_age_seconds",
		]) {
			const missingAge = structuredClone(recording);
			missingAge.workstation.detail.latest_report[field] = null;
			expect(() => recordedDemoSql(missingAge, ANCHOR)).toThrow(new RegExp(field));
			const stringAge = structuredClone(recording);
			stringAge.workstation.detail.latest_report[field] = String(ANCHOR);
			expect(() => recordedDemoSql(stringAge, ANCHOR)).toThrow(new RegExp(field));
		}
		expect(() => recordedDemoSql(recording, 0)).toThrow(/anchor/);
	});

	test("seeds eight distinct aliases that share one captured server template", () => {
		expect(db.query("SELECT value FROM _test_marker WHERE key='env'").get().value).toBe("test");
		expect(db.query("SELECT COUNT(*) AS count FROM hosts").get().count).toBe(8);
		expect(db.query("SELECT COUNT(*) AS count FROM hosts WHERE is_active=1").get().count).toBe(8);
		const hosts = db.query("SELECT host_id,hostname,public_ip FROM hosts ORDER BY host_id").all();
		expect(hosts.map((host) => host.host_id).sort()).toEqual(
			SERVER_ALIASES.map((alias) => alias.host_id).sort(),
		);
		expect(hosts.map((host) => host.hostname).sort()).toEqual(
			SERVER_ALIASES.map((alias) => alias.hostname).sort(),
		);
		expect(new Set(hosts.map((host) => host.hostname)).size).toBe(8);
		expect(new Set(hosts.map((host) => host.public_ip)).size).toBe(8);
		for (const host of hosts) {
			expect(host.hostname.endsWith(".example.test")).toBe(true);
			expect(host.public_ip.startsWith("203.0.113.")).toBe(true);
		}
		expect(hosts.some((host) => host.host_id === "pw-host-alpha")).toBe(true);
		expect(hosts.some((host) => host.host_id === "pw-host-beta")).toBe(true);
		expect(hosts.some((host) => host.host_id === "demo-offline")).toBe(false);

		const template = db
			.query(
				"SELECT os,kernel,arch,cpu_model,cpu_logical,cpu_physical,mem_total_bytes,swap_total_bytes,virtualization,disks,boot_mode,timezone,dns_resolvers,dns_search,boot_time,top_processes_json,top_processes_ts FROM hosts WHERE host_id='pw-host-alpha'",
			)
			.get();
		for (const host of hosts.filter((entry) => entry.host_id !== "pw-host-alpha")) {
			const row = db
				.query(
					"SELECT os,kernel,arch,cpu_model,cpu_logical,cpu_physical,mem_total_bytes,swap_total_bytes,virtualization,disks,boot_mode,timezone,dns_resolvers,dns_search,boot_time,top_processes_json,top_processes_ts FROM hosts WHERE host_id=?",
				)
				.get(host.host_id);
			expect(row).toEqual(template);
		}
		expect(JSON.parse(template.top_processes_json).length).toBeGreaterThan(0);
		for (const row of db.query("SELECT host_id,last_seen FROM hosts").all()) {
			expect(row.last_seen).toBe(ANCHOR - DEMO_SCENARIOS[row.host_id].lastSeenAgeSeconds);
		}

		const alphaNet = JSON.parse(
			db.query("SELECT net_interfaces FROM hosts WHERE host_id='pw-host-alpha'").get()
				.net_interfaces,
		);
		const betaNet = JSON.parse(
			db.query("SELECT net_interfaces FROM hosts WHERE host_id='pw-host-beta'").get()
				.net_interfaces,
		);
		expect(alphaNet).not.toEqual(betaNet);
		expect(alphaNet.some((iface) => iface.ipv4.includes("203.0.113.1"))).toBe(true);
		expect(betaNet.some((iface) => iface.ipv4.includes("203.0.113.8"))).toBe(true);
	});

	test("seeds a status mixture whose alerts point at the tier 2 evidence it serves", () => {
		const alerts = db
			.query("SELECT host_id,rule_id,severity,value,triggered_at,message FROM alert_states")
			.all();
		const lastSeen = new Map(
			db
				.query("SELECT host_id,last_seen FROM hosts")
				.all()
				.map((row) => [row.host_id, row.last_seen]),
		);
		const statusOf = (hostId) => {
			if (ANCHOR - lastSeen.get(hostId) > 120) return "offline";
			const own = alerts.filter((alert) => alert.host_id === hostId);
			if (own.some((alert) => alert.severity === "critical")) return "critical";
			if (own.some((alert) => alert.severity === "warning")) return "warning";
			return "healthy";
		};
		const statuses = SERVER_ALIASES.map((alias) => statusOf(alias.host_id));
		expect(statuses.filter((status) => status === "healthy")).toHaveLength(2);
		expect(statuses.filter((status) => status === "warning")).toHaveLength(2);
		expect(statuses.filter((status) => status === "critical")).toHaveLength(2);
		expect(statuses.filter((status) => status === "offline")).toHaveLength(2);
		for (const alert of alerts) {
			expect(ALERT_RULES.get(alert.rule_id)?.severity).toBe(alert.severity);
			expect(alert.triggered_at).toBeLessThan(ANCHOR);
		}

		const tier2 = (hostId) => {
			const row = db
				.query("SELECT ports_json,systemd_json,security_json FROM tier2_snapshots WHERE host_id=?")
				.get(hostId);
			return {
				ports: JSON.parse(row.ports_json),
				systemd: JSON.parse(row.systemd_json),
				security: JSON.parse(row.security_json),
			};
		};
		const allowlisted = new Set(
			db
				.query("SELECT port FROM port_allowlist WHERE host_id=?")
				.all("demo-server-03")
				.map((row) => row.port),
		);
		const [publicPortAlert] = alerts.filter((alert) => alert.rule_id === "public_port");
		const boundAddresses = tier2(publicPortAlert.host_id).ports.listening.filter(
			(port) => port.port === publicPortAlert.value,
		);
		expect(
			boundAddresses.some((port) => !["127.0.0.1", "::1"].includes(port.bind)) &&
				!allowlisted.has(publicPortAlert.value),
		).toBe(true);
		expect(publicPortAlert.message).toContain(String(publicPortAlert.value));

		const failed = alerts.find((alert) => alert.rule_id === "systemd_failed");
		const systemd = tier2(failed.host_id).systemd;
		expect(systemd.failed_count).toBe(systemd.failed.length);
		expect(systemd.failed.length).toBeGreaterThan(0);
		expect(failed.message).toContain(systemd.failed[0].unit);

		const noFirewall = alerts.find((alert) => alert.rule_id === "no_firewall");
		expect(tier2(noFirewall.host_id).security.firewall_active).toBe(false);

		const rootLogin = alerts.find((alert) => alert.rule_id === "ssh_root_login");
		expect(tier2(rootLogin.host_id).security.ssh_root_login).toBe("yes");
		expect(alerts.filter((alert) => alert.host_id === noFirewall.host_id).length).toBeGreaterThan(
			0,
		);
	});

	test("replicates captured raw, hourly, tier 2 and process history for every alias", () => {
		const recording = readRecordedRecording();
		const rawCount = recording.server.raw.data.length;
		const hourlyCount = recording.server.hourly.data.length;
		expect(db.query("SELECT COUNT(*) AS count FROM metrics_raw").get().count).toBe(8 * rawCount);
		expect(db.query("SELECT COUNT(*) AS count FROM metrics_hourly").get().count).toBe(
			8 * hourlyCount,
		);
		expect(db.query("SELECT COUNT(*) AS count FROM tier2_snapshots").get().count).toBe(8);
		expect(db.query("SELECT COUNT(*) AS count FROM port_allowlist").get().count).toBe(
			8 * recording.server.allowed_ports.length,
		);

		const rawColumns =
			"ts,cpu_usage_pct,cpu_iowait,mem_total,mem_available,swap_used,disk_json,net_json,disk_io_json,oom_kills";
		const raw = (hostId) =>
			db.query(`SELECT ${rawColumns} FROM metrics_raw WHERE host_id=? ORDER BY ts`).all(hostId);
		const alphaRaw = raw("pw-host-alpha");
		expect(alphaRaw.length).toBe(rawCount);
		for (const alias of SERVER_ALIASES.slice(1)) {
			if (alias.host_id === SECOND_FILESYSTEM_HOST_ID) {
				continue;
			}
			expect(raw(alias.host_id)).toEqual(alphaRaw);
		}

		const hourlyColumns =
			"hour_ts,sample_count,cpu_usage_avg,cpu_usage_max,mem_available_min,mem_used_pct_max,net_rx_bytes_max,ext_json";
		const hourly = (hostId) =>
			db
				.query(`SELECT ${hourlyColumns} FROM metrics_hourly WHERE host_id=? ORDER BY hour_ts`)
				.all(hostId);
		const alphaHourly = hourly("pw-host-alpha");
		expect(alphaHourly.length).toBe(hourlyCount);
		for (const alias of SERVER_ALIASES.slice(1)) {
			if (alias.host_id === SECOND_FILESYSTEM_HOST_ID) {
				continue;
			}
			expect(hourly(alias.host_id)).toEqual(alphaHourly);
		}

		const tier2 = (hostId) =>
			db
				.query(
					"SELECT ts,ports_json,systemd_json,security_json,docker_json,disk_deep_json,software_json,websites_json FROM tier2_snapshots WHERE host_id=?",
				)
				.get(hostId);
		const alphaTier2 = tier2("pw-host-alpha");
		const shared = (hostId) =>
			db
				.query(
					"SELECT ts,ports_json,docker_json,disk_deep_json,software_json,websites_json FROM tier2_snapshots WHERE host_id=?",
				)
				.get(hostId);
		for (const alias of SERVER_ALIASES.slice(1))
			expect(shared(alias.host_id)).toEqual(shared("pw-host-alpha"));
		const captured = readRecordedRecording().server.tier2;
		for (const alias of SERVER_ALIASES) {
			const scenario = DEMO_SCENARIOS[alias.host_id];
			const row = tier2(alias.host_id);
			expect(JSON.parse(row.systemd_json)).toEqual({
				...captured.systemd,
				...scenario.systemd,
			});
			expect(JSON.parse(row.security_json)).toEqual({
				...captured.security,
				...scenario.security,
			});
		}
		expect(JSON.parse(alphaTier2.software_json).detected.length).toBeGreaterThan(0);
	});

	test("gives one host two filesystems while the others keep the merged one", () => {
		const devicesOf = (hostId) =>
			new Set(
				db
					.query("SELECT disk_json FROM metrics_raw WHERE host_id=? ORDER BY ts")
					.all(hostId)
					.map((row) =>
						JSON.parse(row.disk_json)
							.map((disk) => disk.device)
							.join(","),
					),
			);
		const devices = (hostId) => {
			const shapes = devicesOf(hostId);
			expect(shapes.size).toBe(1);
			return [...new Set([...shapes][0].split(","))];
		};

		const second = devices(SECOND_FILESYSTEM_HOST_ID);
		expect(second.length).toBe(2);
		for (const alias of SERVER_ALIASES) {
			if (alias.host_id === SECOND_FILESYSTEM_HOST_ID) {
				continue;
			}
			expect(devices(alias.host_id).length).toBe(1);
		}

		const mergedMounts = JSON.parse(
			db
				.query("SELECT disk_json FROM metrics_raw WHERE host_id='pw-host-alpha' ORDER BY ts")
				.all("pw-host-alpha")[0].disk_json,
		);
		expect(mergedMounts.length).toBeGreaterThan(1);
		expect(new Set(mergedMounts.map((disk) => disk.device)).size).toBe(1);

		const twoFilesystemMounts = JSON.parse(
			db
				.query("SELECT disk_json FROM metrics_raw WHERE host_id=? ORDER BY ts")
				.all(SECOND_FILESYSTEM_HOST_ID)[0].disk_json,
		);
		expect(new Set(twoFilesystemMounts.map((disk) => disk.device)).size).toBe(2);
	});

	test("maps hourly averages to real columns and leaves uncaptured maxima NULL", () => {
		const recording = readRecordedRecording();
		const point = recording.server.hourly.data[0];
		const row = db
			.query(
				"SELECT hour_ts,sample_count,cpu_usage_avg,cpu_usage_max,mem_available_min,mem_used_pct_max,swap_used_max,swap_used_pct_max,uptime_min,net_rx_bytes_avg,net_rx_bytes_max,psi_cpu_some_avg10_avg,psi_cpu_some_avg10_max,tcp_established_avg,tcp_established_max,oom_kills_sum,fd_max,disk_io_json,ext_json FROM metrics_hourly WHERE host_id='pw-host-alpha' AND hour_ts=?",
			)
			.get(ANCHOR - point.age_seconds);
		expect(row.sample_count).toBe(point.sample_count);
		expect(row.cpu_usage_avg).toBe(point.cpu_usage_pct);
		expect(row.cpu_usage_max).toBeNull();
		expect(row.mem_available_min).toBe(point.mem_available);
		expect(row.mem_used_pct_max).toBeNull();
		expect(row.swap_used_max).toBe(point.swap_used);
		expect(row.swap_used_pct_max).toBeNull();
		expect(row.uptime_min).toBe(point.uptime_seconds);
		expect(row.net_rx_bytes_avg).toBe(point.net_rx_bytes_avg);
		expect(row.net_rx_bytes_max).toBe(point.net_rx_bytes_max);
		expect(row.psi_cpu_some_avg10_avg).toBe(point.psi_cpu_some_avg10);
		expect(row.psi_cpu_some_avg10_max).toBeNull();
		expect(row.tcp_established_avg).toBe(point.tcp_established);
		expect(row.tcp_established_max).toBeNull();
		expect(row.oom_kills_sum).toBe(point.oom_kills);
		expect(row.fd_max).toBe(point.fd_max);
		expect(row.disk_io_json).toBeNull();
		const ext = JSON.parse(row.ext_json);
		expect(ext.mem_committed_as_avg).toBe(point.mem_committed_as);
		expect(ext.conntrack_max).toBe(point.conntrack_max);
		expect(ext.mem_committed_as_max).toBeUndefined();
	});

	test("preserves source zeros and never turns them into NULL", () => {
		const point = readRecordedRecording().server.raw.data.at(-1);
		const row = db
			.query(
				"SELECT cpu_steal,tcp_orphan,oom_kills,mem_hw_corrupted,netstat_tcp_timeouts_delta,disk_io_json FROM metrics_raw WHERE host_id='pw-host-alpha' AND ts=?",
			)
			.get(ANCHOR - point.age_seconds);
		expect(row.cpu_steal).toBe(0);
		expect(row.tcp_orphan).toBe(0);
		expect(row.oom_kills).toBe(0);
		expect(row.mem_hw_corrupted).toBe(0);
		expect(row.netstat_tcp_timeouts_delta).toBe(0);
		expect(JSON.parse(row.disk_io_json)).toEqual(point.disk_io);
	});

	test("seeds one workstation with a non-usable credential and captured payload", () => {
		const workstation = db.query("SELECT * FROM workstations").get();
		expect(workstation.id).toBe("00000000-0000-4000-8000-000000000001");
		expect(workstation.owner).toBe("email:operator@example.test");
		expect(workstation.disabled).toBe(0);
		expect(workstation.token_prefix).toBe("batw_fixture");
		expect(workstation.token_hash).toMatch(/^[0-9a-f]{64}$/);
		expect(workstation.token_hash).not.toBe("0".repeat(64));
		expect(db.query("SELECT COUNT(*) AS count FROM workstations").get().count).toBe(1);
		expect(db.query("SELECT COUNT(*) AS count FROM workstation_reports").get().count).toBe(4);
		expect(db.query("SELECT COUNT(*) AS count FROM workstation_connectivity").get().count).toBe(
			4 * 8,
		);

		const latest = readRecordedRecording().workstation.detail.latest_report;
		const report = db
			.query("SELECT * FROM workstation_reports ORDER BY received_at DESC LIMIT 1")
			.get();
		expect(report.report_id).toBe(latest.report_id);
		expect(report.received_at).toBe(ANCHOR - latest.received_at_age_seconds);
		expect(report.cpu_usage_pct).toBe(latest.cpu.usage_pct);
		const payload = JSON.parse(report.payload);
		expect(payload.started_at).toBe(ANCHOR - latest.started_at_age_seconds);
		expect(payload.finished_at).toBe(ANCHOR - latest.finished_at_age_seconds);
		expect(JSON.stringify(payload).includes("_age_seconds")).toBe(false);
		expect(payload.disk).toEqual(latest.disk);
		expect(payload.network).toEqual(latest.network);

		const targets = new Map(
			readRecordedRecording().targets.map((target) => [target.server_id, target]),
		);
		for (const entry of latest.connectivity) {
			const mapped = payload.connectivity.find(
				(item) =>
					item.server_id ===
					SERVER_ALIASES.find((alias) => alias.server_id === entry.server_id).host_id,
			);
			expect(mapped.rtts_ms).toEqual(entry.rtts_ms);
			expect(mapped.received).toBe(entry.received);
			expect(mapped.status).toBe(entry.status);
			expect(mapped.address).toBe(targets.get(entry.server_id).address);
		}
	});

	test("keeps report payload and connectivity rows consistent for loss display", () => {
		const latest = readRecordedRecording().workstation.detail.latest_report;
		const report = db
			.query("SELECT report_id,payload FROM workstation_reports ORDER BY received_at DESC LIMIT 1")
			.get();
		const payload = JSON.parse(report.payload);
		const rows = db
			.query(
				"SELECT server_id,sent,received,rtts,status FROM workstation_connectivity WHERE report_id=? ORDER BY server_id",
			)
			.all(report.report_id);
		expect(rows.length).toBe(8);
		for (const entry of payload.connectivity) {
			const row = rows.find((candidate) => candidate.server_id === entry.server_id);
			expect(row).toBeDefined();
			expect(entry.sent).toBe(row.sent);
			expect(entry.received).toBe(row.received);
			expect(entry.status).toBe(row.status);
			expect(entry.rtts_ms).toEqual(JSON.parse(row.rtts));
			const alias = SERVER_ALIASES.find((candidate) => candidate.host_id === entry.server_id);
			const captured = latest.connectivity.find(
				(candidate) => candidate.server_id === alias.server_id,
			);
			expect(entry.sent).toBe(captured.sent);
		}
		const alpha = payload.connectivity.find((entry) => entry.server_id === "pw-host-alpha");
		const beta = payload.connectivity.find((entry) => entry.server_id === "pw-host-beta");
		// Local packet loss, matching the UI rule that a collector failure is not
		// an observation. Kept here so the fixture suite never imports app code.
		const loss = ({ status, sent, received }) => {
			if (status === "error" || status === "unsupported") {
				return null;
			}
			return (Math.round(((sent - received) / sent) * 1000) / 10).toString();
		};
		expect(loss(alpha)).toBe("0");
		expect(loss(beta)).toBe("100");
		expect(loss({ status: "partial", sent: 3, received: 1 })).toBe("66.7");

		const older = db
			.query("SELECT report_id,payload FROM workstation_reports ORDER BY received_at ASC LIMIT 1")
			.get();
		const olderRows = db
			.query(
				"SELECT server_id,sent,received,rtts,status FROM workstation_connectivity WHERE report_id=?",
			)
			.all(older.report_id);
		for (const entry of JSON.parse(older.payload).connectivity) {
			const row = olderRows.find((candidate) => candidate.server_id === entry.server_id);
			expect(entry.sent).toBe(3);
			expect(entry.sent).toBe(row.sent);
			expect(entry.received).toBe(row.received);
			expect(entry.status).toBe(row.status);
			expect(entry.rtts_ms).toEqual(JSON.parse(row.rtts));
		}
	});

	test("gives the aliases varied billing so every countdown state is visible", () => {
		const rows = db
			.query("SELECT host_id,cost_amount_cny,paid_at,renews_at FROM hosts ORDER BY host_id")
			.all();
		const byHost = new Map(rows.map((row) => [row.host_id, row]));
		const days = (from, to) =>
			Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

		const priced = rows.filter((row) => row.renews_at !== null);
		expect(priced.length).toBe(6);
		expect(rows.length - priced.length).toBe(2);

		const periods = priced.map((row) => days(row.paid_at, row.renews_at));
		// One annual, one quarterly and the rest monthly plans.
		expect(periods).toContain(365);
		expect(periods).toContain(91);
		expect(periods.filter((period) => period === 30).length).toBe(3);
		for (const row of priced) {
			expect(row.cost_amount_cny).toBeGreaterThan(0);
			expect(days(row.paid_at, row.renews_at)).toBeGreaterThan(0);
		}

		// One renewal is overdue, one falls inside the week and one is due today.
		const today = calendarDateFromAnchor(ANCHOR, 0);
		const remaining = priced.map((row) => days(today, row.renews_at));
		expect(remaining.some((value) => value < 0)).toBe(true);
		expect(remaining.some((value) => value >= 0 && value <= 7)).toBe(true);
		expect(remaining).toContain(0);
		expect(remaining.some((value) => value > 7)).toBe(true);

		// The two aliases without billing data stay empty.
		for (const hostId of ["demo-server-05", "demo-server-06"]) {
			const row = byHost.get(hostId);
			expect(row.cost_amount_cny).toBeNull();
			expect(row.paid_at).toBeNull();
			expect(row.renews_at).toBeNull();
		}
	});

	test("gives the aliases varied contract data with independent fields", () => {
		const rows = db
			.query(
				"SELECT host_id,bandwidth_mbps,traffic_quota_gb,traffic_reset_day FROM hosts ORDER BY host_id",
			)
			.all();
		const byHost = new Map(rows.map((row) => [row.host_id, row]));

		// Every display state is visible: Mbps below the gigabit switch, at it,
		// and a fractional gigabit above it.
		const bandwidths = rows.map((row) => row.bandwidth_mbps).filter((value) => value !== null);
		expect(bandwidths).toContain(100);
		expect(bandwidths).toContain(500);
		expect(bandwidths).toContain(1000);
		expect(bandwidths).toContain(2500);

		// Quotas in GB and several reset days, each independent of the rest.
		const quotas = rows.map((row) => row.traffic_quota_gb).filter((value) => value !== null);
		expect(quotas).toContain(500);
		expect(quotas).toContain(1000);
		expect(quotas).toContain(2000);
		const resetDays = rows.map((row) => row.traffic_reset_day).filter((value) => value !== null);
		for (const day of [1, 5, 15, 28]) {
			expect(resetDays).toContain(day);
		}

		// A host may carry a bandwidth without a quota or reset day.
		const beta = byHost.get("pw-host-beta");
		expect(beta.bandwidth_mbps).toBe(100);
		expect(beta.traffic_quota_gb).toBeNull();
		expect(beta.traffic_reset_day).toBeNull();

		// Two aliases carry no contract data at all — one with billing, one
		// without, so partial states never read as the whole story.
		const empty = rows.filter(
			(row) =>
				row.bandwidth_mbps === null &&
				row.traffic_quota_gb === null &&
				row.traffic_reset_day === null,
		);
		expect(empty.length).toBe(2);
	});

	test("seeds varied tags and a few descriptions so the list shows both", () => {
		const tags = db.query("SELECT id,name,color FROM tags ORDER BY id").all();
		expect(tags.length).toBeGreaterThanOrEqual(8);
		for (const tag of tags) {
			expect(tag.name).toMatch(/^[a-z-]+$/);
			expect(tag.color).toBeGreaterThanOrEqual(0);
			expect(tag.color).toBeLessThan(10);
		}

		const assignments = db
			.query("SELECT host_id,tag_id FROM host_tags ORDER BY host_id,tag_id")
			.all();
		const perHost = new Map();
		for (const row of assignments) {
			perHost.set(row.host_id, (perHost.get(row.host_id) ?? 0) + 1);
		}
		// Some aliases carry several tags, others carry none.
		expect(Math.max(...perHost.values())).toBeGreaterThanOrEqual(3);
		expect(Math.min(...perHost.values())).toBeLessThanOrEqual(2);
		const untagged = SERVER_ALIASES.filter((alias) => !perHost.has(alias.host_id));
		expect(untagged.length).toBeGreaterThanOrEqual(1);
		const tagIds = new Set(tags.map((tag) => tag.id));
		for (const row of assignments) {
			expect(tagIds.has(row.tag_id)).toBe(true);
		}

		const described = db
			.query("SELECT host_id,description FROM hosts WHERE description IS NOT NULL")
			.all();
		expect(described.length).toBeGreaterThanOrEqual(2);
		for (const row of described) {
			expect(row.description.length).toBeGreaterThan(10);
			expect(row.description.length).toBeLessThanOrEqual(200);
		}
		const withoutDescription = db
			.query("SELECT host_id FROM hosts WHERE description IS NULL")
			.all();
		expect(withoutDescription.length).toBeGreaterThanOrEqual(1);
	});

	test("keeps the demo catalog complete", () => {
		const rows = db
			.query("SELECT host_id,cost_amount_cny,paid_at,renews_at FROM hosts ORDER BY host_id")
			.all();
		expect(rows.length).toBe(SERVER_ALIASES.length);
		for (const row of rows) {
			const set = [row.cost_amount_cny, row.paid_at, row.renews_at].filter(
				(value) => value !== null,
			).length;
			expect(set).toBe(row.renews_at === null ? 0 : 3);
		}
	});

	test("rebases Docker container start ages without mutating the recording", () => {
		const recording = structuredClone(readRecordedRecording());
		recording.server.tier2.docker = {
			installed: true,
			version: "1.0.0",
			containers: [
				{
					id: "demo-01",
					name: "container-01",
					image: "example.test/image-01:1",
					status: "Up",
					state: "running",
					cpu_pct: 1,
					mem_bytes: 2,
					restart_count: 0,
					started_at_age_seconds: 120,
				},
				{
					id: "demo-02",
					name: "container-02",
					image: "example.test/image-02:1",
					status: null,
					state: "created",
					cpu_pct: null,
					mem_bytes: null,
					restart_count: null,
					started_at_age_seconds: null,
				},
			],
			images: null,
		};
		const first = seeded(ANCHOR, recording);
		const later = seeded(ANCHOR + 86400, recording);
		try {
			const dockerAt = (database) =>
				JSON.parse(
					database
						.query("SELECT docker_json FROM tier2_snapshots WHERE host_id='pw-host-alpha'")
						.get().docker_json,
				);
			const firstDocker = dockerAt(first);
			const laterDocker = dockerAt(later);
			expect(firstDocker.containers[0].started_at).toBe(ANCHOR - 120);
			expect(laterDocker.containers[0].started_at).toBe(ANCHOR + 86400 - 120);
			expect(firstDocker.containers[1].started_at).toBeNull();
			expect(laterDocker.containers[1].started_at).toBeNull();
			expect(JSON.stringify(firstDocker)).not.toContain("started_at_age_seconds");
			expect(JSON.stringify(laterDocker)).not.toContain("started_at_age_seconds");
			expect(recording.server.tier2.docker.containers[0].started_at_age_seconds).toBe(120);
			expect(recording.server.tier2.docker.containers[0].started_at).toBeUndefined();
		} finally {
			first.close();
			later.close();
		}
	});

	test("maps every workstation target to a host alias on reserved addresses", () => {
		const hosts = new Map(
			db
				.query("SELECT host_id,hostname,public_ip FROM hosts")
				.all()
				.map((host) => [host.host_id, host]),
		);
		const rows = db
			.query("SELECT DISTINCT server_id,address,family FROM workstation_connectivity")
			.all();
		expect(rows.length).toBe(8);
		for (const row of rows) {
			const host = hosts.get(row.server_id);
			expect(host).toBeDefined();
			expect(row.address).toBe(host.public_ip);
			expect(row.address.startsWith("203.0.113.")).toBe(true);
			expect(row.family).toBe(4);
		}
		expect(new Set(rows.map((row) => row.server_id)).size).toBe(8);
	});

	test("keeps latest RTT tuples exact and rebuilds older aggregates without pretending order", () => {
		const recording = readRecordedRecording();
		const latest = recording.workstation.detail.latest_report;
		const latestRows = db
			.query(
				"SELECT server_id,rtts,received,status FROM workstation_connectivity WHERE received_at=? ",
			)
			.all(ANCHOR - latest.received_at_age_seconds);
		expect(latestRows.length).toBe(8);
		for (const row of latestRows) {
			const captured = latest.connectivity.find(
				(entry) =>
					entry.server_id ===
					SERVER_ALIASES.find((alias) => alias.host_id === row.server_id).server_id,
			);
			expect(JSON.parse(row.rtts)).toEqual(captured.rtts_ms);
			expect(row.received).toBe(captured.received);
			expect(row.status).toBe(captured.status);
		}

		for (const target of recording.workstation.connectivity.targets) {
			for (const point of target.data) {
				if (point.received_at_age_seconds === latest.received_at_age_seconds) continue;
				const reportId = `20000000-0000-4000-8000-${String(point.received_at_age_seconds).padStart(12, "0")}`;
				const row = db
					.query(
						"SELECT rtts,received,status FROM workstation_connectivity WHERE report_id=? AND server_id=?",
					)
					.get(
						reportId,
						SERVER_ALIASES.find((alias) => alias.server_id === target.server_id).host_id,
					);
				expect(row.status).toBe(point.status);
				expect(row.received).toBe(point.received);
				const summary = rttSummary(JSON.parse(row.rtts));
				if (point.received === 0) {
					expect(summary).toEqual({ avg: null, min: null, max: null });
				} else {
					expect(summary.avg).toBeCloseTo(point.rtt_avg_ms, 6);
					expect(summary.min).toBeCloseTo(point.rtt_min_ms, 6);
					expect(summary.max).toBeCloseTo(point.rtt_max_ms, 6);
				}
			}
		}

		expect(reconstructRtts({ received: 0, avg: null, min: null, max: null })).toEqual([
			null,
			null,
			null,
		]);
		expect(reconstructRtts({ received: 1, avg: 12, min: 12, max: 12 })).toEqual([12, null, null]);
		expect(reconstructRtts({ received: 2, avg: 15, min: 10, max: 20 })).toEqual([10, 20, null]);
		expect(reconstructRtts({ received: 3, avg: 20, min: 10, max: 20 })).toEqual([10, 20, 30]);
	});

	test("rebases every age from the anchor at seed time", () => {
		const shifted = seeded(ANCHOR + 86400);
		try {
			for (const table of ["hosts", "metrics_raw", "metrics_hourly", "tier2_snapshots"]) {
				const column = {
					hosts: "last_seen",
					metrics_raw: "ts",
					metrics_hourly: "hour_ts",
					tier2_snapshots: "ts",
				}[table];
				const before = db
					.query(`SELECT ${column} AS value FROM ${table} ORDER BY value`)
					.all()
					.map((row) => row.value);
				const after = shifted
					.query(`SELECT ${column} AS value FROM ${table} ORDER BY value`)
					.all()
					.map((row) => row.value);
				expect(after).toEqual(before.map((value) => value + 86400));
			}
			for (const column of ["created_at", "last_seen_at"]) {
				expect(shifted.query(`SELECT ${column} FROM workstations`).get()[column]).toBe(
					db.query(`SELECT ${column} FROM workstations`).get()[column] + 86400,
				);
			}
			expect(
				shifted
					.query("SELECT received_at AS value FROM workstation_reports ORDER BY value")
					.all()
					.map((row) => row.value),
			).toEqual(
				db
					.query("SELECT received_at AS value FROM workstation_reports ORDER BY value")
					.all()
					.map((row) => row.value + 86400),
			);
			expect(
				shifted
					.query("SELECT received_at AS value FROM workstation_connectivity ORDER BY value")
					.all()
					.map((row) => row.value),
			).toEqual(
				db
					.query("SELECT received_at AS value FROM workstation_connectivity ORDER BY value")
					.all()
					.map((row) => row.value + 86400),
			);
			const firstAge = readRecordedRecording().server.raw.data[0].age_seconds;
			const row = shifted
				.query("SELECT ts FROM metrics_raw WHERE host_id='pw-host-alpha' ORDER BY ts LIMIT 1")
				.get();
			expect(ANCHOR + 86400 - row.ts).toBe(firstAge);
		} finally {
			shifted.close();
		}
	});

	test("rebases a running store onto a later clock exactly like a fresh seed", () => {
		const delta = 86_400;
		const rebased = seeded();
		rebased.exec(demoRebaseSql(ANCHOR, ANCHOR + delta));
		const fresh = seeded(ANCHOR + delta);
		try {
			for (const [table, columns] of DEMO_TIME_COLUMNS) {
				for (const column of columns) {
					const read = (source) =>
						source
							.query(
								`SELECT ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL ORDER BY value`,
							)
							.all()
							.map((row) => row.value);
					expect(read(rebased)).toEqual(read(fresh));
				}
			}
		} finally {
			rebased.close();
			fresh.close();
		}
	});

	test("rebases forward only and leaves dashboard edits newer than the anchor alone", () => {
		const rebased = seeded();
		try {
			rebased.exec(
				`INSERT INTO events(host_id,title,body,source_ip,created_at) VALUES ('pw-host-alpha','edit','edit','127.0.0.1',${ANCHOR + 10})`,
			);
			rebased.exec(demoRebaseSql(ANCHOR, ANCHOR + 60));
			expect(rebased.query("SELECT created_at FROM events").get().created_at).toBe(ANCHOR + 10);
			expect(demoRebaseSql(ANCHOR, ANCHOR)).toBe("");
			expect(() => demoRebaseSql(ANCHOR + 60, ANCHOR)).toThrow(/backwards/);
		} finally {
			rebased.close();
		}
	});

	test("keeps the focused fixture path synthetic and unchanged", () => {
		const focused = fixtureSql("focused", ANCHOR);
		const base = readFileSync(focusedSqlPath, "utf8").replaceAll(
			"strftime('%s','now')",
			String(ANCHOR),
		);
		expect(focused.startsWith(base)).toBe(true);
		expect(focused).toContain("'pw-host-alpha', 'alpha.test.local'");
		expect(focused).toContain("'pw-host-beta', 'beta.test.local'");
		for (const id of [
			"11111111-1111-4111-8111-111111111111",
			"22222222-2222-4222-8222-222222222222",
			"33333333-3333-4333-8333-333333333333",
			"44444444-4444-4444-8444-444444444444",
		])
			expect(focused).toContain(id);
		expect((focused.match(/INSERT INTO workstations\(/g) ?? []).length).toBe(4);
		expect(focused).not.toContain("demo-server-03");
		expect(fixtureSql("demo", ANCHOR)).toBe(recordedDemoSql(readRecordedRecording(), ANCHOR));
		expect(() => fixtureSql("unknown", ANCHOR)).toThrow(/Unknown fixture catalog/);
	});
});
