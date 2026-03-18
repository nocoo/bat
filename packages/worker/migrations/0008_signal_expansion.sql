-- Signal expansion columns for metrics_raw (all nullable for backward compatibility)
-- Design: docs/01-metrics-catalogue.md

-- CPU extensions: interrupts, softirq, task counts
ALTER TABLE metrics_raw ADD COLUMN interrupts_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN softirq_net_rx_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN softirq_block_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN tasks_running INTEGER;
ALTER TABLE metrics_raw ADD COLUMN tasks_total INTEGER;

-- Memory composition (from /proc/meminfo)
ALTER TABLE metrics_raw ADD COLUMN mem_buffers INTEGER;
ALTER TABLE metrics_raw ADD COLUMN mem_cached INTEGER;
ALTER TABLE metrics_raw ADD COLUMN mem_dirty INTEGER;
ALTER TABLE metrics_raw ADD COLUMN mem_writeback INTEGER;
ALTER TABLE metrics_raw ADD COLUMN mem_shmem INTEGER;
ALTER TABLE metrics_raw ADD COLUMN mem_slab_reclaimable INTEGER;
ALTER TABLE metrics_raw ADD COLUMN mem_slab_unreclaim INTEGER;
ALTER TABLE metrics_raw ADD COLUMN mem_committed_as INTEGER;
ALTER TABLE metrics_raw ADD COLUMN mem_commit_limit INTEGER;
ALTER TABLE metrics_raw ADD COLUMN mem_hw_corrupted INTEGER;

-- VMstat rates (from /proc/vmstat deltas)
ALTER TABLE metrics_raw ADD COLUMN swap_in_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN swap_out_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN pgmajfault_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN pgpgin_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN pgpgout_sec REAL;

-- PSI total deltas (microsecond deltas since last sample)
ALTER TABLE metrics_raw ADD COLUMN psi_cpu_some_total_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_some_total_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN psi_mem_full_total_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN psi_io_some_total_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN psi_io_full_total_delta INTEGER;

-- TCP memory
ALTER TABLE metrics_raw ADD COLUMN tcp_mem_pages INTEGER;

-- Socket overview
ALTER TABLE metrics_raw ADD COLUMN sockets_used INTEGER;

-- UDP
ALTER TABLE metrics_raw ADD COLUMN udp_inuse INTEGER;
ALTER TABLE metrics_raw ADD COLUMN udp_mem_pages INTEGER;

-- SNMP counters (from /proc/net/snmp — rates and deltas)
ALTER TABLE metrics_raw ADD COLUMN snmp_retrans_segs_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN snmp_active_opens_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN snmp_passive_opens_sec REAL;
ALTER TABLE metrics_raw ADD COLUMN snmp_attempt_fails_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN snmp_estab_resets_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN snmp_in_errs_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN snmp_out_rsts_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN snmp_udp_rcvbuf_errors_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN snmp_udp_sndbuf_errors_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN snmp_udp_in_errors_delta INTEGER;

-- Netstat counters (from /proc/net/netstat — deltas)
ALTER TABLE metrics_raw ADD COLUMN netstat_listen_overflows_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN netstat_listen_drops_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN netstat_tcp_timeouts_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN netstat_tcp_syn_retrans_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN netstat_tcp_fast_retrans_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN netstat_tcp_ofo_queue_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN netstat_tcp_abort_on_memory_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN netstat_syncookies_sent_delta INTEGER;

-- Softnet counters (from /proc/net/softnet_stat — deltas)
ALTER TABLE metrics_raw ADD COLUMN softnet_processed_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN softnet_dropped_delta INTEGER;
ALTER TABLE metrics_raw ADD COLUMN softnet_time_squeeze_delta INTEGER;

-- Conntrack (from /proc/sys/net/netfilter/)
ALTER TABLE metrics_raw ADD COLUMN conntrack_count INTEGER;
ALTER TABLE metrics_raw ADD COLUMN conntrack_max INTEGER;

