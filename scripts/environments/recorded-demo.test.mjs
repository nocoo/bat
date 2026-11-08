import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureSql } from "./fixtures.mjs";
import {
	readRecordedRecording,
	reconstructRtts,
	recordedDemoSql,
	SERVER_ALIASES,
} from "./recorded-demo.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const migrations = join(root, "packages/worker/migrations");
const focusedSqlPath = join(root, "scripts/environments/focused.sql");
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
				"SELECT os,kernel,arch,cpu_model,cpu_logical,cpu_physical,mem_total_bytes,swap_total_bytes,virtualization,disks,boot_mode,timezone,dns_resolvers,dns_search,boot_time,last_seen,top_processes_json,top_processes_ts FROM hosts WHERE host_id='pw-host-alpha'",
			)
			.get();
		for (const host of hosts.filter((entry) => entry.host_id !== "pw-host-alpha")) {
			const row = db
				.query(
					"SELECT os,kernel,arch,cpu_model,cpu_logical,cpu_physical,mem_total_bytes,swap_total_bytes,virtualization,disks,boot_mode,timezone,dns_resolvers,dns_search,boot_time,last_seen,top_processes_json,top_processes_ts FROM hosts WHERE host_id=?",
				)
				.get(host.host_id);
			expect(row).toEqual(template);
		}
		expect(JSON.parse(template.top_processes_json).length).toBeGreaterThan(0);
		expect(template.last_seen).toBe(
			ANCHOR - readRecordedRecording().server.detail.last_seen_age_seconds,
		);

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
		for (const alias of SERVER_ALIASES.slice(1)) expect(tier2(alias.host_id)).toEqual(alphaTier2);
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
