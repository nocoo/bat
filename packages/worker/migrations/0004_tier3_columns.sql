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
