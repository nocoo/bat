// Alert evaluation service — evaluates Tier 1/3/signal expansion rules on each ingest
// Source of truth: docs/03-data-structures.md § Alert Rules
// Source of truth: docs/05-worker.md § Alert Evaluation

import {
	ALERT_THRESHOLDS,
	SIGNAL_EXPANSION_THRESHOLDS,
	TIER2_THRESHOLDS,
	TIER3_THRESHOLDS,
} from "@bat/shared";
import type { DiskIoMetric, DiskMetric, MetricsPayload } from "@bat/shared";

type AlertSeverity = "info" | "warning" | "critical";

interface AlertEvalResult {
	ruleId: string;
	fired: boolean;
	severity: AlertSeverity;
	value: number;
	message: string;
	durationSeconds: number; // 0 = instant
}

/**
 * Evaluate all ingest-time alert rules against a metrics payload.
 * Returns evaluation results for each rule (fired or not).
 * host_offline is NOT evaluated here — it's query-time only.
 */
function evaluateRules(payload: MetricsPayload): AlertEvalResult[] {
	const results: AlertEvalResult[] = [];

	// mem_high: mem > 85% AND swap > 50% → critical, instant
	results.push({
		ruleId: "mem_high",
		fired:
			payload.mem.used_pct > ALERT_THRESHOLDS.MEM_HIGH_PCT &&
			payload.swap.used_pct > ALERT_THRESHOLDS.MEM_HIGH_SWAP_PCT,
		severity: "critical",
		value: payload.mem.used_pct,
		message: `Memory ${payload.mem.used_pct.toFixed(1)}% + Swap ${payload.swap.used_pct.toFixed(1)}%`,
		durationSeconds: 0,
	});

	// no_swap: swap == 0 AND mem > 70% → critical, instant
	results.push({
		ruleId: "no_swap",
		fired:
			payload.swap.total_bytes === 0 && payload.mem.used_pct > ALERT_THRESHOLDS.NO_SWAP_MEM_PCT,
		severity: "critical",
		value: payload.mem.used_pct,
		message: `No swap configured, memory at ${payload.mem.used_pct.toFixed(1)}%`,
		durationSeconds: 0,
	});

	// disk_full: any mount > 85% → critical, instant
	for (const disk of payload.disk) {
		if (disk.used_pct > ALERT_THRESHOLDS.DISK_FULL_PCT) {
			results.push({
				ruleId: "disk_full",
				fired: true,
				severity: "critical",
				value: disk.used_pct,
				message: `Disk ${disk.mount} at ${disk.used_pct.toFixed(1)}%`,
				durationSeconds: 0,
			});
			break; // Only one disk_full alert per host
		}
	}
	// If no disk exceeded threshold, push a "not fired" result
	if (!results.some((r) => r.ruleId === "disk_full")) {
		results.push({
			ruleId: "disk_full",
			fired: false,
			severity: "critical",
			value: Math.max(0, ...payload.disk.map((d) => d.used_pct)),
			message: "",
			durationSeconds: 0,
		});
	}

	// iowait_high: iowait > 20% → warning, 5 min duration
	results.push({
		ruleId: "iowait_high",
		fired: payload.cpu.iowait_pct > ALERT_THRESHOLDS.IOWAIT_HIGH_PCT,
		severity: "warning",
		value: payload.cpu.iowait_pct,
		message: `IO wait at ${payload.cpu.iowait_pct.toFixed(1)}%`,
		durationSeconds: ALERT_THRESHOLDS.IOWAIT_DURATION_SECONDS,
	});

	// steal_high: steal > 10% → warning, 5 min duration
	results.push({
		ruleId: "steal_high",
		fired: payload.cpu.steal_pct > ALERT_THRESHOLDS.STEAL_HIGH_PCT,
		severity: "warning",
		value: payload.cpu.steal_pct,
		message: `CPU steal at ${payload.cpu.steal_pct.toFixed(1)}%`,
		durationSeconds: ALERT_THRESHOLDS.STEAL_DURATION_SECONDS,
	});

	// uptime_anomaly: uptime < 300s → info, instant (detects unexpected reboots)
	results.push({
		ruleId: "uptime_anomaly",
		fired: payload.uptime_seconds < TIER2_THRESHOLDS.UPTIME_ANOMALY_SECONDS,
		severity: "info",
		value: payload.uptime_seconds,
		message:
			payload.uptime_seconds < TIER2_THRESHOLDS.UPTIME_ANOMALY_SECONDS
				? `Host recently rebooted (uptime ${payload.uptime_seconds}s)`
				: "",
		durationSeconds: 0,
	});

	// --- Tier 3 rules ---

	// cpu_pressure: PSI cpu_some_avg60 > 25% → warning, 5 min duration
	const cpuPsi = payload.psi?.cpu_some_avg60;
	if (cpuPsi != null) {
		results.push({
			ruleId: "cpu_pressure",
			fired: cpuPsi > TIER3_THRESHOLDS.PSI_CPU_PCT,
			severity: "warning",
			value: cpuPsi,
			message: cpuPsi > TIER3_THRESHOLDS.PSI_CPU_PCT ? `CPU pressure ${cpuPsi.toFixed(1)}%` : "",
			durationSeconds: TIER3_THRESHOLDS.PSI_DURATION_SECONDS,
		});
	}

	// mem_pressure: PSI mem_some_avg60 > 10% → warning, 5 min duration
	const memPsi = payload.psi?.mem_some_avg60;
	if (memPsi != null) {
		results.push({
			ruleId: "mem_pressure",
			fired: memPsi > TIER3_THRESHOLDS.PSI_MEM_PCT,
			severity: "warning",
			value: memPsi,
			message: memPsi > TIER3_THRESHOLDS.PSI_MEM_PCT ? `Memory pressure ${memPsi.toFixed(1)}%` : "",
			durationSeconds: TIER3_THRESHOLDS.PSI_DURATION_SECONDS,
		});
	}

	// io_pressure: PSI io_some_avg60 > 20% → warning, 5 min duration
	const ioPsi = payload.psi?.io_some_avg60;
	if (ioPsi != null) {
		results.push({
			ruleId: "io_pressure",
			fired: ioPsi > TIER3_THRESHOLDS.PSI_IO_PCT,
			severity: "warning",
			value: ioPsi,
			message: ioPsi > TIER3_THRESHOLDS.PSI_IO_PCT ? `I/O pressure ${ioPsi.toFixed(1)}%` : "",
			durationSeconds: TIER3_THRESHOLDS.PSI_DURATION_SECONDS,
		});
	}

	// disk_io_saturated: ANY disk_io[].io_util_pct > 80% → warning, 5 min duration
	if (payload.disk_io && payload.disk_io.length > 0) {
		let saturatedDevice: DiskIoMetric | null = null;
		for (const device of payload.disk_io) {
			if (device.io_util_pct > TIER3_THRESHOLDS.DISK_IO_UTIL_PCT) {
				saturatedDevice = device;
				break;
			}
		}
		results.push({
			ruleId: "disk_io_saturated",
			fired: saturatedDevice !== null,
			severity: "warning",
			value:
				saturatedDevice?.io_util_pct ?? Math.max(0, ...payload.disk_io.map((d) => d.io_util_pct)),
			message: saturatedDevice
				? `Disk ${saturatedDevice.device} I/O utilization at ${saturatedDevice.io_util_pct.toFixed(1)}%`
				: "",
			durationSeconds: TIER3_THRESHOLDS.DISK_IO_DURATION_SECONDS,
		});
	}

	// tcp_conn_leak: tcp.time_wait > 500 → warning, 5 min duration
	if (payload.tcp != null) {
		results.push({
			ruleId: "tcp_conn_leak",
			fired: payload.tcp.time_wait > TIER3_THRESHOLDS.TCP_TIME_WAIT,
			severity: "warning",
			value: payload.tcp.time_wait,
			message:
				payload.tcp.time_wait > TIER3_THRESHOLDS.TCP_TIME_WAIT
					? `TCP TIME_WAIT at ${payload.tcp.time_wait}`
					: "",
			durationSeconds: TIER3_THRESHOLDS.TCP_DURATION_SECONDS,
		});
	}

	// oom_kill: oom_kills_delta > 0 → critical, instant
	if (payload.mem.oom_kills_delta != null) {
		results.push({
			ruleId: "oom_kill",
			fired: payload.mem.oom_kills_delta > 0,
			severity: "critical",
			value: payload.mem.oom_kills_delta,
			message:
				payload.mem.oom_kills_delta > 0
					? `${payload.mem.oom_kills_delta} OOM kill(s) detected`
					: "",
			durationSeconds: 0,
		});
	}

	// --- Signal expansion rules ---
	// All rules always emit a result (fired: false when data absent) so that
	// handleInstantRule / handleDurationRule can clear stale alerts if the
	// probe stops sending a field due to version drift or transient errors.

	// tcp_retrans_high: snmp.retrans_segs_sec > 10 → warning, 5 min duration
	{
		const val = payload.snmp?.retrans_segs_sec ?? null;
		results.push({
			ruleId: "tcp_retrans_high",
			fired: val != null && val > SIGNAL_EXPANSION_THRESHOLDS.TCP_RETRANS_SEC,
			severity: "warning",
			value: val ?? 0,
			message:
				val != null && val > SIGNAL_EXPANSION_THRESHOLDS.TCP_RETRANS_SEC
					? `TCP retransmissions at ${val.toFixed(1)}/s`
					: "",
			durationSeconds: SIGNAL_EXPANSION_THRESHOLDS.SIGNAL_EXPANSION_DURATION_SECONDS,
		});
	}

	// listen_drops: netstat.listen_drops_delta > 0 → critical, instant
	{
		const val = payload.netstat?.listen_drops_delta ?? null;
		results.push({
			ruleId: "listen_drops",
			fired: val != null && val > 0,
			severity: "critical",
			value: val ?? 0,
			message: val != null && val > 0 ? `${val} listen queue drop(s) detected` : "",
			durationSeconds: 0,
		});
	}

	// inode_full: any disk[].inodes_used_pct > 90 → critical, instant
	{
		let inodeFullDisk: DiskMetric | null = null;
		for (const disk of payload.disk) {
			if (
				disk.inodes_used_pct != null &&
				disk.inodes_used_pct > SIGNAL_EXPANSION_THRESHOLDS.INODE_FULL_PCT
			) {
				inodeFullDisk = disk;
				break;
			}
		}
		results.push({
			ruleId: "inode_full",
			fired: inodeFullDisk != null,
			severity: "critical",
			value:
				inodeFullDisk?.inodes_used_pct ??
				Math.max(0, ...payload.disk.map((d) => d.inodes_used_pct ?? 0)),
			message: inodeFullDisk
				? `Disk ${inodeFullDisk.mount} inode usage at ${inodeFullDisk.inodes_used_pct?.toFixed(1)}%`
				: "",
			durationSeconds: 0,
		});
	}

	// swap_active: swap_in_sec + swap_out_sec > 1 → warning, 5 min duration
	{
		const hasData = payload.mem.swap_in_sec != null && payload.mem.swap_out_sec != null;
		const swapRate = hasData ? (payload.mem.swap_in_sec ?? 0) + (payload.mem.swap_out_sec ?? 0) : 0;
		results.push({
			ruleId: "swap_active",
			fired: hasData && swapRate > SIGNAL_EXPANSION_THRESHOLDS.SWAP_ACTIVE_RATE,
			severity: "warning",
			value: swapRate,
			message:
				hasData && swapRate > SIGNAL_EXPANSION_THRESHOLDS.SWAP_ACTIVE_RATE
					? `Active swapping at ${swapRate.toFixed(1)} pages/s`
					: "",
			durationSeconds: SIGNAL_EXPANSION_THRESHOLDS.SIGNAL_EXPANSION_DURATION_SECONDS,
		});
	}

	// hw_corrupted: hw_corrupted > 0 → critical, instant
	{
		const val = payload.mem.hw_corrupted ?? null;
		results.push({
			ruleId: "hw_corrupted",
			fired: val != null && val > 0,
			severity: "critical",
			value: val ?? 0,
			message: val != null && val > 0 ? `Hardware memory corruption: ${val} bytes` : "",
			durationSeconds: 0,
		});
	}

	// overcommit_high: committed_as / commit_limit > 1.5 → warning, instant
	{
		const hasData = payload.mem.committed_as != null && payload.mem.commit_limit != null;
		const ratio =
			hasData && (payload.mem.commit_limit ?? 0) > 0
				? (payload.mem.committed_as ?? 0) / (payload.mem.commit_limit ?? 1)
				: 0;
		results.push({
			ruleId: "overcommit_high",
			fired: hasData && ratio > SIGNAL_EXPANSION_THRESHOLDS.OVERCOMMIT_RATIO,
			severity: "warning",
			value: ratio,
			message:
				hasData && ratio > SIGNAL_EXPANSION_THRESHOLDS.OVERCOMMIT_RATIO
					? `Memory overcommit ratio at ${ratio.toFixed(2)}`
					: "",
			durationSeconds: 0,
		});
	}

	// conntrack_full: conntrack.count / max > 0.8 → critical, instant
	{
		const hasData = payload.conntrack != null;
		const ratio =
			hasData && (payload.conntrack?.max ?? 0) > 0
				? (payload.conntrack?.count ?? 0) / (payload.conntrack?.max ?? 1)
				: 0;
		results.push({
			ruleId: "conntrack_full",
			fired: hasData && ratio > SIGNAL_EXPANSION_THRESHOLDS.CONNTRACK_FULL_RATIO,
			severity: "critical",
			value: ratio,
			message:
				hasData && ratio > SIGNAL_EXPANSION_THRESHOLDS.CONNTRACK_FULL_RATIO
					? `Conntrack table at ${(ratio * 100).toFixed(1)}% (${payload.conntrack?.count}/${payload.conntrack?.max})`
					: "",
			durationSeconds: 0,
		});
	}

	// softnet_drops: softnet.dropped_delta > 0 → warning, instant
	{
		const val = payload.softnet?.dropped_delta ?? null;
		results.push({
			ruleId: "softnet_drops",
			fired: val != null && val > 0,
			severity: "warning",
			value: val ?? 0,
			message: val != null && val > 0 ? `${val} softnet packet drop(s) detected` : "",
			durationSeconds: 0,
		});
	}

	// disk_latency_high: any disk_io[].read_await_ms > 100 || write_await_ms > 200
	// → warning, 5 min duration
	{
		let latencyDevice: DiskIoMetric | null = null;
		let latencyValue = 0;
		if (payload.disk_io) {
			for (const device of payload.disk_io) {
				if (
					(device.read_await_ms != null &&
						device.read_await_ms > SIGNAL_EXPANSION_THRESHOLDS.DISK_READ_AWAIT_MS) ||
					(device.write_await_ms != null &&
						device.write_await_ms > SIGNAL_EXPANSION_THRESHOLDS.DISK_WRITE_AWAIT_MS)
				) {
					latencyDevice = device;
					latencyValue = Math.max(device.read_await_ms ?? 0, device.write_await_ms ?? 0);
					break;
				}
			}
		}
		results.push({
			ruleId: "disk_latency_high",
			fired: latencyDevice !== null,
			severity: "warning",
			value: latencyDevice != null ? latencyValue : 0,
			message: latencyDevice
				? `Disk ${latencyDevice.device} latency ${latencyValue.toFixed(0)}ms`
				: "",
			durationSeconds: SIGNAL_EXPANSION_THRESHOLDS.SIGNAL_EXPANSION_DURATION_SECONDS,
		});
	}

	return results;
}

/**
 * Evaluate alerts and update alert_states / alert_pending tables.
 * Called from ingest route after metrics insertion.
 *
 * Optimized to use db.batch() for reduced D1 roundtrips:
 * - Batch 1: Instant rule writes + duration rule clears (no read needed)
 * - Batch 2: Bulk fetch all pending states for fired duration rules
 * - Batch 3: Duration rule writes based on fetched state
 */
export async function evaluateAlerts(
	db: D1Database,
	hostId: string,
	payload: MetricsPayload,
	now: number,
): Promise<void> {
	const results = evaluateRules(payload);

	// Collect statements by category
	const immediateWrites: D1PreparedStatement[] = [];
	const firedDurationRules: AlertEvalResult[] = [];

	for (const result of results) {
		if (result.durationSeconds === 0) {
			// Instant rule - no read needed, collect write statement
			if (result.fired) {
				immediateWrites.push(
					db
						.prepare(
							`INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id, rule_id) DO UPDATE SET
  severity = excluded.severity,
  value = excluded.value,
  triggered_at = excluded.triggered_at,
  message = excluded.message`,
						)
						.bind(hostId, result.ruleId, result.severity, result.value, now, result.message),
				);
			} else {
				immediateWrites.push(
					db
						.prepare("DELETE FROM alert_states WHERE host_id = ? AND rule_id = ?")
						.bind(hostId, result.ruleId),
				);
			}
		} else if (result.fired) {
			// Duration rule fired - needs pending state check
			firedDurationRules.push(result);
		} else {
			// Duration rule cleared - no read needed, delete from both tables
			immediateWrites.push(
				db
					.prepare("DELETE FROM alert_pending WHERE host_id = ? AND rule_id = ?")
					.bind(hostId, result.ruleId),
			);
			immediateWrites.push(
				db
					.prepare("DELETE FROM alert_states WHERE host_id = ? AND rule_id = ?")
					.bind(hostId, result.ruleId),
			);
		}
	}

	// Batch 1: Execute all immediate writes (instant rules + cleared duration rules)
	if (immediateWrites.length > 0) {
		await db.batch(immediateWrites);
	}

	// Batch 2 & 3: Handle fired duration rules
	if (firedDurationRules.length > 0) {
		// Bulk fetch all pending states for this host
		const pendingRows = await db
			.prepare("SELECT rule_id, first_seen FROM alert_pending WHERE host_id = ?")
			.bind(hostId)
			.all<{ rule_id: string; first_seen: number }>();

		const pendingMap = new Map(pendingRows.results?.map((r) => [r.rule_id, r.first_seen]) ?? []);

		// Collect duration rule writes
		const durationWrites: D1PreparedStatement[] = [];

		for (const result of firedDurationRules) {
			const firstSeen = pendingMap.get(result.ruleId);

			if (firstSeen != null) {
				// Already tracking - check if duration exceeded
				const elapsed = now - firstSeen;
				if (elapsed >= result.durationSeconds) {
					// Promote to alert_states
					durationWrites.push(
						db
							.prepare(
								`INSERT INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(host_id, rule_id) DO UPDATE SET
  severity = excluded.severity,
  value = excluded.value,
  triggered_at = excluded.triggered_at,
  message = excluded.message`,
							)
							.bind(hostId, result.ruleId, result.severity, result.value, now, result.message),
					);
				}
				// Update last_value in pending
				durationWrites.push(
					db
						.prepare("UPDATE alert_pending SET last_value = ? WHERE host_id = ? AND rule_id = ?")
						.bind(result.value, hostId, result.ruleId),
				);
			} else {
				// First time exceeding threshold - start tracking
				durationWrites.push(
					db
						.prepare(
							`INSERT INTO alert_pending (host_id, rule_id, first_seen, last_value)
VALUES (?, ?, ?, ?)`,
						)
						.bind(hostId, result.ruleId, now, result.value),
				);
			}
		}

		// Batch 3: Execute all duration rule writes
		if (durationWrites.length > 0) {
			await db.batch(durationWrites);
		}
	}
}

// Export for testing
export { evaluateRules };
export type { AlertEvalResult };
