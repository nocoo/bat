-- Tier 3 signal columns for metrics_raw (all nullable for backward compatibility)
-- Design: docs/09-tier3-signals.md § D1 Schema Additions

-- PSI pressure (15 columns — flat for alert rule direct access)
ALTER TABLE metrics_raw ADD COLUMN psi_cpu_some_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_cpu_some_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_cpu_some_avg300 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_some_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_some_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_some_avg300 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_full_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_full_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_full_avg300 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_some_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_some_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_some_avg300 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_full_avg10 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_full_avg60 REAL;
ALTER TABLE metrics_raw ADD COLUMN psi_io_full_avg300 REAL;

-- Disk I/O (JSON array, same pattern as disk/net)
ALTER TABLE metrics_raw ADD COLUMN disk_io_json TEXT;

-- TCP connection state
ALTER TABLE metrics_raw ADD COLUMN tcp_established INTEGER;
ALTER TABLE metrics_raw ADD COLUMN tcp_time_wait INTEGER;
ALTER TABLE metrics_raw ADD COLUMN tcp_orphan INTEGER;
ALTER TABLE metrics_raw ADD COLUMN tcp_allocated INTEGER;

-- CPU extensions (context switches, forks, procs)
ALTER TABLE metrics_raw ADD COLUMN context_switches_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN forks_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN procs_running INTEGER;
ALTER TABLE metrics_raw ADD COLUMN procs_blocked INTEGER;

-- OOM kills (delta since last sample)
ALTER TABLE metrics_raw ADD COLUMN oom_kills INTEGER;

-- File descriptor usage
ALTER TABLE metrics_raw ADD COLUMN fd_allocated INTEGER;
ALTER TABLE metrics_raw ADD COLUMN fd_max INTEGER;

-- =========================================================================
-- metrics_hourly — T3 hourly aggregation columns (all nullable)
-- Design: docs/09-tier3-signals.md § metrics_hourly Schema Additions
-- =========================================================================

-- PSI: store avg + max for alert-relevant avg60 fields + avg10 for sparklines
ALTER TABLE metrics_hourly ADD COLUMN psi_cpu_some_avg10_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_cpu_some_avg10_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_cpu_some_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_cpu_some_avg60_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_mem_some_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_mem_some_avg60_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_mem_full_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_mem_full_avg60_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_io_some_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_io_some_avg60_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_io_full_avg60_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN psi_io_full_avg60_max REAL;

-- Disk I/O: JSON array with per-device avg values
ALTER TABLE metrics_hourly ADD COLUMN disk_io_json TEXT;

-- TCP: avg + max for each gauge
ALTER TABLE metrics_hourly ADD COLUMN tcp_established_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN tcp_established_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN tcp_time_wait_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN tcp_time_wait_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN tcp_orphan_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN tcp_orphan_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN tcp_allocated_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN tcp_allocated_max INTEGER;

-- CPU extensions: avg + max for rates, avg + max for gauges
ALTER TABLE metrics_hourly ADD COLUMN context_switches_sec_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN context_switches_sec_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN forks_sec_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN forks_sec_max REAL;
ALTER TABLE metrics_hourly ADD COLUMN procs_running_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN procs_running_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN procs_blocked_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN procs_blocked_max INTEGER;

-- OOM kills: sum of deltas in the hour
ALTER TABLE metrics_hourly ADD COLUMN oom_kills_sum INTEGER;

-- File descriptors: avg + max for allocated, last for max (static)
ALTER TABLE metrics_hourly ADD COLUMN fd_allocated_avg REAL;
ALTER TABLE metrics_hourly ADD COLUMN fd_allocated_max INTEGER;
ALTER TABLE metrics_hourly ADD COLUMN fd_max INTEGER;
