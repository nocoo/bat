// Recorded Demo catalog loader.
//
// This module turns the audited, de-identified recording in
// `fixtures/recorded.json` into SQL for a fresh local D1 store. It never reads
// raw captures, production credentials or remote resources. The focused
// synthetic catalog does not use this module.
//
// Mapping rules:
// - captured identities stay reserved: server-01 -> pw-host-alpha and
//   server-02 -> pw-host-beta for capture/E2E routes; the other six aliases are
//   demo-server-03..08;
// - every alias shares the single captured server template (metrics, inventory,
//   processes, tier 2) but gets its own hostname, hid, public address and
//   interface identities;
// - the captured server owns two filesystems. Every alias reports the primary
//   one; the second alias also reports the captured second filesystem so the
//   demo shows a merged single-donut host and a two-donut host without any
//   fixture injection;
// - `*_age_seconds` becomes `anchor - age`; bare source epochs are never stored;
// - uncaptured aggregate maxima stay NULL instead of being invented;
// - the single captured workstation keeps its canonical id, one full latest
//   report and the captured scalar history. Connectivity history older than the
//   latest report only exposes aggregates, so those RTT tuples are rebuilt from
//   min/avg/max while preserving the reported aggregates; their original packet
//   order is unknown and is not claimed.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const recordedFixturePath = join(here, "fixtures/recorded.json");

export const SERVER_ALIASES = [
	{ server_id: "server-01", host_id: "pw-host-alpha", hostname: "alpha.example.test" },
	{ server_id: "server-02", host_id: "pw-host-beta", hostname: "beta.example.test" },
	{ server_id: "server-03", host_id: "demo-server-03", hostname: "server-03.example.test" },
	{ server_id: "server-04", host_id: "demo-server-04", hostname: "server-04.example.test" },
	{ server_id: "server-05", host_id: "demo-server-05", hostname: "server-05.example.test" },
	{ server_id: "server-06", host_id: "demo-server-06", hostname: "server-06.example.test" },
	{ server_id: "server-07", host_id: "demo-server-07", hostname: "server-07.example.test" },
	{ server_id: "server-08", host_id: "demo-server-08", hostname: "server-08.example.test" },
];

// Manual billing inputs per demo alias, so a reviewer sees every countdown
// state at once: an annual plan, a monthly plan, a quarterly plan, a renewal
// already overdue, a renewal inside the week, a renewal today, and two
// aliases that carry no billing data at all.
//
// The offsets are calendar days relative to the seed anchor, so the catalog
// stays meaningful whenever it is seeded. The paid date and the renewal date
// are chosen together — their distance is the billing period.
const BILLING_BY_HOST = {
	"pw-host-alpha": { amount: 3650, paidOffsetDays: -253, renewsOffsetDays: 112 },
	"pw-host-beta": { amount: 45, paidOffsetDays: -25, renewsOffsetDays: 5 },
	"demo-server-03": { amount: 300, paidOffsetDays: -94, renewsOffsetDays: -3 },
	"demo-server-04": { amount: 88.5, paidOffsetDays: -30, renewsOffsetDays: 0 },
	"demo-server-07": { amount: 2190, paidOffsetDays: -125, renewsOffsetDays: 240 },
	"demo-server-08": { amount: 30, paidOffsetDays: -15, renewsOffsetDays: 15 },
};

const WORKSTATION_INSTALLATION_ID = "30000000-0000-4000-8000-000000000001";
const WORKSTATION_TOKEN_PREFIX = "batw_fixture";

// Tag labels for the demo fleet. The recording carries no tags, so the demo
// seeds its own reviewer-facing set: every label is synthetic, the palette
// index matches the dashboard swatch order, and the distribution shows both
// the inline tag trail and the "+N" overflow.
const TAG_COLORS = {
	production: 0,
	staging: 3,
	edge: 5,
	database: 7,
	cdn: 2,
	storage: 6,
	backup: 4,
	canary: 8,
	observability: 1,
	"eu-west": 9,
};

const TAGS_BY_HOST = {
	"pw-host-alpha": ["production", "edge", "eu-west"],
	"pw-host-beta": ["staging", "canary"],
	"demo-server-03": [],
	"demo-server-04": ["production", "database"],
	"demo-server-05": ["edge", "cdn"],
	"demo-server-06": [],
	"demo-server-07": ["production", "edge", "storage", "backup"],
	"demo-server-08": ["staging", "observability"],
};

// Short notes about the demo aliases. They are reviewer-facing prose, not
// captured data, and stay well inside the 200 character limit.
const DESCRIPTIONS_BY_HOST = {
	"pw-host-alpha":
		"Public ingress for the demo fleet: terminates TLS and fronts the application hosts.",
	"demo-server-04":
		"Primary database host. Runs the Postgres primary plus the nightly base backups.",
	"demo-server-07":
		"Object storage node with the bulk archives. Serves the demo recordings and the nightly tarballs, and mirrors them to an offline drive; the dataset grows a few gigabytes every week.",
};

// The second alias is the demo's two-filesystem host.
const SECOND_FILESYSTEM_ALIAS_INDEX = 1;

/**
 * Disk payload for one alias. The captured server exposes two filesystems;
 * every alias reports the primary one, and the second alias also reports the
 * captured second filesystem.
 */
function aliasDiskPayload(disks, aliasIndex) {
	if (!Array.isArray(disks) || disks.length === 0) {
		return [];
	}
	if (aliasIndex === SECOND_FILESYSTEM_ALIAS_INDEX) {
		return disks;
	}
	const primary = disks[0]?.device;
	if (!primary) {
		return disks;
	}
	return disks.filter((disk) => disk.device === primary);
}

const RAW_SCALARS = `cpu_load1 cpu_load5 cpu_load15 cpu_usage_pct cpu_iowait cpu_steal cpu_count
mem_total mem_available mem_used_pct swap_total swap_used swap_used_pct uptime_seconds
psi_cpu_some_avg10 psi_cpu_some_avg60 psi_cpu_some_avg300
psi_mem_some_avg10 psi_mem_some_avg60 psi_mem_some_avg300
psi_mem_full_avg10 psi_mem_full_avg60 psi_mem_full_avg300
psi_io_some_avg10 psi_io_some_avg60 psi_io_some_avg300
psi_io_full_avg10 psi_io_full_avg60 psi_io_full_avg300
tcp_established tcp_time_wait tcp_orphan tcp_allocated
context_switches_sec forks_sec procs_running procs_blocked
oom_kills fd_allocated fd_max
interrupts_sec softirq_net_rx_sec softirq_block_sec tasks_running tasks_total
mem_buffers mem_cached mem_dirty mem_writeback mem_shmem
mem_slab_reclaimable mem_slab_unreclaim mem_committed_as mem_commit_limit mem_hw_corrupted
swap_in_sec swap_out_sec pgmajfault_sec pgpgin_sec pgpgout_sec
psi_cpu_some_total_delta psi_mem_some_total_delta psi_mem_full_total_delta
psi_io_some_total_delta psi_io_full_total_delta
tcp_mem_pages sockets_used udp_inuse udp_mem_pages
snmp_retrans_segs_sec snmp_active_opens_sec snmp_passive_opens_sec
snmp_attempt_fails_delta snmp_estab_resets_delta snmp_in_errs_delta snmp_out_rsts_delta
snmp_udp_rcvbuf_errors_delta snmp_udp_sndbuf_errors_delta snmp_udp_in_errors_delta
netstat_listen_overflows_delta netstat_listen_drops_delta netstat_tcp_timeouts_delta
netstat_tcp_syn_retrans_delta netstat_tcp_fast_retrans_delta netstat_tcp_ofo_queue_delta
netstat_tcp_abort_on_memory_delta netstat_syncookies_sent_delta
softnet_processed_delta softnet_dropped_delta softnet_time_squeeze_delta
conntrack_count conntrack_max`.split(/\s+/);

// Mirrors the worker's EXT_KEY_MAP: only signals the hourly API actually
// returned are rebuilt into ext_json. Max variants that the API never exposed
// stay absent/NULL.
const HOURLY_EXT_FIELDS = [
	["interrupts_sec_avg", "interrupts_sec"],
	["softirq_net_rx_sec_avg", "softirq_net_rx_sec"],
	["softirq_block_sec_avg", "softirq_block_sec"],
	["tasks_running_avg", "tasks_running"],
	["tasks_total_avg", "tasks_total"],
	["mem_buffers_avg", "mem_buffers"],
	["mem_cached_avg", "mem_cached"],
	["mem_dirty_avg", "mem_dirty"],
	["mem_writeback_avg", "mem_writeback"],
	["mem_shmem_avg", "mem_shmem"],
	["mem_slab_reclaimable_avg", "mem_slab_reclaimable"],
	["mem_slab_unreclaim_avg", "mem_slab_unreclaim"],
	["mem_committed_as_avg", "mem_committed_as"],
	["mem_commit_limit", "mem_commit_limit"],
	["mem_hw_corrupted_max", "mem_hw_corrupted"],
	["swap_in_sec_avg", "swap_in_sec"],
	["swap_out_sec_avg", "swap_out_sec"],
	["pgmajfault_sec_avg", "pgmajfault_sec"],
	["pgpgin_sec_avg", "pgpgin_sec"],
	["pgpgout_sec_avg", "pgpgout_sec"],
	["psi_cpu_some_total_delta_sum", "psi_cpu_some_total_delta"],
	["psi_mem_some_total_delta_sum", "psi_mem_some_total_delta"],
	["psi_mem_full_total_delta_sum", "psi_mem_full_total_delta"],
	["psi_io_some_total_delta_sum", "psi_io_some_total_delta"],
	["psi_io_full_total_delta_sum", "psi_io_full_total_delta"],
	["tcp_mem_pages_avg", "tcp_mem_pages"],
	["sockets_used_avg", "sockets_used"],
	["udp_inuse_avg", "udp_inuse"],
	["udp_mem_pages_avg", "udp_mem_pages"],
	["snmp_retrans_segs_sec_avg", "snmp_retrans_segs_sec"],
	["snmp_active_opens_sec_avg", "snmp_active_opens_sec"],
	["snmp_passive_opens_sec_avg", "snmp_passive_opens_sec"],
	["snmp_attempt_fails_delta_sum", "snmp_attempt_fails_delta"],
	["snmp_estab_resets_delta_sum", "snmp_estab_resets_delta"],
	["snmp_in_errs_delta_sum", "snmp_in_errs_delta"],
	["snmp_out_rsts_delta_sum", "snmp_out_rsts_delta"],
	["snmp_udp_rcvbuf_errors_delta_sum", "snmp_udp_rcvbuf_errors_delta"],
	["snmp_udp_sndbuf_errors_delta_sum", "snmp_udp_sndbuf_errors_delta"],
	["snmp_udp_in_errors_delta_sum", "snmp_udp_in_errors_delta"],
	["netstat_listen_overflows_delta_sum", "netstat_listen_overflows_delta"],
	["netstat_listen_drops_delta_sum", "netstat_listen_drops_delta"],
	["netstat_tcp_timeouts_delta_sum", "netstat_tcp_timeouts_delta"],
	["netstat_tcp_syn_retrans_delta_sum", "netstat_tcp_syn_retrans_delta"],
	["netstat_tcp_fast_retrans_delta_sum", "netstat_tcp_fast_retrans_delta"],
	["netstat_tcp_ofo_queue_delta_sum", "netstat_tcp_ofo_queue_delta"],
	["netstat_tcp_abort_on_memory_delta_sum", "netstat_tcp_abort_on_memory_delta"],
	["netstat_syncookies_sent_delta_sum", "netstat_syncookies_sent_delta"],
	["softnet_processed_delta_sum", "softnet_processed_delta"],
	["softnet_dropped_delta_sum", "softnet_dropped_delta"],
	["softnet_time_squeeze_delta_sum", "softnet_time_squeeze_delta"],
	["conntrack_count_avg", "conntrack_count"],
	["conntrack_max", "conntrack_max"],
];

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const ageToEpoch = (anchor, value) => (Number.isInteger(value) ? anchor - value : null);

function assertRecord(name, value) {
	if (!isRecord(value)) throw new Error(`recording.${name} must be an object`);
	return value;
}

function assertList(name, value, minimum = 1) {
	if (!Array.isArray(value) || value.length < minimum)
		throw new Error(`recording.${name} must contain at least ${minimum} entries`);
	return value;
}

function assertAge(name, value) {
	if (!Number.isInteger(value))
		throw new Error(`recording.${name} must be an integer age in seconds`);
}

function validateRecording(recording) {
	if (!isRecord(recording)) throw new Error("recording must be an object");
	if (recording.schema_version !== 1) throw new Error("recording.schema_version must be 1");
	const server = assertRecord("server", recording.server);
	assertRecord("server.detail", server.detail);
	assertList("server.raw.data", assertRecord("server.raw", server.raw).data);
	assertList("server.hourly.data", assertRecord("server.hourly", server.hourly).data);
	assertRecord("server.tier2", server.tier2);
	const workstation = assertRecord("workstation", recording.workstation);
	const detail = assertRecord("workstation.detail", workstation.detail);
	const latest = assertRecord("workstation.detail.latest_report", detail.latest_report);
	for (const field of [
		"received_at_age_seconds",
		"started_at_age_seconds",
		"finished_at_age_seconds",
	])
		assertAge(`workstation.detail.latest_report.${field}`, latest[field]);
	assertList(
		"workstation.metrics.data",
		assertRecord("workstation.metrics", workstation.metrics).data,
	);
	const connectivity = assertRecord("workstation.connectivity", workstation.connectivity);
	assertList("workstation.connectivity.targets", connectivity.targets, SERVER_ALIASES.length);
	const targets = assertList("targets", recording.targets, SERVER_ALIASES.length);
	const expected = new Set(SERVER_ALIASES.map((alias) => alias.server_id));
	const seen = new Set();
	for (const target of targets) {
		if (!isRecord(target) || !expected.has(target.server_id))
			throw new Error("recording.targets must cover server-01..server-08");
		if (seen.has(target.server_id)) throw new Error("recording.targets has duplicate server ids");
		seen.add(target.server_id);
		if (typeof target.address !== "string" || !isIP(target.address))
			throw new Error(`recording target ${target.server_id} needs a usable address`);
		if (target.family !== 4 && target.family !== 6)
			throw new Error(`recording target ${target.server_id} needs family 4 or 6`);
	}
	if (seen.size !== SERVER_ALIASES.length)
		throw new Error("recording.targets must cover every host alias");
}

let cached;
export function readRecordedRecording() {
	cached ??= JSON.parse(readFileSync(recordedFixturePath, "utf8"));
	return cached;
}

const jsonValue = (value) => ({ json: value });
const sqlText = (value) => `'${String(value).replaceAll("'", "''")}'`;
const sqlJson = (value) => sqlText(JSON.stringify(value));
const sqlValue = (value) => {
	if (value === null || value === undefined) return "NULL";
	if (isRecord(value) && "json" in value)
		return value.json === null || value.json === undefined ? "NULL" : sqlJson(value.json);
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error("Non-finite fixture value");
		return String(value);
	}
	if (typeof value === "boolean") return value ? "1" : "0";
	return sqlText(value);
};
const insert = (table, columns, values) =>
	`INSERT INTO ${table}(${columns.join(",")}) VALUES (${values.map(sqlValue).join(",")});`;

function aliasMac(mac, aliasIndex) {
	const match = /^02:00:00:00:00:([0-9a-f]{2})$/.exec(mac ?? "");
	if (!match) return mac ?? null;
	const last = (Number.parseInt(match[1], 16) + aliasIndex) % 256;
	return `02:00:00:00:00:${last.toString(16).padStart(2, "0")}`;
}

// The longest possible IPv6 literal (eight full groups). The first alias carries
// it so the dashboard's abbreviation path is exercised by the demo catalog, not
// only by tests; it is a documentation address like the rest of the fixture.
const LONG_IPV6 = "2001:db8:85a3:8d3:1319:8a2e:370:7348";

function aliasInterfaces(detail, aliasIndex, publicIp) {
	let ipv6Index = 0;
	let publicAssigned = false;
	let longAssigned = false;
	return (detail.net_interfaces ?? []).map((entry) => {
		const loopback = entry.iface === "lo";
		const ipv4 = loopback ? (entry.ipv4 ?? []) : publicAssigned ? [] : [publicIp];
		if (!loopback) publicAssigned = true;
		const ipv6 = loopback
			? (entry.ipv6 ?? [])
			: (entry.ipv6 ?? []).map(
					() => `2001:db8:${(aliasIndex + 1).toString(16)}::${(++ipv6Index).toString(16)}`,
				);
		if (aliasIndex === 0 && !loopback && !longAssigned && ipv6.length > 0) {
			ipv6.push(LONG_IPV6);
			longAssigned = true;
		}
		return {
			iface: entry.iface,
			mac: aliasMac(entry.mac, aliasIndex),
			ipv4,
			ipv6,
			speed_mbps: entry.speed_mbps,
		};
	});
}

const padDate = (value) => String(value).padStart(2, "0");

/**
 * The calendar day `days` away from the anchor, in the machine's own time
 * zone. The demo dashboard reads "today" from the same clock, so the
 * countdown of a seeded host matches what the reviewer sees.
 */
export function calendarDateFromAnchor(anchor, days) {
	const local = new Date(anchor * 1000);
	const midnight = Date.UTC(local.getFullYear(), local.getMonth(), local.getDate());
	const shifted = new Date(midnight + days * 86400000);
	return `${shifted.getUTCFullYear()}-${padDate(shifted.getUTCMonth() + 1)}-${padDate(
		shifted.getUTCDate(),
	)}`;
}

/** The billing triple of one alias, or nulls when the alias has no billing. */
function aliasBilling(alias, anchor) {
	const billing = BILLING_BY_HOST[alias.host_id];
	if (!billing) return { cost_amount_cny: null, paid_at: null, renews_at: null };
	return {
		cost_amount_cny: billing.amount,
		paid_at: calendarDateFromAnchor(anchor, billing.paidOffsetDays),
		renews_at: calendarDateFromAnchor(anchor, billing.renewsOffsetDays),
	};
}

function hostInsert(recording, alias, aliasIndex, target, anchor) {
	const detail = recording.server.detail;
	const lastSeen = ageToEpoch(anchor, detail.last_seen_age_seconds);
	const billing = aliasBilling(alias, anchor);
	return insert(
		"hosts",
		[
			"host_id",
			"hostname",
			"os",
			"kernel",
			"arch",
			"cpu_model",
			"boot_time",
			"last_seen",
			"identity_updated_at",
			"is_active",
			"created_at",
			"cpu_logical",
			"cpu_physical",
			"mem_total_bytes",
			"swap_total_bytes",
			"virtualization",
			"net_interfaces",
			"disks",
			"boot_mode",
			"timezone",
			"dns_resolvers",
			"dns_search",
			"public_ip",
			"public_ip_v4",
			"public_ip_v6",
			"probe_version",
			"description",
			"top_processes_json",
			"top_processes_ts",
			"cost_amount_cny",
			"paid_at",
			"renews_at",
		],
		[
			alias.host_id,
			alias.hostname,
			detail.os,
			detail.kernel,
			detail.arch,
			detail.cpu_model,
			ageToEpoch(anchor, detail.boot_time_age_seconds),
			lastSeen,
			lastSeen,
			1,
			anchor - 30 * 86400,
			detail.cpu_logical,
			detail.cpu_physical,
			detail.mem_total_bytes,
			detail.swap_total_bytes,
			detail.virtualization,
			jsonValue(aliasInterfaces(detail, aliasIndex, target.address)),
			jsonValue(detail.disks ?? []),
			detail.boot_mode,
			detail.timezone,
			jsonValue(detail.dns_resolvers),
			jsonValue(detail.dns_search),
			target.address,
			target.address,
			aliasIndex === 0 ? LONG_IPV6 : (detail.public_ip_v6 ?? null),
			detail.probe_version,
			DESCRIPTIONS_BY_HOST[alias.host_id] ?? null,
			jsonValue(detail.top_processes ?? []),
			ageToEpoch(anchor, detail.top_processes_age_seconds),
			billing.cost_amount_cny,
			billing.paid_at,
			billing.renews_at,
		],
	);
}

function rawInsert(alias, point, anchor, aliasIndex) {
	const columns = ["host_id", "ts", ...RAW_SCALARS, "disk_json", "net_json", "disk_io_json"];
	return insert("metrics_raw", columns, [
		alias.host_id,
		ageToEpoch(anchor, point.age_seconds),
		...RAW_SCALARS.map((column) => point[column] ?? null),
		jsonValue(aliasDiskPayload(point.disk, aliasIndex)),
		jsonValue(point.net ?? []),
		jsonValue(point.disk_io ?? []),
	]);
}

function hourlyExtJson(point) {
	const ext = Object.fromEntries(
		HOURLY_EXT_FIELDS.map(([extKey, field]) => [extKey, point[field] ?? null]),
	);
	return Object.values(ext).every((value) => value === null) ? null : jsonValue(ext);
}

function hourlyInsert(alias, point, anchor, aliasIndex) {
	const fields = [
		["host_id", alias.host_id],
		["hour_ts", ageToEpoch(anchor, point.age_seconds)],
		["sample_count", point.sample_count ?? null],
		["cpu_usage_avg", point.cpu_usage_pct ?? null],
		["cpu_usage_max", null],
		["cpu_iowait_avg", point.cpu_iowait ?? null],
		["cpu_steal_avg", point.cpu_steal ?? null],
		["cpu_load1_avg", point.cpu_load1 ?? null],
		["cpu_load5_avg", point.cpu_load5 ?? null],
		["cpu_load15_avg", point.cpu_load15 ?? null],
		["mem_total", point.mem_total ?? null],
		["mem_available_min", point.mem_available ?? null],
		["mem_used_pct_avg", point.mem_used_pct ?? null],
		["mem_used_pct_max", null],
		["swap_total", point.swap_total ?? null],
		["swap_used_max", point.swap_used ?? null],
		["swap_used_pct_avg", point.swap_used_pct ?? null],
		["swap_used_pct_max", null],
		["uptime_min", point.uptime_seconds ?? null],
		["disk_json", jsonValue(aliasDiskPayload(point.disk, aliasIndex))],
		["net_rx_bytes_avg", point.net_rx_bytes_avg ?? null],
		["net_rx_bytes_max", point.net_rx_bytes_max ?? null],
		["net_tx_bytes_avg", point.net_tx_bytes_avg ?? null],
		["net_tx_bytes_max", point.net_tx_bytes_max ?? null],
		["net_rx_errors", point.net_rx_errors ?? null],
		["net_tx_errors", point.net_tx_errors ?? null],
		["psi_cpu_some_avg10_avg", point.psi_cpu_some_avg10 ?? null],
		["psi_cpu_some_avg10_max", null],
		["psi_cpu_some_avg60_avg", point.psi_cpu_some_avg60 ?? null],
		["psi_cpu_some_avg60_max", null],
		["psi_mem_some_avg60_avg", point.psi_mem_some_avg60 ?? null],
		["psi_mem_some_avg60_max", null],
		["psi_mem_full_avg60_avg", point.psi_mem_full_avg60 ?? null],
		["psi_mem_full_avg60_max", null],
		["psi_io_some_avg60_avg", point.psi_io_some_avg60 ?? null],
		["psi_io_some_avg60_max", null],
		["psi_io_full_avg60_avg", point.psi_io_full_avg60 ?? null],
		["psi_io_full_avg60_max", null],
		// The sanitized hourly disk_io shape only retains empty device rows;
		// the aggregate values are not recoverable, so leave the column NULL.
		["disk_io_json", null],
		["tcp_established_avg", point.tcp_established ?? null],
		["tcp_established_max", null],
		["tcp_time_wait_avg", point.tcp_time_wait ?? null],
		["tcp_time_wait_max", null],
		["tcp_orphan_avg", point.tcp_orphan ?? null],
		["tcp_orphan_max", null],
		["tcp_allocated_avg", point.tcp_allocated ?? null],
		["tcp_allocated_max", null],
		["context_switches_sec_avg", point.context_switches_sec ?? null],
		["context_switches_sec_max", null],
		["forks_sec_avg", point.forks_sec ?? null],
		["forks_sec_max", null],
		["procs_running_avg", point.procs_running ?? null],
		["procs_running_max", null],
		["procs_blocked_avg", point.procs_blocked ?? null],
		["procs_blocked_max", null],
		["oom_kills_sum", point.oom_kills ?? null],
		["fd_allocated_avg", point.fd_allocated ?? null],
		["fd_allocated_max", null],
		["fd_max", point.fd_max ?? null],
		["ext_json", hourlyExtJson(point)],
	];
	return insert(
		"metrics_hourly",
		fields.map(([column]) => column),
		fields.map(([, value]) => value),
	);
}

function rebaseDocker(docker, anchor) {
	if (!isRecord(docker) || !Array.isArray(docker.containers)) return docker;
	return {
		...docker,
		containers: docker.containers.map((container) => {
			if (!isRecord(container)) return container;
			const { started_at_age_seconds, ...rest } = container;
			return started_at_age_seconds === undefined
				? rest
				: { ...rest, started_at: ageToEpoch(anchor, started_at_age_seconds) };
		}),
	};
}

function tier2Insert(alias, recording, anchor) {
	const tier2 = recording.server.tier2;
	const section = (value) => (value === null || value === undefined ? null : jsonValue(value));
	return insert(
		"tier2_snapshots",
		[
			"host_id",
			"ts",
			"ports_json",
			"systemd_json",
			"security_json",
			"docker_json",
			"disk_deep_json",
			"software_json",
			"websites_json",
		],
		[
			alias.host_id,
			ageToEpoch(anchor, tier2.age_seconds),
			section(tier2.ports),
			section(tier2.systemd),
			section(tier2.security),
			section(rebaseDocker(tier2.docker, anchor)),
			section(tier2.disk_deep),
			section(tier2.software),
			section(tier2.websites),
		],
	);
}

function portInserts(recording, anchor) {
	const ports = recording.server.allowed_ports ?? [];
	const statements = [];
	for (const alias of SERVER_ALIASES) {
		for (const port of ports) {
			statements.push(
				insert(
					"port_allowlist",
					["host_id", "port", "reason", "created_at"],
					[alias.host_id, port.port, port.reason, ageToEpoch(anchor, port.created_at_age_seconds)],
				),
			);
		}
	}
	return statements;
}

/** The demo tag catalog plus the per-host assignments. */
function tagStatements() {
	const names = Object.keys(TAG_COLORS);
	const statements = names.map((name, index) =>
		insert("tags", ["id", "name", "color"], [index + 1, name, TAG_COLORS[name]]),
	);
	for (const alias of SERVER_ALIASES) {
		for (const name of TAGS_BY_HOST[alias.host_id] ?? []) {
			const id = names.indexOf(name) + 1;
			if (id < 1) throw new Error(`Unknown demo tag ${name}`);
			statements.push(insert("host_tags", ["host_id", "tag_id"], [alias.host_id, id]));
		}
	}
	return statements;
}

function reportPayload(report, connectivity, anchor) {
	return {
		report_id: report.report_id,
		started_at: ageToEpoch(anchor, report.started_at_age_seconds),
		finished_at: ageToEpoch(anchor, report.finished_at_age_seconds),
		sample_window_ms: report.sample_window_ms,
		cli_version: report.cli_version,
		hostname: report.hostname,
		os: report.os,
		arch: report.arch,
		uptime_seconds: report.uptime_seconds,
		cpu: report.cpu,
		mem: report.mem,
		disk: report.disk,
		network: report.network,
		connectivity,
		collection_errors: report.collection_errors ?? [],
		targets_error: report.targets_error ?? null,
	};
}

// Rebuild a three-packet tuple from the aggregates the older history API keeps.
// Packet order is unknown; only the reported count, status, minimum, maximum and
// mean are preserved (clamping only guards floating-point drift).
export function reconstructRtts({ received, avg, min, max }) {
	const count = Number.isInteger(received) ? received : 0;
	if (count <= 0 || avg === null || avg === undefined) return [null, null, null];
	if (count === 1) return [avg, null, null];
	if (min === null || min === undefined || max === null || max === undefined)
		return [avg, null, null];
	if (count === 2) return [min, Math.max(0, 2 * avg - min), null];
	const third = count * avg - min - max;
	return [min, max, Math.max(0, third)];
}

function workstationStatements(recording, anchor) {
	const workstation = recording.workstation.detail;
	const workstationId = workstation.id;
	if (typeof workstationId !== "string" || workstationId === "")
		throw new Error("recording.workstation.detail.id is required");
	const latest = workstation.latest_report;
	const targets = new Map(recording.targets.map((target) => [target.server_id, target]));
	const aliases = new Map(SERVER_ALIASES.map((alias) => [alias.server_id, alias]));
	const aliasFor = (serverId) => {
		const alias = aliases.get(serverId);
		if (!alias) throw new Error(`Unmapped workstation server id ${serverId}`);
		return alias;
	};
	const latestEntries = new Map();
	for (const entry of latest.connectivity ?? []) {
		if (!Array.isArray(entry.rtts_ms) || entry.rtts_ms.length !== 3)
			throw new Error("Latest report connectivity needs three captured RTT values");
		latestEntries.set(entry.server_id, entry);
	}
	for (const alias of SERVER_ALIASES)
		if (!latestEntries.has(alias.server_id))
			throw new Error(`Latest report is missing ${alias.server_id}`);
	const reportConnectivity = (serverId, rtts, source) => ({
		server_id: aliasFor(serverId).host_id,
		address: targets.get(serverId).address,
		family: targets.get(serverId).family,
		sent: source.sent,
		received: source.received,
		rtts_ms: rtts,
		status: source.status,
	});

	const statements = [];
	const hash = createHash("sha256")
		.update(`${WORKSTATION_TOKEN_PREFIX}:${workstationId}`)
		.digest("hex");
	statements.push(
		insert(
			"workstations",
			[
				"id",
				"owner",
				"installation_id",
				"name",
				"created_at",
				"last_seen_at",
				"public_ip",
				"disabled",
				"token_hash",
				"token_prefix",
				"version",
				"rotated_at",
			],
			[
				workstationId,
				workstation.owner,
				WORKSTATION_INSTALLATION_ID,
				workstation.name,
				ageToEpoch(anchor, workstation.created_at_age_seconds),
				ageToEpoch(anchor, workstation.last_seen_at_age_seconds),
				workstation.public_ip,
				workstation.disabled ? 1 : 0,
				hash,
				WORKSTATION_TOKEN_PREFIX,
				1,
				null,
			],
		),
	);

	const points = [...recording.workstation.metrics.data].sort(
		(a, b) => b.received_at_age_seconds - a.received_at_age_seconds,
	);
	for (const point of points) {
		const isLatest = point.received_at_age_seconds === latest.received_at_age_seconds;
		const reportId = isLatest
			? latest.report_id
			: `20000000-0000-4000-8000-${String(point.received_at_age_seconds).padStart(12, "0")}`;
		const receivedAt = ageToEpoch(anchor, point.received_at_age_seconds);
		const connectivity = [];
		const connectivityStatements = [];
		for (const alias of SERVER_ALIASES) {
			const history = recording.workstation.connectivity.targets.find(
				(target) => target.server_id === alias.server_id,
			);
			const sample = history?.data?.find(
				(entry) => entry.received_at_age_seconds === point.received_at_age_seconds,
			);
			if (!sample) throw new Error(`Missing connectivity history for ${alias.server_id}`);
			const captured = isLatest ? latestEntries.get(alias.server_id) : null;
			const source = captured ?? {
				sent: 3,
				received: sample.received,
				status: sample.status,
			};
			const rtts = captured
				? captured.rtts_ms
				: reconstructRtts({
						received: sample.received,
						avg: sample.rtt_avg_ms,
						min: sample.rtt_min_ms,
						max: sample.rtt_max_ms,
					});
			connectivity.push(reportConnectivity(alias.server_id, rtts, source));
			connectivityStatements.push(
				insert(
					"workstation_connectivity",
					[
						"workstation_id",
						"report_id",
						"received_at",
						"server_id",
						"address",
						"family",
						"sent",
						"received",
						"rtts",
						"status",
					],
					[
						workstationId,
						reportId,
						receivedAt,
						alias.host_id,
						targets.get(alias.server_id).address,
						targets.get(alias.server_id).family,
						source.sent,
						source.received,
						jsonValue(rtts),
						source.status,
					],
				),
			);
		}
		const payload = isLatest
			? reportPayload(latest, connectivity, anchor)
			: reportPayload(
					{
						...latest,
						report_id: reportId,
						started_at_age_seconds: point.started_at_age_seconds,
						finished_at_age_seconds: point.finished_at_age_seconds,
						cpu: { ...latest.cpu, usage_pct: point.cpu_usage_pct },
						mem: {
							...latest.mem,
							used_pct: point.mem_used_pct,
							total_bytes: point.mem_total_bytes,
							available_bytes: point.mem_available_bytes,
						},
						uptime_seconds: point.uptime_seconds,
						disk: [],
						network: { interfaces: [] },
						collection_errors: [],
						targets_error: null,
					},
					connectivity,
					anchor,
				);
		statements.push(
			insert(
				"workstation_reports",
				[
					"workstation_id",
					"report_id",
					"body_hash",
					"received_at",
					"started_at",
					"finished_at",
					"cpu_usage_pct",
					"mem_used_pct",
					"mem_total_bytes",
					"mem_available_bytes",
					"uptime_seconds",
					"payload",
					"insert_nonce",
				],
				[
					workstationId,
					reportId,
					createHash("sha256").update(`${workstationId}:${reportId}`).digest("hex"),
					receivedAt,
					ageToEpoch(anchor, point.started_at_age_seconds),
					ageToEpoch(anchor, point.finished_at_age_seconds),
					point.cpu_usage_pct,
					point.mem_used_pct,
					point.mem_total_bytes,
					point.mem_available_bytes,
					point.uptime_seconds,
					jsonValue(payload),
					null,
				],
			),
		);
		statements.push(...connectivityStatements);
	}
	return statements;
}

export function recordedDemoSql(recording, anchor) {
	validateRecording(recording);
	if (!Number.isInteger(anchor) || anchor <= 0) throw new Error("anchor must be epoch seconds");
	const targets = new Map(recording.targets.map((target) => [target.server_id, target]));
	const statements = [];
	for (const [index, alias] of SERVER_ALIASES.entries()) {
		const target = targets.get(alias.server_id);
		statements.push(hostInsert(recording, alias, index, target, anchor));
		for (const point of recording.server.raw.data)
			statements.push(rawInsert(alias, point, anchor, index));
		for (const point of recording.server.hourly.data)
			statements.push(hourlyInsert(alias, point, anchor, index));
		statements.push(tier2Insert(alias, recording, anchor));
	}
	statements.push(...portInserts(recording, anchor));
	statements.push(...tagStatements());
	statements.push(...workstationStatements(recording, anchor));
	return statements.join("\n");
}
