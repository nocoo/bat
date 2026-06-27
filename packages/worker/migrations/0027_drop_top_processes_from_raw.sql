-- Rebuild metrics_raw without top_processes_json.
-- SQLite can't DROP COLUMN in 3.x and D1 doesn't expose VACUUM, so we
-- copy → drop → rename. This is the only way to actually shrink the
-- file: a naive UPDATE … SET top_processes_json = NULL leaves the
-- freelist holding the pages.
--
-- Backfill step (run BEFORE this migration deploys writes that target
-- hosts.top_processes_json): seed hosts.top_processes_json with each
-- host's most recent metrics_raw snapshot so the UI keeps showing
-- something until the next ingest refresh.
--
-- Two phases — both in this single migration so the migration runner
-- applies them atomically:
--   1. Seed hosts.top_processes_json from metrics_raw (latest row per host).
--   2. Rebuild metrics_raw without the column; preserve PK ids and the
--      unique (host_id, ts) index.

-- Phase 1: backfill
UPDATE hosts
SET top_processes_json = (
      SELECT mr.top_processes_json
      FROM metrics_raw mr
      WHERE mr.host_id = hosts.host_id
        AND mr.top_processes_json IS NOT NULL
      ORDER BY mr.ts DESC
      LIMIT 1
    ),
    top_processes_ts = (
      SELECT mr.ts
      FROM metrics_raw mr
      WHERE mr.host_id = hosts.host_id
        AND mr.top_processes_json IS NOT NULL
      ORDER BY mr.ts DESC
      LIMIT 1
    )
WHERE EXISTS (
  SELECT 1 FROM metrics_raw mr
  WHERE mr.host_id = hosts.host_id
    AND mr.top_processes_json IS NOT NULL
);

-- Phase 2: rebuild metrics_raw without the column.
-- FK from metrics_raw → hosts(host_id). hosts is the parent — no
-- dependent FK pointing INTO metrics_raw — so the drop is safe.
CREATE TABLE metrics_raw_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id         TEXT    NOT NULL,
  ts              INTEGER NOT NULL,
  cpu_load1       REAL,
  cpu_load5       REAL,
  cpu_load15      REAL,
  cpu_usage_pct   REAL,
  cpu_iowait      REAL,
  cpu_steal       REAL,
  cpu_count       INTEGER,
  mem_total       INTEGER,
  mem_available   INTEGER,
  mem_used_pct    REAL,
  swap_total      INTEGER,
  swap_used       INTEGER,
  swap_used_pct   REAL,
  disk_json       TEXT,
  net_json        TEXT,
  uptime_seconds  INTEGER,
  psi_cpu_some_avg10 REAL, psi_cpu_some_avg60 REAL, psi_cpu_some_avg300 REAL,
  psi_mem_some_avg10 REAL, psi_mem_some_avg60 REAL, psi_mem_some_avg300 REAL,
  psi_mem_full_avg10 REAL, psi_mem_full_avg60 REAL, psi_mem_full_avg300 REAL,
  psi_io_some_avg10 REAL, psi_io_some_avg60 REAL, psi_io_some_avg300 REAL,
  psi_io_full_avg10 REAL, psi_io_full_avg60 REAL, psi_io_full_avg300 REAL,
  disk_io_json TEXT,
  tcp_established INTEGER, tcp_time_wait INTEGER, tcp_orphan INTEGER, tcp_allocated INTEGER,
  context_switches_sec REAL, forks_sec REAL, procs_running INTEGER, procs_blocked INTEGER,
  oom_kills INTEGER, fd_allocated INTEGER, fd_max INTEGER,
  interrupts_sec REAL, softirq_net_rx_sec REAL, softirq_block_sec REAL,
  tasks_running INTEGER, tasks_total INTEGER,
  mem_buffers INTEGER, mem_cached INTEGER, mem_dirty INTEGER, mem_writeback INTEGER,
  mem_shmem INTEGER, mem_slab_reclaimable INTEGER, mem_slab_unreclaim INTEGER,
  mem_committed_as INTEGER, mem_commit_limit INTEGER, mem_hw_corrupted INTEGER,
  swap_in_sec REAL, swap_out_sec REAL, pgmajfault_sec REAL, pgpgin_sec REAL, pgpgout_sec REAL,
  psi_cpu_some_total_delta INTEGER, psi_mem_some_total_delta INTEGER, psi_mem_full_total_delta INTEGER,
  psi_io_some_total_delta INTEGER, psi_io_full_total_delta INTEGER,
  tcp_mem_pages INTEGER, sockets_used INTEGER, udp_inuse INTEGER, udp_mem_pages INTEGER,
  snmp_retrans_segs_sec REAL, snmp_active_opens_sec REAL, snmp_passive_opens_sec REAL,
  snmp_attempt_fails_delta INTEGER, snmp_estab_resets_delta INTEGER, snmp_in_errs_delta INTEGER,
  snmp_out_rsts_delta INTEGER, snmp_udp_rcvbuf_errors_delta INTEGER,
  snmp_udp_sndbuf_errors_delta INTEGER, snmp_udp_in_errors_delta INTEGER,
  netstat_listen_overflows_delta INTEGER, netstat_listen_drops_delta INTEGER,
  netstat_tcp_timeouts_delta INTEGER, netstat_tcp_syn_retrans_delta INTEGER,
  netstat_tcp_fast_retrans_delta INTEGER, netstat_tcp_ofo_queue_delta INTEGER,
  netstat_tcp_abort_on_memory_delta INTEGER, netstat_syncookies_sent_delta INTEGER,
  softnet_processed_delta INTEGER, softnet_dropped_delta INTEGER,
  softnet_time_squeeze_delta INTEGER,
  conntrack_count INTEGER, conntrack_max INTEGER,
  FOREIGN KEY (host_id) REFERENCES hosts(host_id)
);

INSERT INTO metrics_raw_new (
  id, host_id, ts,
  cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal, cpu_count,
  mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
  disk_json, net_json, uptime_seconds,
  psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
  psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
  psi_mem_full_avg10, psi_mem_full_avg60, psi_mem_full_avg300,
  psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
  psi_io_full_avg10, psi_io_full_avg60, psi_io_full_avg300,
  disk_io_json,
  tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated,
  context_switches_sec, forks_sec, procs_running, procs_blocked,
  oom_kills, fd_allocated, fd_max,
  interrupts_sec, softirq_net_rx_sec, softirq_block_sec, tasks_running, tasks_total,
  mem_buffers, mem_cached, mem_dirty, mem_writeback, mem_shmem,
  mem_slab_reclaimable, mem_slab_unreclaim, mem_committed_as, mem_commit_limit, mem_hw_corrupted,
  swap_in_sec, swap_out_sec, pgmajfault_sec, pgpgin_sec, pgpgout_sec,
  psi_cpu_some_total_delta, psi_mem_some_total_delta, psi_mem_full_total_delta,
  psi_io_some_total_delta, psi_io_full_total_delta,
  tcp_mem_pages, sockets_used, udp_inuse, udp_mem_pages,
  snmp_retrans_segs_sec, snmp_active_opens_sec, snmp_passive_opens_sec,
  snmp_attempt_fails_delta, snmp_estab_resets_delta, snmp_in_errs_delta, snmp_out_rsts_delta,
  snmp_udp_rcvbuf_errors_delta, snmp_udp_sndbuf_errors_delta, snmp_udp_in_errors_delta,
  netstat_listen_overflows_delta, netstat_listen_drops_delta,
  netstat_tcp_timeouts_delta, netstat_tcp_syn_retrans_delta,
  netstat_tcp_fast_retrans_delta, netstat_tcp_ofo_queue_delta,
  netstat_tcp_abort_on_memory_delta, netstat_syncookies_sent_delta,
  softnet_processed_delta, softnet_dropped_delta, softnet_time_squeeze_delta,
  conntrack_count, conntrack_max
)
SELECT
  id, host_id, ts,
  cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal, cpu_count,
  mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
  disk_json, net_json, uptime_seconds,
  psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
  psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
  psi_mem_full_avg10, psi_mem_full_avg60, psi_mem_full_avg300,
  psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
  psi_io_full_avg10, psi_io_full_avg60, psi_io_full_avg300,
  disk_io_json,
  tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated,
  context_switches_sec, forks_sec, procs_running, procs_blocked,
  oom_kills, fd_allocated, fd_max,
  interrupts_sec, softirq_net_rx_sec, softirq_block_sec, tasks_running, tasks_total,
  mem_buffers, mem_cached, mem_dirty, mem_writeback, mem_shmem,
  mem_slab_reclaimable, mem_slab_unreclaim, mem_committed_as, mem_commit_limit, mem_hw_corrupted,
  swap_in_sec, swap_out_sec, pgmajfault_sec, pgpgin_sec, pgpgout_sec,
  psi_cpu_some_total_delta, psi_mem_some_total_delta, psi_mem_full_total_delta,
  psi_io_some_total_delta, psi_io_full_total_delta,
  tcp_mem_pages, sockets_used, udp_inuse, udp_mem_pages,
  snmp_retrans_segs_sec, snmp_active_opens_sec, snmp_passive_opens_sec,
  snmp_attempt_fails_delta, snmp_estab_resets_delta, snmp_in_errs_delta, snmp_out_rsts_delta,
  snmp_udp_rcvbuf_errors_delta, snmp_udp_sndbuf_errors_delta, snmp_udp_in_errors_delta,
  netstat_listen_overflows_delta, netstat_listen_drops_delta,
  netstat_tcp_timeouts_delta, netstat_tcp_syn_retrans_delta,
  netstat_tcp_fast_retrans_delta, netstat_tcp_ofo_queue_delta,
  netstat_tcp_abort_on_memory_delta, netstat_syncookies_sent_delta,
  softnet_processed_delta, softnet_dropped_delta, softnet_time_squeeze_delta,
  conntrack_count, conntrack_max
FROM metrics_raw;

DROP TABLE metrics_raw;
ALTER TABLE metrics_raw_new RENAME TO metrics_raw;
CREATE UNIQUE INDEX idx_raw_host_ts ON metrics_raw(host_id, ts);
