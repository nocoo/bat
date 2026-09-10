-- 32 Production-grade rich test hosts

-- Tags
INSERT OR REPLACE INTO tags (id, name, color) VALUES (1, 'production', 0);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (2, 'staging', 3);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (3, 'us-east', 5);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (4, 'frontend', 1);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (5, 'api', 2);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (6, 'worker', 4);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (7, 'gateway', 6);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (8, 'database', 7);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (9, 'cache', 8);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (10, 'analytics', 9);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (11, 'messaging', 2);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (12, 'ci-cd', 1);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (13, 'kubernetes', 5);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (14, 'gpu-ai', 8);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (15, 'apac-tokyo', 4);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (16, 'emea-london', 7);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (17, 'emea-frankfurt', 6);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (18, 'apac-singapore', 3);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (19, 'monitoring', 0);
INSERT OR REPLACE INTO tags (id, name, color) VALUES (20, 'backup', 9);

-- Hosts
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-web-01', 'web-01.prod.hexly.ai', 'Ubuntu 24.04.2 LTS', '6.8.0-45-generic', 'x86_64', 'AMD EPYC 7763 64-Core', 1787871367, 1789006398, 1789002815,
    1, 16, 8, 34359738368, 8589934592, 'kvm',
    '104.21.45.12', '2.1.2', 'Core server deployed for web-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["104.21.45.12"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1135048}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-web-01', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-web-01', 4);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-web-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-web-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-web-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006115, 1.44, 1.30, 1.15, 28.7,
      1.3, 0.1, 16,
      34359738368, 19103028684, 44.4,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5810253,"tx_bytes_rate":2505768}]', '[{"device":"sda","read_iops":243,"write_iops":565,"io_util_pct":"4.4"}]', 1135048,
      2.8, 2.1, 2.5,
      1.4, 0.7, 0.6,
      4.7, 2.3, 1.9,
      376, 49, 0, 150
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006145, 1.25, 1.13, 1.00, 25.1,
      0.9, 0.2, 16,
      34359738368, 18377280627, 46.5,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2599145,"tx_bytes_rate":2877531}]', '[{"device":"sda","read_iops":76,"write_iops":545,"io_util_pct":"22.3"}]', 1135048,
      0.2, 2.3, 0.3,
      1.5, 0.2, 0.1,
      5.8, 5.1, 1.5,
      337, 67, 0, 456
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006175, 1.86, 1.67, 1.49, 37.2,
      0.7, 0.2, 16,
      34359738368, 17425698877, 49.3,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1467511,"tx_bytes_rate":2269327}]', '[{"device":"sda","read_iops":96,"write_iops":306,"io_util_pct":"11.9"}]', 1135048,
      4.3, 3.7, 2.7,
      1.8, 0.6, 0.7,
      1.3, 1.1, 1.9,
      268, 55, 0, 174
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006205, 1.11, 1.00, 0.89, 22.1,
      1.4, 0.0, 16,
      34359738368, 17586481723, 48.8,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4514445,"tx_bytes_rate":1771324}]', '[{"device":"sda","read_iops":68,"write_iops":407,"io_util_pct":"5.8"}]', 1135048,
      0.7, 0.9, 2.6,
      1.9, 1.0, 0.7,
      1.1, 5.1, 2.1,
      290, 68, 0, 263
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006235, 1.48, 1.33, 1.18, 29.6,
      1.2, 0.2, 16,
      34359738368, 18838247756, 45.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5668701,"tx_bytes_rate":1450369}]', '[{"device":"sda","read_iops":189,"write_iops":342,"io_util_pct":"14.2"}]', 1135048,
      3.7, 0.4, 0.8,
      1.0, 0.2, 0.8,
      7.9, 1.6, 3.4,
      166, 43, 0, 259
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006265, 1.22, 1.10, 0.98, 24.4,
      0.9, 0.0, 16,
      34359738368, 21978330976, 36.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3095178,"tx_bytes_rate":2077559}]', '[{"device":"sda","read_iops":80,"write_iops":133,"io_util_pct":"27.7"}]', 1135048,
      2.2, 3.8, 0.0,
      1.9, 1.0, 0.6,
      4.1, 2.4, 4.6,
      394, 36, 0, 446
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006295, 0.96, 0.86, 0.77, 19.3,
      1.0, 0.1, 16,
      34359738368, 21903566409, 36.3,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5533131,"tx_bytes_rate":813483}]', '[{"device":"sda","read_iops":131,"write_iops":496,"io_util_pct":"23.0"}]', 1135048,
      4.5, 1.2, 1.3,
      1.8, 1.3, 0.1,
      3.7, 5.5, 0.8,
      394, 33, 0, 182
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006325, 1.02, 0.92, 0.82, 20.5,
      1.5, 0.0, 16,
      34359738368, 17926044798, 47.8,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4446591,"tx_bytes_rate":1412952}]', '[{"device":"sda","read_iops":136,"write_iops":314,"io_util_pct":"20.4"}]', 1135048,
      2.7, 0.5, 1.6,
      0.1, 1.4, 0.8,
      2.3, 3.0, 3.6,
      392, 32, 0, 174
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006355, 2.00, 1.80, 1.60, 39.9,
      0.0, 0.1, 16,
      34359738368, 17189404876, 50.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4744139,"tx_bytes_rate":739771}]', '[{"device":"sda","read_iops":55,"write_iops":460,"io_util_pct":"12.0"}]', 1135048,
      4.8, 1.5, 2.0,
      0.9, 0.1, 0.1,
      1.9, 1.5, 1.5,
      213, 52, 0, 382
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-01', 1789006385, 1.56, 1.40, 1.25, 31.2,
      0.7, 0.0, 16,
      34359738368, 20732387728, 39.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3674759,"tx_bytes_rate":781150}]', '[{"device":"sda","read_iops":63,"write_iops":423,"io_util_pct":"29.3"}]', 1135048,
      0.2, 3.9, 0.2,
      1.7, 1.2, 0.7,
      7.7, 4.0, 2.2,
      364, 50, 0, 373
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-web-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"web-01.prod.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.web-01.prod.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-web-02', 'web-02.prod.hexly.ai', 'Ubuntu 24.04.2 LTS', '6.8.0-45-generic', 'x86_64', 'AMD EPYC 7763 64-Core', 1786482039, 1789006412, 1789002815,
    1, 16, 8, 34359738368, 8589934592, 'kvm',
    '104.21.45.13', '2.1.2', 'Core server deployed for web-02',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["104.21.45.13"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":2524376}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-web-02', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-web-02', 4);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-web-02', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-web-02', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-web-02', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006115, 1.22, 1.10, 0.98, 24.5,
      0.7, 0.2, 16,
      34359738368, 18925878735, 44.9,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4632125,"tx_bytes_rate":1720374}]', '[{"device":"sda","read_iops":179,"write_iops":214,"io_util_pct":"29.1"}]', 2524376,
      3.5, 0.6, 0.8,
      1.1, 0.0, 0.1,
      6.1, 0.4, 1.8,
      352, 20, 0, 163
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006145, 0.87, 0.78, 0.70, 17.4,
      1.5, 0.2, 16,
      34359738368, 21392700316, 37.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4235226,"tx_bytes_rate":2922870}]', '[{"device":"sda","read_iops":158,"write_iops":399,"io_util_pct":"5.9"}]', 2524376,
      0.7, 0.8, 1.5,
      0.3, 1.3, 0.5,
      7.6, 3.8, 1.4,
      253, 22, 0, 348
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006175, 1.02, 0.92, 0.82, 20.3,
      0.5, 0.1, 16,
      34359738368, 17564191882, 48.9,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5360890,"tx_bytes_rate":2167252}]', '[{"device":"sda","read_iops":127,"write_iops":530,"io_util_pct":"7.6"}]', 2524376,
      0.9, 3.4, 2.9,
      1.7, 0.2, 0.8,
      0.7, 1.2, 4.7,
      235, 33, 0, 295
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006205, 1.34, 1.21, 1.07, 26.8,
      1.1, 0.0, 16,
      34359738368, 17292610671, 49.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2857845,"tx_bytes_rate":2764866}]', '[{"device":"sda","read_iops":160,"write_iops":421,"io_util_pct":"5.7"}]', 2524376,
      0.5, 3.8, 1.3,
      0.3, 0.6, 0.0,
      3.2, 2.2, 0.7,
      324, 58, 0, 266
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006235, 1.41, 1.27, 1.13, 28.2,
      1.1, 0.1, 16,
      34359738368, 21797715003, 36.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5795412,"tx_bytes_rate":2242178}]', '[{"device":"sda","read_iops":190,"write_iops":101,"io_util_pct":"23.7"}]', 2524376,
      3.3, 2.2, 1.3,
      1.4, 0.9, 0.2,
      7.8, 3.2, 0.4,
      339, 36, 0, 339
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006265, 1.11, 1.00, 0.89, 22.1,
      1.0, 0.2, 16,
      34359738368, 18856722432, 45.1,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5633629,"tx_bytes_rate":1620318}]', '[{"device":"sda","read_iops":181,"write_iops":363,"io_util_pct":"12.6"}]', 2524376,
      3.3, 2.0, 1.0,
      0.3, 0.9, 0.2,
      9.7, 7.9, 1.4,
      190, 51, 0, 181
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006295, 1.85, 1.67, 1.48, 36.9,
      0.7, 0.2, 16,
      34359738368, 17463615078, 49.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3562796,"tx_bytes_rate":1914041}]', '[{"device":"sda","read_iops":174,"write_iops":238,"io_util_pct":"21.4"}]', 2524376,
      2.9, 3.4, 0.5,
      1.1, 0.7, 0.5,
      8.5, 3.1, 3.6,
      320, 47, 0, 359
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006325, 1.43, 1.29, 1.14, 28.6,
      1.4, 0.0, 16,
      34359738368, 17607895763, 48.8,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2527811,"tx_bytes_rate":2015266}]', '[{"device":"sda","read_iops":147,"write_iops":456,"io_util_pct":"6.5"}]', 2524376,
      0.5, 0.4, 1.3,
      1.3, 0.7, 0.5,
      6.0, 3.7, 0.3,
      307, 55, 0, 258
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006355, 1.03, 0.93, 0.82, 20.7,
      0.9, 0.1, 16,
      34359738368, 17670307055, 48.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2198038,"tx_bytes_rate":1988571}]', '[{"device":"sda","read_iops":244,"write_iops":269,"io_util_pct":"29.4"}]', 2524376,
      0.2, 1.0, 2.5,
      1.5, 0.9, 0.6,
      7.9, 1.1, 0.2,
      323, 35, 0, 487
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-02', 1789006385, 1.07, 0.96, 0.86, 21.4,
      1.3, 0.0, 16,
      34359738368, 21663312334, 37.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5283928,"tx_bytes_rate":2954627}]', '[{"device":"sda","read_iops":203,"write_iops":174,"io_util_pct":"3.6"}]', 2524376,
      1.1, 0.4, 1.8,
      0.8, 0.7, 0.5,
      1.3, 4.7, 5.0,
      267, 35, 0, 303
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-web-02', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"web-02.prod.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.web-02.prod.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-web-03', 'web-03.prod.hexly.ai', 'Debian 12.7', '6.1.0-25-amd64', 'x86_64', 'Intel Xeon Platinum 8375C', 1787430563, 1789006403, 1789002815,
    1, 8, 4, 17179869184, 4294967296, 'kvm',
    '172.67.182.90', '2.1.2', 'Core server deployed for web-03',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["172.67.182.90"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1575852}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-web-03', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-web-03', 4);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-web-03', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-web-03', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-web-03', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006115, 3.69, 3.32, 2.95, 73.7,
      0.1, 0.2, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4928389,"tx_bytes_rate":1259488}]', '[{"device":"sda","read_iops":78,"write_iops":551,"io_util_pct":"10.3"}]', 1575852,
      3.7, 0.4, 2.9,
      0.2, 1.2, 0.4,
      2.5, 3.0, 1.4,
      377, 69, 0, 428
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006145, 3.57, 3.21, 2.86, 71.4,
      0.7, 0.2, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2866495,"tx_bytes_rate":2883956}]', '[{"device":"sda","read_iops":169,"write_iops":315,"io_util_pct":"0.6"}]', 1575852,
      0.7, 3.2, 1.3,
      1.8, 0.1, 0.4,
      9.2, 2.5, 1.8,
      350, 26, 0, 302
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006175, 3.72, 3.35, 2.98, 74.5,
      0.5, 0.1, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1337541,"tx_bytes_rate":2312061}]', '[{"device":"sda","read_iops":136,"write_iops":115,"io_util_pct":"26.1"}]', 1575852,
      0.4, 3.3, 1.7,
      1.5, 0.4, 0.4,
      9.4, 0.0, 3.3,
      121, 31, 0, 432
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006205, 3.37, 3.03, 2.70, 67.4,
      0.6, 0.1, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1571746,"tx_bytes_rate":1860634}]', '[{"device":"sda","read_iops":168,"write_iops":323,"io_util_pct":"12.6"}]', 1575852,
      0.6, 2.1, 1.4,
      1.7, 0.6, 0.1,
      9.8, 2.1, 3.9,
      305, 43, 0, 220
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006235, 3.51, 3.16, 2.81, 70.2,
      0.9, 0.1, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1333800,"tx_bytes_rate":555388}]', '[{"device":"sda","read_iops":193,"write_iops":493,"io_util_pct":"1.4"}]', 1575852,
      1.4, 1.9, 0.6,
      1.8, 1.5, 1.0,
      9.3, 4.5, 0.5,
      273, 40, 0, 198
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006265, 3.68, 3.31, 2.94, 73.6,
      0.7, 0.0, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2325766,"tx_bytes_rate":792612}]', '[{"device":"sda","read_iops":109,"write_iops":284,"io_util_pct":"0.2"}]', 1575852,
      2.9, 1.1, 2.8,
      1.3, 0.8, 0.5,
      7.5, 2.9, 3.0,
      341, 61, 0, 219
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006295, 3.66, 3.29, 2.93, 73.2,
      0.6, 0.1, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3551733,"tx_bytes_rate":1320532}]', '[{"device":"sda","read_iops":91,"write_iops":353,"io_util_pct":"21.7"}]', 1575852,
      4.1, 2.9, 2.5,
      1.8, 0.3, 0.6,
      8.3, 6.8, 3.5,
      271, 22, 0, 375
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006325, 3.50, 3.15, 2.80, 70.0,
      0.1, 0.0, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5009043,"tx_bytes_rate":2232627}]', '[{"device":"sda","read_iops":219,"write_iops":440,"io_util_pct":"14.5"}]', 1575852,
      1.2, 1.2, 2.5,
      1.4, 0.6, 0.9,
      6.9, 0.1, 0.4,
      338, 32, 0, 237
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006355, 3.58, 3.22, 2.86, 71.5,
      0.7, 0.2, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3607595,"tx_bytes_rate":2074576}]', '[{"device":"sda","read_iops":59,"write_iops":134,"io_util_pct":"27.9"}]', 1575852,
      1.0, 3.9, 2.8,
      0.1, 0.4, 0.1,
      7.4, 5.1, 0.6,
      378, 51, 0, 347
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-web-03', 1789006385, 3.50, 3.15, 2.80, 70.0,
      0.0, 0.0, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2595151,"tx_bytes_rate":2228452}]', '[{"device":"sda","read_iops":152,"write_iops":366,"io_util_pct":"6.3"}]', 1575852,
      1.0, 2.6, 1.3,
      1.5, 0.3, 0.3,
      2.2, 6.4, 4.9,
      320, 66, 0, 163
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-web-03', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"web-03.prod.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.web-03.prod.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
      VALUES ('srv-prod-web-03', 'mem_high', 'warning', 78.4, 1789005965, 'Memory usage is elevated at 78.4% (threshold 75%)');
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-backend-01', 'backend-01.prod.hexly.ai', 'Ubuntu 22.04.4 LTS', '5.15.0-107-generic', 'x86_64', 'Intel Xeon Gold 6338', 1786960304, 1789006405, 1789002815,
    1, 32, 16, 68719476736, 17179869184, 'vmware',
    '198.51.100.10', '2.1.1', 'Core server deployed for api-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["198.51.100.10"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":2046111}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-backend-01', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-backend-01', 5);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-backend-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-backend-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-backend-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006115, 1.84, 1.66, 1.47, 36.8,
      0.2, 0.1, 32,
      68719476736, 43502344625, 36.7,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2835763,"tx_bytes_rate":1191636}]', '[{"device":"sda","read_iops":147,"write_iops":270,"io_util_pct":"17.9"}]', 2046111,
      0.4, 2.2, 0.2,
      0.2, 0.1, 0.7,
      2.3, 4.4, 2.3,
      177, 46, 0, 402
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006145, 1.24, 1.12, 0.99, 24.8,
      0.2, 0.1, 32,
      68719476736, 36223251473, 47.3,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5403270,"tx_bytes_rate":883775}]', '[{"device":"sda","read_iops":183,"write_iops":259,"io_util_pct":"26.7"}]', 2046111,
      2.3, 3.3, 0.8,
      1.6, 0.6, 0.4,
      4.3, 4.0, 1.9,
      407, 26, 0, 289
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006175, 1.50, 1.35, 1.20, 30.0,
      1.0, 0.0, 32,
      68719476736, 38698567719, 43.7,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5538795,"tx_bytes_rate":2232354}]', '[{"device":"sda","read_iops":249,"write_iops":195,"io_util_pct":"17.8"}]', 2046111,
      1.3, 1.8, 1.7,
      0.1, 1.1, 0.6,
      3.4, 3.5, 4.6,
      166, 64, 0, 345
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006205, 1.56, 1.40, 1.25, 31.2,
      1.4, 0.2, 32,
      68719476736, 34554799460, 49.7,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3565744,"tx_bytes_rate":1493867}]', '[{"device":"sda","read_iops":140,"write_iops":407,"io_util_pct":"6.3"}]', 2046111,
      1.0, 2.8, 1.9,
      0.9, 0.0, 0.2,
      3.6, 6.3, 2.0,
      157, 32, 0, 383
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006235, 0.87, 0.78, 0.70, 17.3,
      1.1, 0.2, 32,
      68719476736, 35814994108, 47.9,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5105754,"tx_bytes_rate":2973021}]', '[{"device":"sda","read_iops":213,"write_iops":463,"io_util_pct":"5.9"}]', 2046111,
      0.6, 0.6, 0.6,
      0.0, 0.8, 0.3,
      2.5, 2.3, 2.7,
      259, 25, 0, 455
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006265, 1.41, 1.27, 1.13, 28.2,
      1.0, 0.1, 32,
      68719476736, 34776747936, 49.4,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3202784,"tx_bytes_rate":2325283}]', '[{"device":"sda","read_iops":123,"write_iops":268,"io_util_pct":"23.9"}]', 2046111,
      0.9, 1.6, 1.0,
      0.4, 0.3, 0.7,
      0.8, 3.8, 1.2,
      310, 59, 0, 358
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006295, 1.61, 1.45, 1.29, 32.2,
      0.9, 0.1, 32,
      68719476736, 43595134063, 36.6,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1130918,"tx_bytes_rate":917473}]', '[{"device":"sda","read_iops":140,"write_iops":530,"io_util_pct":"3.4"}]', 2046111,
      1.8, 3.8, 2.6,
      1.8, 1.4, 0.8,
      6.0, 0.5, 4.3,
      374, 50, 0, 197
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006325, 1.33, 1.20, 1.06, 26.6,
      0.3, 0.2, 32,
      68719476736, 43384348437, 36.9,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2827116,"tx_bytes_rate":530595}]', '[{"device":"sda","read_iops":239,"write_iops":208,"io_util_pct":"27.8"}]', 2046111,
      4.8, 2.2, 1.3,
      1.6, 0.6, 0.9,
      0.1, 7.0, 1.5,
      367, 48, 0, 408
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006355, 0.99, 0.89, 0.79, 19.8,
      0.1, 0.1, 32,
      68719476736, 34997769250, 49.1,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3140772,"tx_bytes_rate":2083620}]', '[{"device":"sda","read_iops":192,"write_iops":244,"io_util_pct":"25.2"}]', 2046111,
      1.2, 2.7, 0.4,
      1.6, 1.0, 0.1,
      4.2, 5.4, 4.5,
      330, 45, 0, 452
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-01', 1789006385, 1.03, 0.93, 0.82, 20.7,
      0.8, 0.0, 32,
      68719476736, 38241843361, 44.4,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1528598,"tx_bytes_rate":2655328}]', '[{"device":"sda","read_iops":131,"write_iops":594,"io_util_pct":"1.6"}]', 2046111,
      4.5, 0.2, 0.3,
      0.7, 0.5, 0.7,
      3.2, 3.0, 4.3,
      405, 44, 0, 252
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-backend-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"backend-01.prod.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.backend-01.prod.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-backend-02', 'backend-02.prod.hexly.ai', 'Ubuntu 22.04.4 LTS', '5.15.0-107-generic', 'x86_64', 'Intel Xeon Gold 6338', 1786856955, 1789006400, 1789002815,
    1, 32, 16, 68719476736, 17179869184, 'vmware',
    '198.51.100.11', '2.1.1', 'Core server deployed for api-02',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["198.51.100.11"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":88.5,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":2149460}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-backend-02', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-backend-02', 5);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-backend-02', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-backend-02', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-backend-02', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006115, 4.67, 4.20, 3.74, 93.3,
      0.2, 0.2, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1191060,"tx_bytes_rate":2853267}]', '[{"device":"sda","read_iops":75,"write_iops":472,"io_util_pct":"13.2"}]', 2149460,
      4.3, 2.0, 2.9,
      1.3, 0.5, 0.9,
      5.1, 0.2, 3.9,
      193, 64, 0, 245
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006145, 4.26, 3.83, 3.41, 85.2,
      0.6, 0.2, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5300455,"tx_bytes_rate":969932}]', '[{"device":"sda","read_iops":182,"write_iops":170,"io_util_pct":"13.0"}]', 2149460,
      4.6, 3.0, 0.1,
      0.2, 0.1, 0.1,
      4.8, 7.8, 1.1,
      224, 21, 0, 218
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006175, 4.45, 4.00, 3.56, 88.9,
      1.4, 0.2, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1074656,"tx_bytes_rate":2206512}]', '[{"device":"sda","read_iops":91,"write_iops":120,"io_util_pct":"12.8"}]', 2149460,
      1.3, 2.1, 0.1,
      0.7, 0.0, 0.3,
      9.2, 2.6, 0.3,
      158, 62, 0, 165
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006205, 4.69, 4.22, 3.75, 93.8,
      0.2, 0.1, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3950735,"tx_bytes_rate":1979258}]', '[{"device":"sda","read_iops":135,"write_iops":569,"io_util_pct":"20.2"}]', 2149460,
      4.1, 0.9, 0.9,
      0.5, 0.4, 0.1,
      1.0, 0.5, 3.6,
      377, 52, 0, 218
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006235, 4.34, 3.91, 3.47, 86.8,
      1.2, 0.1, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5811810,"tx_bytes_rate":922342}]', '[{"device":"sda","read_iops":209,"write_iops":125,"io_util_pct":"21.9"}]', 2149460,
      3.0, 3.4, 2.6,
      1.2, 0.6, 0.6,
      1.8, 7.7, 2.4,
      287, 48, 0, 309
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006265, 4.66, 4.19, 3.73, 93.2,
      0.8, 0.1, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2907137,"tx_bytes_rate":2350269}]', '[{"device":"sda","read_iops":236,"write_iops":466,"io_util_pct":"24.6"}]', 2149460,
      1.5, 1.1, 0.1,
      0.2, 0.0, 0.2,
      0.7, 4.4, 0.8,
      243, 26, 0, 480
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006295, 4.70, 4.23, 3.76, 94.0,
      1.4, 0.1, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5857783,"tx_bytes_rate":1605301}]', '[{"device":"sda","read_iops":244,"write_iops":239,"io_util_pct":"13.2"}]', 2149460,
      3.5, 0.3, 0.0,
      0.3, 0.3, 0.5,
      9.8, 6.6, 1.9,
      204, 62, 0, 212
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006325, 4.54, 4.09, 3.63, 90.7,
      1.0, 0.2, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2453218,"tx_bytes_rate":1588043}]', '[{"device":"sda","read_iops":87,"write_iops":382,"io_util_pct":"1.2"}]', 2149460,
      4.0, 1.4, 1.9,
      1.4, 0.3, 0.7,
      6.3, 1.7, 4.0,
      255, 29, 0, 438
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006355, 4.39, 3.95, 3.51, 87.8,
      0.3, 0.2, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5879256,"tx_bytes_rate":856665}]', '[{"device":"sda","read_iops":214,"write_iops":238,"io_util_pct":"15.4"}]', 2149460,
      0.8, 3.7, 2.8,
      1.3, 0.4, 0.8,
      5.2, 1.9, 0.9,
      255, 45, 0, 219
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-backend-02', 1789006385, 4.47, 4.02, 3.58, 89.5,
      1.0, 0.0, 32,
      68719476736, 5153960755, 92.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":32212254720,"used_pct":94.2},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5535966,"tx_bytes_rate":1085347}]', '[{"device":"sda","read_iops":130,"write_iops":382,"io_util_pct":"12.8"}]', 2149460,
      0.8, 1.3, 1.1,
      1.8, 1.0, 0.2,
      3.4, 4.2, 2.5,
      177, 52, 0, 198
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-backend-02', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"backend-02.prod.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.backend-02.prod.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
      VALUES ('srv-prod-backend-02', 'cpu_high', 'critical', 95.5, 1789005815, 'CPU usage is critical at 95.5% (threshold 90%)');
INSERT OR REPLACE INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
      VALUES ('srv-prod-backend-02', 'disk_full', 'critical', 94.2, 1789006115, 'Root disk / is 94.2% full (threshold 90%)');
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-worker-01', 'worker-01.prod.hexly.ai', 'Arch Linux', '6.10.8-arch1-1', 'x86_64', 'AMD Ryzen 9 7950X', 1787665023, 1789006398, 1789002815,
    1, 32, 16, 67108864000, 33554432000, 'bare-metal',
    '140.82.112.4', '2.1.2', 'Core server deployed for worker-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["140.82.112.4"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1341392}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-worker-01', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-worker-01', 6);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-worker-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-worker-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-worker-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006115, 1.13, 1.02, 0.90, 22.6,
      0.5, 0.0, 32,
      67108864000, 35411865689, 47.2,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3576584,"tx_bytes_rate":1234786}]', '[{"device":"sda","read_iops":198,"write_iops":364,"io_util_pct":"11.5"}]', 1341392,
      2.7, 0.3, 2.1,
      0.7, 0.3, 0.1,
      0.7, 4.1, 1.5,
      409, 49, 0, 151
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006145, 1.09, 0.98, 0.87, 21.9,
      1.1, 0.0, 32,
      67108864000, 43532279663, 35.1,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3869791,"tx_bytes_rate":1753765}]', '[{"device":"sda","read_iops":223,"write_iops":134,"io_util_pct":"12.2"}]', 1341392,
      1.7, 2.9, 1.6,
      1.4, 1.2, 0.8,
      0.0, 5.5, 4.1,
      129, 30, 0, 369
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006175, 1.17, 1.05, 0.94, 23.3,
      0.8, 0.0, 32,
      67108864000, 43413210124, 35.3,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3992381,"tx_bytes_rate":852587}]', '[{"device":"sda","read_iops":237,"write_iops":574,"io_util_pct":"20.9"}]', 1341392,
      2.2, 1.6, 1.7,
      0.7, 0.2, 0.4,
      8.0, 2.7, 2.5,
      348, 51, 0, 350
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006205, 1.63, 1.47, 1.30, 32.5,
      1.2, 0.0, 32,
      67108864000, 43533822125, 35.1,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1537308,"tx_bytes_rate":2464938}]', '[{"device":"sda","read_iops":107,"write_iops":416,"io_util_pct":"2.9"}]', 1341392,
      0.6, 0.6, 1.5,
      0.1, 1.4, 0.9,
      2.1, 1.8, 1.9,
      158, 30, 0, 462
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006235, 1.43, 1.29, 1.14, 28.6,
      0.4, 0.0, 32,
      67108864000, 39399926128, 41.3,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3350794,"tx_bytes_rate":850625}]', '[{"device":"sda","read_iops":246,"write_iops":101,"io_util_pct":"3.7"}]', 1341392,
      2.2, 1.3, 2.1,
      1.8, 0.7, 1.0,
      6.1, 2.9, 2.9,
      387, 63, 0, 295
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006265, 1.23, 1.11, 0.98, 24.6,
      1.3, 0.1, 32,
      67108864000, 37806343171, 43.7,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4442608,"tx_bytes_rate":2483486}]', '[{"device":"sda","read_iops":52,"write_iops":229,"io_util_pct":"18.0"}]', 1341392,
      0.3, 2.4, 1.3,
      1.9, 0.1, 0.2,
      1.6, 2.4, 2.9,
      164, 64, 0, 471
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006295, 1.40, 1.26, 1.12, 28.1,
      0.8, 0.2, 32,
      67108864000, 36443248970, 45.7,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2631669,"tx_bytes_rate":867347}]', '[{"device":"sda","read_iops":61,"write_iops":302,"io_util_pct":"18.7"}]', 1341392,
      4.8, 3.1, 1.6,
      1.1, 1.5, 0.1,
      2.7, 1.4, 4.7,
      147, 48, 0, 390
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006325, 1.40, 1.26, 1.12, 28.0,
      0.3, 0.0, 32,
      67108864000, 37896445931, 43.5,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5748137,"tx_bytes_rate":1596038}]', '[{"device":"sda","read_iops":145,"write_iops":399,"io_util_pct":"12.1"}]', 1341392,
      1.2, 1.4, 2.1,
      0.6, 0.8, 0.1,
      5.0, 0.1, 2.0,
      404, 62, 0, 206
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006355, 1.15, 1.03, 0.92, 22.9,
      1.3, 0.1, 32,
      67108864000, 35719753500, 46.8,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5781358,"tx_bytes_rate":1959638}]', '[{"device":"sda","read_iops":101,"write_iops":421,"io_util_pct":"23.8"}]', 1341392,
      3.8, 2.2, 2.9,
      1.7, 0.9, 0.1,
      2.1, 3.8, 3.4,
      140, 20, 0, 245
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-01', 1789006385, 1.79, 1.61, 1.43, 35.8,
      0.0, 0.1, 32,
      67108864000, 40131515845, 40.2,
      33554432000, 3355443200, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5440818,"tx_bytes_rate":1343072}]', '[{"device":"sda","read_iops":231,"write_iops":228,"io_util_pct":"3.0"}]', 1341392,
      0.8, 2.6, 1.6,
      1.2, 0.8, 0.1,
      0.9, 0.7, 1.2,
      235, 66, 0, 171
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-worker-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"worker-01.prod.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.worker-01.prod.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-worker-02', 'worker-02.prod.hexly.ai', 'Ubuntu 24.04.2 LTS', '6.8.0-45-generic', 'x86_64', 'Ampere Altra Q80-30', 1787780193, 1789006401, 1789002815,
    1, 64, 64, 137438953472, 17179869184, 'kvm',
    '140.82.112.5', '2.1.2', 'Core server deployed for worker-02',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["140.82.112.5"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1226222}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-worker-02', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-worker-02', 6);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-worker-02', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-worker-02', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-worker-02', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006115, 1.83, 1.65, 1.46, 36.5,
      1.0, 0.1, 64,
      137438953472, 78493245521, 42.9,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5204882,"tx_bytes_rate":1642797}]', '[{"device":"sda","read_iops":100,"write_iops":179,"io_util_pct":"13.3"}]', 1226222,
      3.6, 0.6, 2.6,
      1.4, 1.5, 0.1,
      3.2, 1.3, 0.8,
      347, 64, 0, 283
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006145, 1.65, 1.48, 1.32, 33.0,
      0.8, 0.1, 64,
      137438953472, 77817980245, 43.4,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1285165,"tx_bytes_rate":2807676}]', '[{"device":"sda","read_iops":189,"write_iops":202,"io_util_pct":"8.1"}]', 1226222,
      2.9, 0.2, 1.3,
      1.9, 1.1, 0.3,
      0.2, 7.7, 1.9,
      365, 35, 0, 474
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006175, 0.88, 0.79, 0.70, 17.6,
      1.3, 0.0, 64,
      137438953472, 70276347057, 48.9,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5750518,"tx_bytes_rate":937805}]', '[{"device":"sda","read_iops":100,"write_iops":227,"io_util_pct":"27.8"}]', 1226222,
      1.7, 3.7, 0.5,
      1.1, 1.1, 0.1,
      1.8, 1.7, 1.9,
      253, 34, 0, 194
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006205, 0.91, 0.82, 0.73, 18.2,
      1.2, 0.1, 64,
      137438953472, 71446086669, 48.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5748460,"tx_bytes_rate":2086872}]', '[{"device":"sda","read_iops":146,"write_iops":364,"io_util_pct":"20.5"}]', 1226222,
      4.1, 1.5, 1.9,
      1.9, 0.6, 0.1,
      8.8, 4.4, 5.0,
      265, 40, 0, 467
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006235, 1.69, 1.52, 1.35, 33.9,
      1.5, 0.2, 64,
      137438953472, 78501257672, 42.9,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3481210,"tx_bytes_rate":2520305}]', '[{"device":"sda","read_iops":62,"write_iops":386,"io_util_pct":"22.9"}]', 1226222,
      3.9, 4.0, 1.6,
      0.8, 1.0, 1.0,
      7.6, 3.2, 4.8,
      248, 55, 0, 176
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006265, 1.17, 1.05, 0.94, 23.4,
      0.7, 0.1, 64,
      137438953472, 88889648883, 35.3,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1875000,"tx_bytes_rate":932597}]', '[{"device":"sda","read_iops":132,"write_iops":462,"io_util_pct":"21.6"}]', 1226222,
      0.4, 2.3, 0.2,
      1.9, 0.2, 0.1,
      5.4, 0.3, 1.7,
      308, 23, 0, 461
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006295, 1.46, 1.31, 1.17, 29.2,
      0.7, 0.1, 64,
      137438953472, 69858901264, 49.2,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3583909,"tx_bytes_rate":2025979}]', '[{"device":"sda","read_iops":237,"write_iops":276,"io_util_pct":"18.8"}]', 1226222,
      2.6, 3.7, 0.3,
      1.0, 0.6, 0.1,
      2.9, 0.1, 4.6,
      215, 59, 0, 444
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006325, 1.87, 1.68, 1.50, 37.4,
      0.1, 0.1, 64,
      137438953472, 87346239770, 36.4,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1594114,"tx_bytes_rate":1729880}]', '[{"device":"sda","read_iops":217,"write_iops":234,"io_util_pct":"14.1"}]', 1226222,
      2.8, 3.7, 1.7,
      0.3, 0.1, 0.5,
      9.6, 1.6, 3.2,
      258, 37, 0, 487
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006355, 0.91, 0.82, 0.73, 18.2,
      1.2, 0.1, 64,
      137438953472, 76984663177, 44.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5444875,"tx_bytes_rate":1260639}]', '[{"device":"sda","read_iops":120,"write_iops":334,"io_util_pct":"20.3"}]', 1226222,
      0.9, 0.4, 0.6,
      0.1, 0.5, 0.2,
      7.3, 4.0, 3.3,
      287, 51, 0, 453
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-worker-02', 1789006385, 1.21, 1.09, 0.97, 24.1,
      0.5, 0.2, 64,
      137438953472, 89064223295, 35.2,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5858691,"tx_bytes_rate":1701203}]', '[{"device":"sda","read_iops":127,"write_iops":579,"io_util_pct":"13.2"}]', 1226222,
      0.8, 3.1, 0.9,
      1.3, 0.8, 0.8,
      3.5, 5.5, 2.3,
      151, 42, 0, 303
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-worker-02', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"worker-02.prod.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.worker-02.prod.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-gateway', 'edge-gw.prod.hexly.ai', 'Alpine Linux 3.20.2', '6.6.47-0-virt', 'x86_64', 'Intel Xeon E5-2680 v4', 1786824323, 1789006414, 1789002815,
    1, 4, 2, 4294967296, 0, 'kvm',
    '192.0.2.1', '2.1.2', 'Core server deployed for edge-gw',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["192.0.2.1"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":2182092}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-gateway', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-gateway', 7);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-gateway', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-gateway', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-gateway', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006115, 1.43, 1.29, 1.14, 28.6,
      1.2, 0.1, 4,
      4294967296, 2736383281, 36.3,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1708215,"tx_bytes_rate":523623}]', '[{"device":"sda","read_iops":171,"write_iops":501,"io_util_pct":"26.9"}]', 2182092,
      5.0, 2.3, 1.6,
      1.7, 0.0, 0.7,
      1.8, 5.8, 4.9,
      354, 49, 0, 476
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006145, 1.42, 1.28, 1.14, 28.5,
      0.8, 0.2, 4,
      4294967296, 2531565803, 41.1,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4448435,"tx_bytes_rate":562115}]', '[{"device":"sda","read_iops":90,"write_iops":465,"io_util_pct":"15.8"}]', 2182092,
      1.9, 3.4, 0.1,
      1.6, 1.0, 0.9,
      9.8, 6.1, 2.2,
      376, 24, 0, 241
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006175, 1.60, 1.44, 1.28, 32.1,
      1.4, 0.1, 4,
      4294967296, 2219004526, 48.3,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5158849,"tx_bytes_rate":1137058}]', '[{"device":"sda","read_iops":176,"write_iops":338,"io_util_pct":"29.1"}]', 2182092,
      2.3, 2.0, 1.9,
      0.7, 0.6, 0.2,
      1.5, 2.4, 0.0,
      178, 51, 0, 305
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006205, 1.68, 1.51, 1.34, 33.6,
      0.7, 0.2, 4,
      4294967296, 2403115796, 44.0,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4495840,"tx_bytes_rate":1900079}]', '[{"device":"sda","read_iops":150,"write_iops":113,"io_util_pct":"14.3"}]', 2182092,
      4.0, 0.5, 2.8,
      0.9, 1.1, 0.6,
      7.5, 5.2, 1.6,
      283, 20, 0, 267
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006235, 1.74, 1.57, 1.39, 34.8,
      0.5, 0.1, 4,
      4294967296, 2457662352, 42.8,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5659843,"tx_bytes_rate":2229592}]', '[{"device":"sda","read_iops":190,"write_iops":281,"io_util_pct":"20.7"}]', 2182092,
      4.7, 2.9, 2.0,
      1.3, 0.4, 0.3,
      5.7, 7.6, 4.1,
      260, 45, 0, 356
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006265, 1.43, 1.29, 1.14, 28.6,
      0.6, 0.2, 4,
      4294967296, 2725050531, 36.6,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4141945,"tx_bytes_rate":1544759}]', '[{"device":"sda","read_iops":110,"write_iops":393,"io_util_pct":"6.4"}]', 2182092,
      1.6, 1.3, 2.4,
      1.3, 1.0, 0.6,
      1.8, 6.2, 3.1,
      381, 20, 0, 484
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006295, 1.81, 1.63, 1.45, 36.2,
      0.6, 0.1, 4,
      4294967296, 2523186568, 41.3,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1558697,"tx_bytes_rate":1661205}]', '[{"device":"sda","read_iops":141,"write_iops":107,"io_util_pct":"21.2"}]', 2182092,
      0.8, 3.0, 1.1,
      1.5, 0.1, 0.7,
      6.4, 1.7, 0.5,
      274, 40, 0, 194
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006325, 0.78, 0.70, 0.62, 15.6,
      1.1, 0.1, 4,
      4294967296, 2551626408, 40.6,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3700721,"tx_bytes_rate":2062181}]', '[{"device":"sda","read_iops":223,"write_iops":292,"io_util_pct":"22.7"}]', 2182092,
      0.6, 0.5, 1.3,
      1.7, 1.0, 0.9,
      0.6, 3.9, 4.5,
      202, 54, 0, 372
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006355, 1.05, 0.95, 0.84, 21.0,
      0.3, 0.1, 4,
      4294967296, 2251782846, 47.6,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2619570,"tx_bytes_rate":840064}]', '[{"device":"sda","read_iops":219,"write_iops":176,"io_util_pct":"17.4"}]', 2182092,
      4.5, 0.4, 2.4,
      0.8, 0.8, 0.4,
      1.9, 6.2, 1.4,
      376, 61, 0, 405
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-gateway', 1789006385, 1.50, 1.35, 1.20, 30.1,
      0.5, 0.2, 4,
      4294967296, 2698360431, 37.2,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5819417,"tx_bytes_rate":1912742}]', '[{"device":"sda","read_iops":126,"write_iops":245,"io_util_pct":"3.3"}]', 2182092,
      3.5, 0.3, 1.0,
      1.0, 1.3, 0.0,
      7.8, 6.9, 2.4,
      205, 61, 0, 175
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-gateway', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"edge-gw.prod.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.edge-gw.prod.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-db-master', 'postgres-primary.db.hexly.ai', 'Debian 12.7', '6.1.0-25-amd64', 'x86_64', 'AMD EPYC 9654 96-Core', 1787704724, 1789006395, 1789002815,
    1, 64, 32, 274877906944, 34359738368, 'bare-metal',
    '10.0.1.10', '2.1.2', 'Core server deployed for postgres-primary',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.1.10"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1301691}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-db-master', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-db-master', 8);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-db-master', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-db-master', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-db-master', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006115, 0.94, 0.85, 0.75, 18.9,
      0.3, 0.1, 64,
      274877906944, 163467542128, 40.5,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1264023,"tx_bytes_rate":2128824}]', '[{"device":"sda","read_iops":195,"write_iops":556,"io_util_pct":"14.3"}]', 1301691,
      4.6, 1.9, 2.8,
      0.3, 0.8, 0.6,
      0.0, 2.6, 3.0,
      132, 20, 0, 309
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006145, 1.36, 1.22, 1.09, 27.3,
      1.5, 0.1, 64,
      274877906944, 155713067538, 43.4,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1655355,"tx_bytes_rate":1956195}]', '[{"device":"sda","read_iops":105,"write_iops":200,"io_util_pct":"11.7"}]', 1301691,
      1.5, 2.3, 0.3,
      1.9, 0.1, 0.2,
      4.5, 1.8, 4.1,
      392, 21, 0, 273
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006175, 1.92, 1.73, 1.54, 38.4,
      0.5, 0.1, 64,
      274877906944, 178263990384, 35.1,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4210596,"tx_bytes_rate":2066878}]', '[{"device":"sda","read_iops":117,"write_iops":495,"io_util_pct":"17.7"}]', 1301691,
      0.9, 3.4, 1.9,
      0.2, 0.8, 0.4,
      1.2, 7.6, 3.2,
      153, 29, 0, 258
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006205, 1.15, 1.03, 0.92, 22.9,
      1.1, 0.1, 64,
      274877906944, 143135637433, 47.9,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4376669,"tx_bytes_rate":1411714}]', '[{"device":"sda","read_iops":77,"write_iops":557,"io_util_pct":"17.6"}]', 1301691,
      0.2, 1.2, 1.0,
      1.6, 0.0, 0.9,
      6.6, 1.2, 3.1,
      376, 37, 0, 447
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006235, 1.12, 1.01, 0.90, 22.5,
      0.7, 0.2, 64,
      274877906944, 149113231953, 45.8,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4913198,"tx_bytes_rate":894343}]', '[{"device":"sda","read_iops":145,"write_iops":350,"io_util_pct":"29.5"}]', 1301691,
      4.7, 1.0, 1.2,
      1.0, 0.7, 0.3,
      5.5, 3.3, 4.5,
      250, 67, 0, 432
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006265, 1.88, 1.69, 1.50, 37.7,
      0.0, 0.1, 64,
      274877906944, 143635971578, 47.7,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3588763,"tx_bytes_rate":1093813}]', '[{"device":"sda","read_iops":113,"write_iops":285,"io_util_pct":"12.6"}]', 1301691,
      0.8, 2.0, 1.7,
      1.2, 0.4, 0.3,
      0.9, 6.8, 1.6,
      265, 42, 0, 432
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006295, 1.34, 1.21, 1.07, 26.7,
      0.3, 0.2, 64,
      274877906944, 138739745071, 49.5,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3386559,"tx_bytes_rate":1228049}]', '[{"device":"sda","read_iops":189,"write_iops":508,"io_util_pct":"28.2"}]', 1301691,
      4.1, 2.3, 2.0,
      0.3, 0.4, 0.6,
      9.9, 6.0, 3.4,
      152, 66, 0, 311
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006325, 1.95, 1.75, 1.56, 39.0,
      1.0, 0.1, 64,
      274877906944, 153512888538, 44.2,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2228594,"tx_bytes_rate":737712}]', '[{"device":"sda","read_iops":213,"write_iops":225,"io_util_pct":"19.0"}]', 1301691,
      2.1, 1.6, 1.9,
      0.4, 0.5, 0.7,
      2.4, 4.9, 2.9,
      244, 27, 0, 480
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006355, 1.50, 1.35, 1.20, 30.0,
      0.6, 0.0, 64,
      274877906944, 155580251474, 43.4,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4136784,"tx_bytes_rate":2616705}]', '[{"device":"sda","read_iops":57,"write_iops":463,"io_util_pct":"26.8"}]', 1301691,
      1.5, 1.4, 0.8,
      2.0, 0.1, 0.4,
      1.1, 3.6, 0.1,
      171, 44, 0, 341
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-master', 1789006385, 0.81, 0.73, 0.65, 16.1,
      0.1, 0.0, 64,
      274877906944, 178090563421, 35.2,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2277340,"tx_bytes_rate":2907618}]', '[{"device":"sda","read_iops":160,"write_iops":501,"io_util_pct":"23.9"}]', 1301691,
      1.1, 3.4, 1.0,
      0.4, 0.6, 0.9,
      2.7, 1.8, 3.1,
      201, 28, 0, 298
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-db-master', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"postgres-primary.db.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.postgres-primary.db.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-db-replica-1', 'postgres-replica-01.db.hexly.ai', 'Debian 12.7', '6.1.0-25-amd64', 'x86_64', 'AMD EPYC 9654 96-Core', 1787683153, 1789006409, 1789002815,
    1, 64, 32, 274877906944, 34359738368, 'bare-metal',
    '10.0.1.11', '2.1.2', 'Core server deployed for postgres-replica-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.1.11"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1323262}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-db-replica-1', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-db-replica-1', 8);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-db-replica-1', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-db-replica-1', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-db-replica-1', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006115, 1.75, 1.57, 1.40, 35.1,
      1.3, 0.1, 64,
      274877906944, 153495140105, 44.2,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2923079,"tx_bytes_rate":1236396}]', '[{"device":"sda","read_iops":196,"write_iops":103,"io_util_pct":"12.4"}]', 1323262,
      3.3, 2.5, 2.0,
      1.3, 0.1, 0.2,
      9.7, 6.3, 0.1,
      312, 35, 0, 396
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006145, 1.02, 0.92, 0.82, 20.5,
      1.5, 0.2, 64,
      274877906944, 162762362270, 40.8,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1932283,"tx_bytes_rate":550890}]', '[{"device":"sda","read_iops":119,"write_iops":161,"io_util_pct":"9.8"}]', 1323262,
      1.0, 0.8, 0.8,
      0.9, 0.7, 0.8,
      2.9, 5.6, 1.8,
      129, 58, 0, 337
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006175, 0.78, 0.70, 0.62, 15.6,
      1.1, 0.1, 64,
      274877906944, 139377579319, 49.3,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1964999,"tx_bytes_rate":2500594}]', '[{"device":"sda","read_iops":160,"write_iops":218,"io_util_pct":"11.2"}]', 1323262,
      3.1, 3.7, 0.4,
      0.8, 1.5, 1.0,
      9.7, 1.8, 2.9,
      222, 40, 0, 214
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006205, 1.92, 1.73, 1.54, 38.4,
      1.2, 0.2, 64,
      274877906944, 140256156596, 49.0,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3678346,"tx_bytes_rate":2143132}]', '[{"device":"sda","read_iops":104,"write_iops":436,"io_util_pct":"28.0"}]', 1323262,
      2.6, 2.5, 0.9,
      1.8, 0.6, 0.8,
      6.9, 0.1, 2.9,
      389, 65, 0, 192
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006235, 0.78, 0.70, 0.62, 15.6,
      0.6, 0.1, 64,
      274877906944, 149601421493, 45.6,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4157448,"tx_bytes_rate":1687871}]', '[{"device":"sda","read_iops":156,"write_iops":305,"io_util_pct":"13.7"}]', 1323262,
      1.1, 3.1, 0.5,
      1.0, 0.2, 0.1,
      0.3, 0.1, 0.0,
      315, 65, 0, 170
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006265, 1.55, 1.40, 1.24, 31.0,
      1.4, 0.2, 64,
      274877906944, 139220857867, 49.4,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1156222,"tx_bytes_rate":965994}]', '[{"device":"sda","read_iops":133,"write_iops":517,"io_util_pct":"10.3"}]', 1323262,
      2.7, 1.4, 2.8,
      1.8, 0.6, 0.8,
      6.2, 7.4, 0.6,
      395, 57, 0, 432
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006295, 1.74, 1.57, 1.39, 34.7,
      0.3, 0.2, 64,
      274877906944, 141314139660, 48.6,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3470199,"tx_bytes_rate":1106073}]', '[{"device":"sda","read_iops":90,"write_iops":367,"io_util_pct":"22.7"}]', 1323262,
      1.8, 1.6, 2.3,
      2.0, 0.8, 0.6,
      2.3, 1.5, 1.9,
      153, 63, 0, 209
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006325, 1.08, 0.97, 0.86, 21.6,
      0.1, 0.0, 64,
      274877906944, 137643477423, 49.9,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5430268,"tx_bytes_rate":1535875}]', '[{"device":"sda","read_iops":167,"write_iops":156,"io_util_pct":"1.3"}]', 1323262,
      3.6, 3.7, 1.4,
      1.7, 0.1, 0.7,
      2.5, 6.7, 4.0,
      326, 27, 0, 371
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006355, 0.87, 0.78, 0.70, 17.5,
      0.7, 0.0, 64,
      274877906944, 176555198685, 35.8,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1549298,"tx_bytes_rate":1724259}]', '[{"device":"sda","read_iops":85,"write_iops":391,"io_util_pct":"23.0"}]', 1323262,
      2.6, 1.7, 1.1,
      1.4, 0.4, 0.2,
      3.4, 5.2, 1.9,
      348, 29, 0, 337
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-1', 1789006385, 1.76, 1.58, 1.41, 35.1,
      1.4, 0.1, 64,
      274877906944, 169802574404, 38.2,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2867743,"tx_bytes_rate":2228542}]', '[{"device":"sda","read_iops":184,"write_iops":209,"io_util_pct":"0.1"}]', 1323262,
      0.8, 3.0, 2.7,
      0.7, 1.1, 0.9,
      0.1, 3.1, 0.0,
      217, 25, 0, 338
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-db-replica-1', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"postgres-replica-01.db.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.postgres-replica-01.db.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-db-replica-2', 'postgres-replica-02.db.hexly.ai', 'Debian 12.7', '6.1.0-25-amd64', 'x86_64', 'AMD EPYC 7763 64-Core', 1787135670, 1789006405, 1789002815,
    1, 32, 16, 137438953472, 17179869184, 'kvm',
    '10.0.1.12', '2.1.0', 'Core server deployed for postgres-replica-02',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.1.12"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1870745}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-db-replica-2', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-db-replica-2', 8);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-db-replica-2', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-db-replica-2', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-db-replica-2', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006115, 3.32, 2.99, 2.66, 66.3,
      0.4, 0.1, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3043015,"tx_bytes_rate":1843798}]', '[{"device":"sda","read_iops":75,"write_iops":382,"io_util_pct":"2.9"}]', 1870745,
      4.0, 0.9, 1.7,
      1.1, 1.5, 0.8,
      4.0, 5.5, 0.4,
      179, 49, 0, 495
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006145, 3.32, 2.99, 2.66, 66.3,
      0.5, 0.1, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4896338,"tx_bytes_rate":565410}]', '[{"device":"sda","read_iops":157,"write_iops":576,"io_util_pct":"21.8"}]', 1870745,
      3.4, 3.1, 1.3,
      1.1, 0.4, 0.7,
      5.0, 2.4, 1.8,
      173, 35, 0, 353
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006175, 3.67, 3.30, 2.94, 73.5,
      0.3, 0.1, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5601471,"tx_bytes_rate":2808245}]', '[{"device":"sda","read_iops":212,"write_iops":516,"io_util_pct":"9.2"}]', 1870745,
      3.1, 0.7, 1.0,
      0.5, 1.1, 0.9,
      6.1, 4.0, 3.0,
      372, 42, 0, 436
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006205, 3.36, 3.02, 2.69, 67.3,
      0.2, 0.1, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1032552,"tx_bytes_rate":1809240}]', '[{"device":"sda","read_iops":105,"write_iops":538,"io_util_pct":"29.9"}]', 1870745,
      4.5, 1.0, 2.1,
      0.7, 0.3, 0.7,
      4.9, 7.6, 1.1,
      209, 30, 0, 152
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006235, 3.26, 2.93, 2.61, 65.1,
      0.4, 0.1, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1423810,"tx_bytes_rate":2482809}]', '[{"device":"sda","read_iops":110,"write_iops":253,"io_util_pct":"4.2"}]', 1870745,
      1.8, 2.0, 2.9,
      1.6, 0.5, 0.5,
      1.6, 5.8, 2.1,
      400, 57, 0, 461
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006265, 3.26, 2.93, 2.61, 65.2,
      1.2, 0.0, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4675622,"tx_bytes_rate":2990485}]', '[{"device":"sda","read_iops":203,"write_iops":353,"io_util_pct":"20.1"}]', 1870745,
      4.0, 3.6, 1.9,
      1.9, 0.2, 0.3,
      3.8, 1.9, 2.9,
      360, 37, 0, 251
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006295, 3.72, 3.35, 2.98, 74.5,
      1.1, 0.1, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2622874,"tx_bytes_rate":1633506}]', '[{"device":"sda","read_iops":242,"write_iops":220,"io_util_pct":"2.6"}]', 1870745,
      4.1, 3.8, 1.7,
      0.6, 0.1, 0.0,
      3.5, 1.2, 3.1,
      210, 34, 0, 173
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006325, 3.67, 3.30, 2.94, 73.3,
      1.2, 0.2, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3735209,"tx_bytes_rate":1979791}]', '[{"device":"sda","read_iops":179,"write_iops":594,"io_util_pct":"14.2"}]', 1870745,
      3.5, 0.2, 1.6,
      1.4, 0.2, 0.7,
      4.6, 7.0, 1.4,
      352, 45, 0, 195
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006355, 3.27, 2.94, 2.62, 65.4,
      1.2, 0.0, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1259304,"tx_bytes_rate":1668204}]', '[{"device":"sda","read_iops":89,"write_iops":587,"io_util_pct":"4.5"}]', 1870745,
      3.7, 2.8, 0.8,
      1.5, 0.3, 0.3,
      7.2, 0.8, 0.4,
      151, 30, 0, 278
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-db-replica-2', 1789006385, 3.73, 3.36, 2.98, 74.7,
      1.4, 0.1, 32,
      137438953472, 30236569763, 78.0,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4911285,"tx_bytes_rate":2352595}]', '[{"device":"sda","read_iops":241,"write_iops":135,"io_util_pct":"25.5"}]', 1870745,
      0.1, 3.9, 0.6,
      0.4, 0.5, 0.9,
      4.5, 3.9, 2.9,
      301, 33, 0, 397
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-db-replica-2', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"postgres-replica-02.db.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.postgres-replica-02.db.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
      VALUES ('srv-prod-db-replica-2', 'mem_high', 'warning', 78.4, 1789005965, 'Memory usage is elevated at 78.4% (threshold 75%)');
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-redis-01', 'redis-cluster-01.cache.hexly.ai', 'Ubuntu 22.04.4 LTS', '5.15.0-107-generic', 'x86_64', 'Intel Xeon Platinum 8280', 1788019559, 1789006407, 1789002815,
    1, 16, 8, 68719476736, 0, 'kvm',
    '10.0.2.1', '2.1.2', 'Core server deployed for redis-cluster-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.2.1"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":986856}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-redis-01', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-redis-01', 9);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-redis-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-redis-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-redis-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006115, 1.34, 1.21, 1.07, 26.9,
      0.1, 0.0, 16,
      68719476736, 37657391782, 45.2,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2488754,"tx_bytes_rate":2758936}]', '[{"device":"sda","read_iops":210,"write_iops":520,"io_util_pct":"9.2"}]', 986856,
      2.0, 0.8, 1.6,
      0.9, 1.0, 0.0,
      6.1, 7.1, 4.2,
      281, 69, 0, 390
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006145, 1.57, 1.41, 1.26, 31.4,
      0.8, 0.2, 16,
      68719476736, 35165636737, 48.8,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2860795,"tx_bytes_rate":2263336}]', '[{"device":"sda","read_iops":95,"write_iops":238,"io_util_pct":"27.4"}]', 986856,
      3.7, 0.3, 1.3,
      1.9, 0.2, 0.4,
      6.1, 4.5, 4.8,
      142, 41, 0, 484
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006175, 1.34, 1.21, 1.07, 26.8,
      0.5, 0.1, 16,
      68719476736, 42547612692, 38.1,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2837616,"tx_bytes_rate":2006261}]', '[{"device":"sda","read_iops":63,"write_iops":464,"io_util_pct":"0.4"}]', 986856,
      4.3, 1.2, 2.7,
      1.9, 0.5, 0.9,
      4.3, 5.5, 4.8,
      351, 68, 0, 479
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006205, 0.93, 0.84, 0.74, 18.5,
      1.4, 0.0, 16,
      68719476736, 34360569748, 50.0,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1203133,"tx_bytes_rate":1875307}]', '[{"device":"sda","read_iops":71,"write_iops":398,"io_util_pct":"21.5"}]', 986856,
      2.7, 0.8, 0.2,
      0.4, 0.6, 0.7,
      8.8, 7.9, 1.8,
      312, 69, 0, 439
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006235, 1.16, 1.04, 0.93, 23.3,
      1.0, 0.2, 16,
      68719476736, 40224927179, 41.5,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4126767,"tx_bytes_rate":1287889}]', '[{"device":"sda","read_iops":102,"write_iops":544,"io_util_pct":"9.5"}]', 986856,
      1.6, 2.9, 0.1,
      1.4, 0.6, 0.2,
      0.2, 6.6, 3.9,
      387, 64, 0, 470
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006265, 1.00, 0.90, 0.80, 20.0,
      0.1, 0.2, 16,
      68719476736, 35914904305, 47.7,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2205258,"tx_bytes_rate":929469}]', '[{"device":"sda","read_iops":163,"write_iops":264,"io_util_pct":"25.2"}]', 986856,
      3.2, 3.7, 1.1,
      1.0, 0.1, 0.5,
      2.5, 3.8, 3.1,
      156, 61, 0, 215
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006295, 1.94, 1.75, 1.55, 38.8,
      0.0, 0.1, 16,
      68719476736, 39543324038, 42.5,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5946271,"tx_bytes_rate":1242606}]', '[{"device":"sda","read_iops":129,"write_iops":487,"io_util_pct":"21.8"}]', 986856,
      0.3, 1.2, 2.1,
      1.9, 1.2, 0.1,
      7.1, 3.1, 3.4,
      354, 54, 0, 256
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006325, 1.98, 1.78, 1.58, 39.6,
      0.8, 0.1, 16,
      68719476736, 44371056118, 35.4,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1161276,"tx_bytes_rate":1266699}]', '[{"device":"sda","read_iops":94,"write_iops":489,"io_util_pct":"10.7"}]', 986856,
      1.3, 0.2, 1.0,
      1.2, 0.4, 0.5,
      2.5, 1.3, 4.9,
      182, 29, 0, 235
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006355, 0.79, 0.71, 0.63, 15.8,
      0.0, 0.0, 16,
      68719476736, 39961710763, 41.8,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3949646,"tx_bytes_rate":2888234}]', '[{"device":"sda","read_iops":72,"write_iops":146,"io_util_pct":"17.4"}]', 986856,
      0.1, 3.3, 2.7,
      1.9, 0.0, 0.0,
      2.8, 7.0, 1.8,
      148, 35, 0, 496
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-01', 1789006385, 1.60, 1.44, 1.28, 32.0,
      1.4, 0.1, 16,
      68719476736, 41048430896, 40.3,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4099074,"tx_bytes_rate":1389107}]', '[{"device":"sda","read_iops":78,"write_iops":433,"io_util_pct":"1.9"}]', 986856,
      4.7, 0.9, 1.6,
      0.8, 0.6, 0.2,
      3.1, 0.8, 1.9,
      329, 34, 0, 354
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-redis-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"redis-cluster-01.cache.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.redis-cluster-01.cache.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-redis-02', 'redis-cluster-02.cache.hexly.ai', 'Ubuntu 22.04.4 LTS', '5.15.0-107-generic', 'x86_64', 'Intel Xeon Platinum 8280', 1788594786, 1789006409, 1789002815,
    1, 16, 8, 68719476736, 0, 'kvm',
    '10.0.2.2', '2.1.2', 'Core server deployed for redis-cluster-02',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.2.2"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":411629}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-redis-02', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-redis-02', 9);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-redis-02', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-redis-02', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-redis-02', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006115, 1.81, 1.63, 1.45, 36.2,
      0.1, 0.1, 16,
      68719476736, 41148008279, 40.1,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1667716,"tx_bytes_rate":1687315}]', '[{"device":"sda","read_iops":109,"write_iops":227,"io_util_pct":"12.2"}]', 411629,
      1.7, 3.6, 1.0,
      1.2, 1.1, 0.9,
      2.9, 2.2, 0.4,
      378, 61, 0, 272
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006145, 1.46, 1.31, 1.17, 29.1,
      1.2, 0.0, 16,
      68719476736, 43534572666, 36.6,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3049388,"tx_bytes_rate":2173772}]', '[{"device":"sda","read_iops":81,"write_iops":598,"io_util_pct":"1.1"}]', 411629,
      4.1, 3.8, 0.6,
      0.1, 0.3, 0.5,
      3.6, 1.5, 1.0,
      418, 42, 0, 275
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006175, 1.26, 1.13, 1.01, 25.3,
      1.2, 0.1, 16,
      68719476736, 35628211859, 48.2,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3469006,"tx_bytes_rate":2958721}]', '[{"device":"sda","read_iops":194,"write_iops":379,"io_util_pct":"24.7"}]', 411629,
      0.7, 0.1, 1.5,
      0.8, 1.4, 0.0,
      4.5, 4.1, 2.4,
      372, 43, 0, 308
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006205, 0.92, 0.83, 0.74, 18.4,
      1.0, 0.1, 16,
      68719476736, 40160481068, 41.6,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2326516,"tx_bytes_rate":1292309}]', '[{"device":"sda","read_iops":123,"write_iops":230,"io_util_pct":"5.3"}]', 411629,
      4.0, 3.7, 1.4,
      1.8, 0.0, 0.7,
      6.3, 4.4, 0.8,
      169, 46, 0, 224
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006235, 1.35, 1.22, 1.08, 27.0,
      1.2, 0.1, 16,
      68719476736, 40825144690, 40.6,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1559371,"tx_bytes_rate":2001696}]', '[{"device":"sda","read_iops":53,"write_iops":557,"io_util_pct":"2.6"}]', 411629,
      0.1, 1.8, 0.5,
      1.4, 0.9, 0.6,
      1.3, 3.3, 3.0,
      208, 52, 0, 161
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006265, 1.67, 1.50, 1.34, 33.5,
      1.3, 0.1, 16,
      68719476736, 37525006593, 45.4,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2778262,"tx_bytes_rate":2473735}]', '[{"device":"sda","read_iops":74,"write_iops":149,"io_util_pct":"21.3"}]', 411629,
      1.2, 2.0, 1.6,
      1.4, 0.2, 0.9,
      7.0, 7.3, 2.4,
      168, 49, 0, 485
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006295, 1.24, 1.12, 0.99, 24.7,
      1.4, 0.1, 16,
      68719476736, 35382341418, 48.5,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5575750,"tx_bytes_rate":1779045}]', '[{"device":"sda","read_iops":201,"write_iops":163,"io_util_pct":"12.1"}]', 411629,
      2.8, 3.8, 1.9,
      1.2, 0.6, 0.7,
      5.1, 2.5, 1.2,
      120, 41, 0, 413
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006325, 1.32, 1.19, 1.06, 26.5,
      1.3, 0.1, 16,
      68719476736, 43716033486, 36.4,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5848893,"tx_bytes_rate":1474208}]', '[{"device":"sda","read_iops":220,"write_iops":486,"io_util_pct":"27.2"}]', 411629,
      4.9, 2.3, 0.9,
      0.5, 0.5, 0.6,
      2.8, 1.9, 1.5,
      230, 47, 0, 185
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006355, 1.27, 1.14, 1.02, 25.5,
      1.4, 0.1, 16,
      68719476736, 36234833125, 47.3,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2880886,"tx_bytes_rate":1318230}]', '[{"device":"sda","read_iops":57,"write_iops":510,"io_util_pct":"14.0"}]', 411629,
      2.9, 2.5, 0.3,
      0.9, 0.3, 0.3,
      0.9, 6.4, 1.8,
      189, 33, 0, 424
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-redis-02', 1789006385, 1.02, 0.92, 0.82, 20.5,
      1.4, 0.0, 16,
      68719476736, 39512325958, 42.5,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3786082,"tx_bytes_rate":1926444}]', '[{"device":"sda","read_iops":199,"write_iops":492,"io_util_pct":"4.6"}]', 411629,
      2.7, 2.1, 0.9,
      1.5, 0.7, 0.2,
      5.8, 7.1, 3.4,
      219, 59, 0, 203
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-redis-02', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"redis-cluster-02.cache.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.redis-cluster-02.cache.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-clickhouse', 'clickhouse-olap.analytics.hexly.ai', 'Ubuntu 24.04.2 LTS', '6.8.0-45-generic', 'x86_64', 'AMD EPYC 7713 64-Core', 1786896910, 1789006399, 1789002815,
    1, 64, 32, 137438953472, 34359738368, 'bare-metal',
    '10.0.3.50', '2.1.2', 'Core server deployed for clickhouse-olap',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.3.50"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":2109505}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-clickhouse', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-clickhouse', 10);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-clickhouse', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-clickhouse', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-clickhouse', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006115, 1.65, 1.48, 1.32, 33.1,
      0.7, 0.1, 64,
      137438953472, 76302293048, 44.5,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4680669,"tx_bytes_rate":1564558}]', '[{"device":"sda","read_iops":97,"write_iops":587,"io_util_pct":"9.9"}]', 2109505,
      2.8, 0.5, 1.9,
      1.6, 1.4, 0.9,
      3.0, 2.0, 1.5,
      294, 33, 0, 388
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006145, 1.65, 1.48, 1.32, 33.0,
      0.1, 0.0, 64,
      137438953472, 74117809034, 46.1,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5934021,"tx_bytes_rate":1214758}]', '[{"device":"sda","read_iops":119,"write_iops":552,"io_util_pct":"29.7"}]', 2109505,
      3.5, 3.6, 1.0,
      1.1, 0.1, 0.4,
      4.5, 5.0, 3.6,
      353, 55, 0, 200
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006175, 1.84, 1.66, 1.47, 36.9,
      0.5, 0.0, 64,
      137438953472, 84128916368, 38.8,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5603278,"tx_bytes_rate":2060913}]', '[{"device":"sda","read_iops":82,"write_iops":156,"io_util_pct":"2.5"}]', 2109505,
      1.2, 0.9, 1.3,
      1.1, 1.1, 0.1,
      2.7, 1.6, 4.3,
      124, 60, 0, 339
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006205, 1.99, 1.79, 1.59, 39.9,
      1.1, 0.2, 64,
      137438953472, 89049413690, 35.2,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3705903,"tx_bytes_rate":501162}]', '[{"device":"sda","read_iops":164,"write_iops":451,"io_util_pct":"6.6"}]', 2109505,
      2.8, 2.4, 2.7,
      1.0, 1.1, 0.5,
      9.7, 0.4, 1.9,
      169, 52, 0, 241
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006235, 0.83, 0.75, 0.66, 16.7,
      1.1, 0.2, 64,
      137438953472, 84860482833, 38.3,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2387961,"tx_bytes_rate":2361952}]', '[{"device":"sda","read_iops":246,"write_iops":307,"io_util_pct":"0.2"}]', 2109505,
      0.3, 0.3, 2.7,
      1.1, 0.2, 0.3,
      0.1, 3.8, 3.5,
      163, 42, 0, 315
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006265, 1.85, 1.67, 1.48, 37.0,
      0.8, 0.1, 64,
      137438953472, 87645744901, 36.2,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1300675,"tx_bytes_rate":1285550}]', '[{"device":"sda","read_iops":239,"write_iops":437,"io_util_pct":"27.6"}]', 2109505,
      1.8, 1.1, 0.1,
      1.4, 1.2, 0.1,
      4.0, 5.5, 2.8,
      191, 45, 0, 473
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006295, 1.14, 1.03, 0.91, 22.8,
      0.4, 0.1, 64,
      137438953472, 79553246957, 42.1,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3307796,"tx_bytes_rate":1364216}]', '[{"device":"sda","read_iops":156,"write_iops":437,"io_util_pct":"27.7"}]', 2109505,
      3.0, 0.2, 2.5,
      0.9, 1.2, 0.1,
      3.7, 4.8, 2.4,
      202, 33, 0, 475
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006325, 1.84, 1.66, 1.47, 36.7,
      1.2, 0.1, 64,
      137438953472, 84487490719, 38.5,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2432590,"tx_bytes_rate":2677415}]', '[{"device":"sda","read_iops":107,"write_iops":473,"io_util_pct":"17.1"}]', 2109505,
      4.2, 0.0, 0.6,
      1.1, 0.3, 0.9,
      9.6, 7.3, 2.6,
      168, 24, 0, 401
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006355, 1.72, 1.55, 1.38, 34.4,
      0.7, 0.1, 64,
      137438953472, 75723166016, 44.9,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4655714,"tx_bytes_rate":607332}]', '[{"device":"sda","read_iops":164,"write_iops":468,"io_util_pct":"17.7"}]', 2109505,
      4.7, 1.2, 1.6,
      1.1, 1.4, 0.0,
      9.1, 3.6, 2.5,
      186, 52, 0, 346
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-clickhouse', 1789006385, 1.98, 1.78, 1.58, 39.5,
      0.5, 0.1, 64,
      137438953472, 74715870641, 45.6,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2334424,"tx_bytes_rate":1779587}]', '[{"device":"sda","read_iops":95,"write_iops":598,"io_util_pct":"20.6"}]', 2109505,
      1.1, 3.6, 0.9,
      0.7, 0.1, 0.2,
      4.2, 3.8, 3.5,
      364, 24, 0, 348
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-clickhouse', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"clickhouse-olap.analytics.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.clickhouse-olap.analytics.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-kafka-01', 'kafka-01.mq.hexly.ai', 'Red Hat Enterprise Linux 9.4', '5.14.0-427.el9.x86_64', 'x86_64', 'Intel Xeon Gold 6248R', 1787718295, 1789006401, 1789002815,
    1, 24, 12, 68719476736, 8589934592, 'kvm',
    '10.0.4.1', '2.1.1', 'Core server deployed for kafka-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.4.1"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1288120}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-kafka-01', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-kafka-01', 11);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-kafka-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-kafka-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-kafka-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006115, 1.45, 1.30, 1.16, 29.1,
      1.2, 0.2, 24,
      68719476736, 35927730986, 47.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1710274,"tx_bytes_rate":811109}]', '[{"device":"sda","read_iops":186,"write_iops":277,"io_util_pct":"22.6"}]', 1288120,
      1.3, 0.4, 1.0,
      1.7, 0.2, 0.2,
      1.4, 5.7, 2.4,
      318, 65, 0, 440
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006145, 1.95, 1.75, 1.56, 39.0,
      1.0, 0.1, 24,
      68719476736, 39192127294, 43.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5823584,"tx_bytes_rate":1872425}]', '[{"device":"sda","read_iops":149,"write_iops":445,"io_util_pct":"28.3"}]', 1288120,
      2.6, 2.7, 2.8,
      1.8, 0.3, 0.1,
      8.1, 5.1, 1.3,
      170, 33, 0, 203
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006175, 1.17, 1.05, 0.94, 23.4,
      0.5, 0.2, 24,
      68719476736, 43960059523, 36.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5508980,"tx_bytes_rate":1575829}]', '[{"device":"sda","read_iops":149,"write_iops":358,"io_util_pct":"13.5"}]', 1288120,
      1.0, 2.4, 1.8,
      1.2, 1.3, 0.3,
      7.1, 7.8, 3.5,
      395, 43, 0, 243
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006205, 1.34, 1.21, 1.07, 26.9,
      0.8, 0.1, 24,
      68719476736, 40741142964, 40.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5175063,"tx_bytes_rate":783320}]', '[{"device":"sda","read_iops":89,"write_iops":246,"io_util_pct":"29.3"}]', 1288120,
      3.6, 0.5, 0.5,
      0.5, 0.4, 0.4,
      4.7, 6.8, 0.1,
      234, 28, 0, 334
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006235, 1.78, 1.60, 1.42, 35.5,
      1.5, 0.0, 24,
      68719476736, 43996677355, 36.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4239689,"tx_bytes_rate":2032873}]', '[{"device":"sda","read_iops":74,"write_iops":557,"io_util_pct":"23.2"}]', 1288120,
      1.0, 0.6, 1.7,
      1.6, 1.1, 0.4,
      8.1, 7.3, 0.5,
      333, 39, 0, 279
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006265, 0.84, 0.76, 0.67, 16.8,
      1.1, 0.2, 24,
      68719476736, 40850251948, 40.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5983441,"tx_bytes_rate":755394}]', '[{"device":"sda","read_iops":117,"write_iops":163,"io_util_pct":"7.5"}]', 1288120,
      0.0, 1.9, 0.4,
      1.9, 0.3, 0.1,
      5.8, 1.0, 4.2,
      209, 50, 0, 294
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006295, 0.98, 0.88, 0.78, 19.5,
      1.1, 0.1, 24,
      68719476736, 41552724322, 39.5,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3306341,"tx_bytes_rate":982142}]', '[{"device":"sda","read_iops":126,"write_iops":287,"io_util_pct":"7.4"}]', 1288120,
      1.3, 2.6, 0.1,
      2.0, 0.8, 0.3,
      7.3, 3.8, 2.5,
      413, 36, 0, 472
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006325, 1.09, 0.98, 0.87, 21.8,
      1.1, 0.2, 24,
      68719476736, 38079544939, 44.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3899461,"tx_bytes_rate":1353123}]', '[{"device":"sda","read_iops":162,"write_iops":248,"io_util_pct":"23.5"}]', 1288120,
      2.2, 3.3, 0.4,
      0.7, 0.3, 0.1,
      7.7, 5.7, 4.3,
      362, 34, 0, 326
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006355, 1.10, 0.99, 0.88, 22.0,
      0.6, 0.0, 24,
      68719476736, 35063208192, 49.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3131705,"tx_bytes_rate":1862350}]', '[{"device":"sda","read_iops":144,"write_iops":388,"io_util_pct":"24.8"}]', 1288120,
      3.0, 1.5, 0.9,
      1.2, 1.0, 0.5,
      7.1, 3.3, 1.5,
      195, 22, 0, 370
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-01', 1789006385, 1.85, 1.67, 1.48, 37.0,
      1.0, 0.2, 24,
      68719476736, 39868238298, 42.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4872708,"tx_bytes_rate":2591631}]', '[{"device":"sda","read_iops":168,"write_iops":512,"io_util_pct":"26.1"}]', 1288120,
      4.1, 3.0, 2.9,
      1.9, 1.0, 0.0,
      6.6, 4.4, 2.3,
      390, 34, 0, 456
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-kafka-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"kafka-01.mq.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.kafka-01.mq.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-prod-kafka-02', 'kafka-02.mq.hexly.ai', 'Red Hat Enterprise Linux 9.4', '5.14.0-427.el9.x86_64', 'x86_64', 'Intel Xeon Gold 6248R', 1787679311, 1789006396, 1789002815,
    1, 24, 12, 68719476736, 8589934592, 'kvm',
    '10.0.4.2', '2.1.1', 'Core server deployed for kafka-02',
    '02:00', '06:00', 'Kernel upgrade and security patching window',
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.4.2"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1327104}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-kafka-02', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-prod-kafka-02', 11);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-kafka-02', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-kafka-02', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-prod-kafka-02', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006115, 1.49, 1.34, 1.19, 29.8,
      0.6, 0.1, 24,
      68719476736, 35132855978, 48.9,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3209893,"tx_bytes_rate":1160688}]', '[{"device":"sda","read_iops":62,"write_iops":580,"io_util_pct":"19.6"}]', 1327104,
      3.0, 0.1, 2.3,
      1.6, 1.3, 0.0,
      0.4, 6.5, 0.4,
      226, 54, 0, 226
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006145, 1.48, 1.33, 1.18, 29.6,
      0.9, 0.2, 24,
      68719476736, 42344753636, 38.4,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2726380,"tx_bytes_rate":2531806}]', '[{"device":"sda","read_iops":129,"write_iops":409,"io_util_pct":"5.9"}]', 1327104,
      3.2, 0.4, 0.7,
      2.0, 0.3, 0.4,
      2.7, 6.7, 1.6,
      388, 21, 0, 481
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006175, 1.62, 1.46, 1.30, 32.3,
      0.1, 0.1, 24,
      68719476736, 36656145507, 46.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5889033,"tx_bytes_rate":602253}]', '[{"device":"sda","read_iops":54,"write_iops":424,"io_util_pct":"4.3"}]', 1327104,
      3.0, 0.5, 1.8,
      0.3, 0.8, 0.5,
      7.1, 0.7, 3.3,
      141, 49, 0, 292
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006205, 0.94, 0.85, 0.75, 18.9,
      0.6, 0.1, 24,
      68719476736, 43502569785, 36.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4913669,"tx_bytes_rate":1524077}]', '[{"device":"sda","read_iops":239,"write_iops":244,"io_util_pct":"14.0"}]', 1327104,
      3.1, 1.9, 1.7,
      1.9, 0.9, 0.7,
      5.1, 0.2, 2.2,
      285, 67, 0, 292
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006235, 0.83, 0.75, 0.66, 16.5,
      0.1, 0.0, 24,
      68719476736, 35396086215, 48.5,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2687667,"tx_bytes_rate":1491959}]', '[{"device":"sda","read_iops":81,"write_iops":241,"io_util_pct":"22.0"}]', 1327104,
      1.5, 3.5, 0.0,
      1.9, 1.0, 0.4,
      0.5, 2.5, 1.5,
      355, 50, 0, 422
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006265, 1.92, 1.73, 1.54, 38.3,
      1.0, 0.0, 24,
      68719476736, 38366204367, 44.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4213438,"tx_bytes_rate":2258709}]', '[{"device":"sda","read_iops":175,"write_iops":327,"io_util_pct":"25.2"}]', 1327104,
      0.1, 3.2, 2.1,
      0.4, 0.2, 0.3,
      9.2, 3.6, 4.5,
      123, 50, 0, 221
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006295, 1.48, 1.33, 1.18, 29.6,
      0.3, 0.1, 24,
      68719476736, 42471263345, 38.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1298731,"tx_bytes_rate":1826321}]', '[{"device":"sda","read_iops":178,"write_iops":581,"io_util_pct":"6.6"}]', 1327104,
      2.0, 3.7, 1.2,
      1.5, 0.0, 0.1,
      6.1, 4.6, 0.7,
      169, 34, 0, 191
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006325, 1.20, 1.08, 0.96, 24.0,
      0.7, 0.1, 24,
      68719476736, 36577366523, 46.8,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4172503,"tx_bytes_rate":923607}]', '[{"device":"sda","read_iops":202,"write_iops":275,"io_util_pct":"13.6"}]', 1327104,
      2.4, 0.1, 2.6,
      1.4, 0.2, 0.4,
      2.8, 5.2, 4.7,
      397, 40, 0, 384
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006355, 1.85, 1.67, 1.48, 36.9,
      0.1, 0.0, 24,
      68719476736, 40422025539, 41.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2991783,"tx_bytes_rate":2610313}]', '[{"device":"sda","read_iops":171,"write_iops":575,"io_util_pct":"20.3"}]', 1327104,
      3.7, 0.9, 2.6,
      1.5, 0.9, 0.6,
      2.6, 6.3, 2.4,
      182, 46, 0, 420
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-prod-kafka-02', 1789006385, 1.68, 1.51, 1.34, 33.5,
      1.3, 0.0, 24,
      68719476736, 34904911072, 49.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2932750,"tx_bytes_rate":864790}]', '[{"device":"sda","read_iops":139,"write_iops":504,"io_util_pct":"25.2"}]', 1327104,
      3.7, 1.6, 1.4,
      1.9, 0.3, 0.4,
      3.1, 5.9, 3.2,
      273, 46, 0, 210
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-prod-kafka-02', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"kafka-02.mq.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.kafka-02.mq.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-stg-app-01', 'app-stg-01.staging.hexly.ai', 'Ubuntu 24.04.2 LTS', '6.8.0-45-generic', 'x86_64', 'Intel Xeon E5-2680 v4', 1788222203, 1789006393, 1789002815,
    1, 8, 4, 17179869184, 4294967296, 'kvm',
    '192.0.2.100', '2.1.2', 'Core server deployed for app-stg-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["192.0.2.100"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":784212}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-app-01', 2);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-app-01', 4);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-app-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-app-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-app-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006115, 1.20, 1.08, 0.96, 23.9,
      1.1, 0.1, 8,
      17179869184, 9461750910, 44.9,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1743981,"tx_bytes_rate":1070448}]', '[{"device":"sda","read_iops":115,"write_iops":325,"io_util_pct":"13.9"}]', 784212,
      1.2, 1.7, 0.9,
      0.0, 0.8, 1.0,
      9.5, 3.6, 1.5,
      384, 49, 0, 232
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006145, 1.70, 1.53, 1.36, 34.0,
      0.4, 0.0, 8,
      17179869184, 9491511887, 44.8,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3984413,"tx_bytes_rate":2360709}]', '[{"device":"sda","read_iops":133,"write_iops":271,"io_util_pct":"9.2"}]', 784212,
      0.3, 1.8, 0.5,
      1.5, 0.8, 0.8,
      5.8, 3.0, 1.9,
      142, 27, 0, 294
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006175, 1.93, 1.74, 1.54, 38.6,
      1.2, 0.1, 8,
      17179869184, 9149584091, 46.7,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4072495,"tx_bytes_rate":1258444}]', '[{"device":"sda","read_iops":241,"write_iops":404,"io_util_pct":"8.3"}]', 784212,
      1.8, 1.7, 2.9,
      1.8, 1.1, 0.9,
      5.6, 5.0, 0.9,
      387, 38, 0, 231
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006205, 1.02, 0.92, 0.82, 20.3,
      0.6, 0.1, 8,
      17179869184, 9465861662, 44.9,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4579142,"tx_bytes_rate":998624}]', '[{"device":"sda","read_iops":135,"write_iops":247,"io_util_pct":"25.1"}]', 784212,
      3.9, 0.8, 0.8,
      0.5, 0.4, 0.2,
      6.4, 5.3, 0.7,
      180, 68, 0, 497
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006235, 1.52, 1.37, 1.22, 30.4,
      0.8, 0.0, 8,
      17179869184, 10349853433, 39.8,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5014625,"tx_bytes_rate":2989372}]', '[{"device":"sda","read_iops":73,"write_iops":353,"io_util_pct":"14.0"}]', 784212,
      2.8, 0.5, 0.7,
      1.3, 0.4, 0.8,
      7.8, 7.9, 0.9,
      228, 25, 0, 383
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006265, 1.71, 1.54, 1.37, 34.2,
      0.1, 0.1, 8,
      17179869184, 9897903451, 42.4,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3226949,"tx_bytes_rate":701034}]', '[{"device":"sda","read_iops":91,"write_iops":412,"io_util_pct":"10.0"}]', 784212,
      3.4, 0.9, 1.3,
      1.9, 0.8, 0.1,
      2.4, 2.2, 3.4,
      131, 63, 0, 287
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006295, 1.31, 1.18, 1.05, 26.1,
      1.5, 0.2, 8,
      17179869184, 11031213529, 35.8,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1409834,"tx_bytes_rate":2102397}]', '[{"device":"sda","read_iops":104,"write_iops":429,"io_util_pct":"5.3"}]', 784212,
      1.1, 1.1, 2.8,
      1.6, 0.8, 0.3,
      2.3, 2.9, 4.6,
      135, 44, 0, 321
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006325, 1.91, 1.72, 1.53, 38.3,
      0.0, 0.1, 8,
      17179869184, 9916376237, 42.3,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4277858,"tx_bytes_rate":1139379}]', '[{"device":"sda","read_iops":234,"write_iops":146,"io_util_pct":"2.5"}]', 784212,
      0.7, 2.5, 0.4,
      1.6, 1.1, 0.0,
      10.0, 3.0, 3.4,
      224, 42, 0, 170
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006355, 1.43, 1.29, 1.14, 28.5,
      0.7, 0.1, 8,
      17179869184, 10713424721, 37.6,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3718121,"tx_bytes_rate":752741}]', '[{"device":"sda","read_iops":183,"write_iops":567,"io_util_pct":"0.6"}]', 784212,
      1.7, 2.4, 2.2,
      1.5, 0.7, 0.9,
      0.9, 2.4, 1.5,
      336, 24, 0, 353
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-01', 1789006385, 1.46, 1.31, 1.17, 29.2,
      0.5, 0.1, 8,
      17179869184, 11012473976, 35.9,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3112390,"tx_bytes_rate":2139044}]', '[{"device":"sda","read_iops":52,"write_iops":135,"io_util_pct":"7.7"}]', 784212,
      0.2, 3.1, 0.3,
      1.9, 0.4, 0.5,
      5.4, 6.8, 4.2,
      325, 53, 0, 345
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-stg-app-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"app-stg-01.staging.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.app-stg-01.staging.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-stg-app-02', 'app-stg-02.staging.hexly.ai', 'Ubuntu 24.04.2 LTS', '6.8.0-45-generic', 'x86_64', 'Intel Xeon E5-2680 v4', 1788099175, 1789006415, 1789002815,
    1, 8, 4, 17179869184, 4294967296, 'kvm',
    '192.0.2.101', '2.1.2', 'Core server deployed for app-stg-02',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["192.0.2.101"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":907240}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-app-02', 2);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-app-02', 4);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-app-02', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-app-02', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-app-02', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006115, 1.99, 1.79, 1.59, 39.8,
      0.3, 0.1, 8,
      17179869184, 8879768365, 48.3,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5185303,"tx_bytes_rate":2101533}]', '[{"device":"sda","read_iops":205,"write_iops":173,"io_util_pct":"9.9"}]', 907240,
      1.5, 3.5, 0.3,
      1.7, 1.4, 0.7,
      8.1, 0.7, 1.3,
      280, 28, 0, 377
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006145, 1.43, 1.29, 1.14, 28.5,
      0.8, 0.0, 8,
      17179869184, 9117488525, 46.9,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5820434,"tx_bytes_rate":1000888}]', '[{"device":"sda","read_iops":70,"write_iops":365,"io_util_pct":"11.8"}]', 907240,
      3.9, 2.3, 1.1,
      1.9, 0.5, 0.3,
      1.5, 2.7, 1.3,
      234, 20, 0, 294
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006175, 1.16, 1.04, 0.93, 23.3,
      0.0, 0.0, 8,
      17179869184, 8929798800, 48.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3340053,"tx_bytes_rate":1354313}]', '[{"device":"sda","read_iops":59,"write_iops":162,"io_util_pct":"6.7"}]', 907240,
      2.5, 1.5, 1.4,
      1.2, 1.2, 0.4,
      7.4, 7.2, 4.6,
      418, 37, 0, 268
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006205, 1.16, 1.04, 0.93, 23.3,
      0.9, 0.1, 8,
      17179869184, 9310947376, 45.8,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4115950,"tx_bytes_rate":1758835}]', '[{"device":"sda","read_iops":248,"write_iops":395,"io_util_pct":"15.4"}]', 907240,
      0.3, 0.4, 1.4,
      0.8, 1.2, 0.5,
      0.1, 3.9, 4.1,
      232, 48, 0, 384
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006235, 1.13, 1.02, 0.90, 22.6,
      1.4, 0.0, 8,
      17179869184, 10982445192, 36.1,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1030331,"tx_bytes_rate":1458334}]', '[{"device":"sda","read_iops":140,"write_iops":381,"io_util_pct":"7.2"}]', 907240,
      5.0, 2.9, 1.6,
      1.1, 0.1, 0.4,
      7.5, 4.8, 1.8,
      321, 41, 0, 273
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006265, 1.63, 1.47, 1.30, 32.7,
      1.3, 0.1, 8,
      17179869184, 9917971892, 42.3,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3255013,"tx_bytes_rate":544556}]', '[{"device":"sda","read_iops":163,"write_iops":499,"io_util_pct":"11.2"}]', 907240,
      4.0, 0.7, 1.5,
      1.1, 0.6, 0.2,
      2.5, 0.5, 1.4,
      147, 27, 0, 476
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006295, 1.48, 1.33, 1.18, 29.5,
      0.2, 0.0, 8,
      17179869184, 10329126090, 39.9,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4437614,"tx_bytes_rate":1517828}]', '[{"device":"sda","read_iops":62,"write_iops":269,"io_util_pct":"6.9"}]', 907240,
      4.7, 1.8, 2.3,
      1.7, 1.2, 0.9,
      3.3, 6.3, 0.5,
      259, 35, 0, 386
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006325, 1.36, 1.22, 1.09, 27.1,
      0.3, 0.1, 8,
      17179869184, 10615312917, 38.2,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2038973,"tx_bytes_rate":1849230}]', '[{"device":"sda","read_iops":130,"write_iops":568,"io_util_pct":"21.9"}]', 907240,
      4.8, 2.9, 0.8,
      0.5, 0.2, 0.4,
      3.3, 0.2, 3.4,
      358, 26, 0, 398
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006355, 1.68, 1.51, 1.34, 33.5,
      1.3, 0.1, 8,
      17179869184, 9281135544, 46.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5678608,"tx_bytes_rate":1300747}]', '[{"device":"sda","read_iops":213,"write_iops":485,"io_util_pct":"29.9"}]', 907240,
      4.9, 2.1, 2.9,
      0.8, 0.7, 0.2,
      1.6, 5.6, 1.9,
      406, 59, 0, 374
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-app-02', 1789006385, 0.99, 0.89, 0.79, 19.9,
      0.7, 0.2, 8,
      17179869184, 9712895060, 43.5,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4572755,"tx_bytes_rate":2691611}]', '[{"device":"sda","read_iops":106,"write_iops":122,"io_util_pct":"29.9"}]', 907240,
      1.9, 1.3, 0.6,
      0.9, 0.4, 0.9,
      5.5, 0.6, 3.9,
      222, 53, 0, 277
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-stg-app-02', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"app-stg-02.staging.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.app-stg-02.staging.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-stg-db-01', 'pg-stg-01.staging.hexly.ai', 'Debian 12.7', '6.1.0-25-amd64', 'x86_64', 'Intel Xeon E-2388G', 1788820008, 1789006394, 1789002815,
    1, 16, 8, 34359738368, 8589934592, 'kvm',
    '192.0.2.105', '2.1.2', 'Core server deployed for pg-stg-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["192.0.2.105"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":186407}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-db-01', 2);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-db-01', 8);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-db-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-db-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-db-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006115, 1.62, 1.46, 1.30, 32.5,
      1.4, 0.1, 16,
      34359738368, 22066776348, 35.8,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2949984,"tx_bytes_rate":2692108}]', '[{"device":"sda","read_iops":85,"write_iops":288,"io_util_pct":"25.3"}]', 186407,
      2.4, 2.2, 0.9,
      1.0, 0.6, 0.5,
      0.6, 2.7, 2.7,
      224, 62, 0, 223
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006145, 1.36, 1.22, 1.09, 27.1,
      0.3, 0.1, 16,
      34359738368, 17271888305, 49.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1460014,"tx_bytes_rate":1185749}]', '[{"device":"sda","read_iops":196,"write_iops":175,"io_util_pct":"20.5"}]', 186407,
      3.1, 3.4, 1.7,
      1.2, 1.5, 0.1,
      9.1, 0.7, 2.5,
      140, 47, 0, 379
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006175, 1.19, 1.07, 0.95, 23.8,
      0.4, 0.1, 16,
      34359738368, 22303058759, 35.1,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4710131,"tx_bytes_rate":2825758}]', '[{"device":"sda","read_iops":201,"write_iops":222,"io_util_pct":"14.1"}]', 186407,
      3.8, 3.3, 1.9,
      0.9, 1.3, 0.1,
      3.0, 5.8, 1.5,
      407, 49, 0, 438
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006205, 1.55, 1.40, 1.24, 31.1,
      0.6, 0.0, 16,
      34359738368, 19965000569, 41.9,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4074774,"tx_bytes_rate":1318213}]', '[{"device":"sda","read_iops":152,"write_iops":393,"io_util_pct":"2.1"}]', 186407,
      0.3, 3.3, 1.7,
      0.2, 1.0, 1.0,
      0.3, 4.1, 4.6,
      267, 69, 0, 407
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006235, 1.64, 1.48, 1.31, 32.9,
      0.5, 0.2, 16,
      34359738368, 21246456345, 38.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5289555,"tx_bytes_rate":1625842}]', '[{"device":"sda","read_iops":141,"write_iops":295,"io_util_pct":"17.3"}]', 186407,
      2.5, 3.7, 1.1,
      1.3, 0.1, 0.3,
      7.2, 0.5, 1.1,
      212, 55, 0, 218
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006265, 1.84, 1.66, 1.47, 36.8,
      0.4, 0.2, 16,
      34359738368, 17445045779, 49.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1515573,"tx_bytes_rate":2367174}]', '[{"device":"sda","read_iops":239,"write_iops":308,"io_util_pct":"4.6"}]', 186407,
      3.7, 2.1, 0.3,
      0.2, 1.1, 0.9,
      2.8, 6.6, 2.4,
      260, 38, 0, 378
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006295, 1.44, 1.30, 1.15, 28.7,
      0.5, 0.1, 16,
      34359738368, 18769752781, 45.4,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5893283,"tx_bytes_rate":1754565}]', '[{"device":"sda","read_iops":176,"write_iops":592,"io_util_pct":"16.5"}]', 186407,
      2.8, 0.0, 0.1,
      1.6, 0.4, 0.1,
      0.5, 6.0, 3.5,
      219, 59, 0, 222
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006325, 1.31, 1.18, 1.05, 26.2,
      0.4, 0.1, 16,
      34359738368, 20055430695, 41.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4669114,"tx_bytes_rate":2125340}]', '[{"device":"sda","read_iops":202,"write_iops":530,"io_util_pct":"5.2"}]', 186407,
      0.3, 1.2, 0.6,
      0.7, 0.7, 0.4,
      7.7, 6.3, 2.7,
      258, 61, 0, 450
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006355, 1.80, 1.62, 1.44, 36.1,
      1.0, 0.0, 16,
      34359738368, 17796526904, 48.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1080618,"tx_bytes_rate":2589178}]', '[{"device":"sda","read_iops":192,"write_iops":238,"io_util_pct":"16.7"}]', 186407,
      2.5, 3.6, 0.7,
      0.1, 1.4, 0.2,
      9.4, 4.1, 3.3,
      165, 63, 0, 255
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-db-01', 1789006385, 0.98, 0.88, 0.78, 19.5,
      0.7, 0.1, 16,
      34359738368, 19196262941, 44.1,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4294317,"tx_bytes_rate":933370}]', '[{"device":"sda","read_iops":211,"write_iops":340,"io_util_pct":"4.9"}]', 186407,
      2.0, 2.4, 1.0,
      1.5, 1.2, 0.2,
      8.7, 4.4, 2.9,
      276, 27, 0, 443
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-stg-db-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"pg-stg-01.staging.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.pg-stg-01.staging.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-stg-redis-01', 'redis-stg.staging.hexly.ai', 'Ubuntu 22.04.4 LTS', '5.15.0-107-generic', 'x86_64', 'Intel Xeon Platinum 8280', 1787303440, 1789006402, 1789002815,
    1, 4, 2, 8589934592, 0, 'kvm',
    '192.0.2.110', '2.1.1', 'Core server deployed for redis-stg',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["192.0.2.110"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1702975}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-redis-01', 2);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-redis-01', 9);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-redis-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-redis-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-redis-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006115, 1.83, 1.65, 1.46, 36.6,
      1.3, 0.1, 4,
      8589934592, 4399857586, 48.8,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2171520,"tx_bytes_rate":2554627}]', '[{"device":"sda","read_iops":152,"write_iops":300,"io_util_pct":"27.9"}]', 1702975,
      1.4, 0.8, 0.9,
      0.5, 1.5, 0.3,
      5.2, 5.2, 3.4,
      198, 22, 0, 182
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006145, 0.99, 0.89, 0.79, 19.7,
      0.8, 0.1, 4,
      8589934592, 5514082496, 35.8,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2743395,"tx_bytes_rate":1101610}]', '[{"device":"sda","read_iops":245,"write_iops":457,"io_util_pct":"12.5"}]', 1702975,
      4.7, 2.0, 1.3,
      0.3, 0.0, 0.8,
      8.5, 1.2, 4.6,
      219, 61, 0, 477
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006175, 1.31, 1.18, 1.05, 26.3,
      0.9, 0.1, 4,
      8589934592, 5424134378, 36.9,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2196272,"tx_bytes_rate":2536668}]', '[{"device":"sda","read_iops":91,"write_iops":163,"io_util_pct":"20.8"}]', 1702975,
      2.5, 2.8, 0.9,
      1.5, 1.3, 0.0,
      0.1, 2.5, 1.1,
      239, 56, 0, 258
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006205, 1.84, 1.66, 1.47, 36.8,
      1.1, 0.0, 4,
      8589934592, 5568503415, 35.2,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2540496,"tx_bytes_rate":1902179}]', '[{"device":"sda","read_iops":108,"write_iops":187,"io_util_pct":"4.3"}]', 1702975,
      1.7, 1.3, 1.7,
      0.6, 1.4, 0.7,
      3.5, 1.4, 2.3,
      370, 65, 0, 152
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006235, 0.94, 0.85, 0.75, 18.8,
      0.4, 0.0, 4,
      8589934592, 4629775085, 46.1,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2686716,"tx_bytes_rate":2701128}]', '[{"device":"sda","read_iops":234,"write_iops":252,"io_util_pct":"12.5"}]', 1702975,
      4.3, 1.7, 2.6,
      1.2, 1.1, 0.6,
      5.3, 1.2, 4.2,
      215, 27, 0, 392
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006265, 1.38, 1.24, 1.10, 27.7,
      1.4, 0.0, 4,
      8589934592, 5202801007, 39.4,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2580150,"tx_bytes_rate":1156204}]', '[{"device":"sda","read_iops":70,"write_iops":199,"io_util_pct":"27.1"}]', 1702975,
      3.3, 0.8, 1.7,
      1.5, 1.3, 0.5,
      3.5, 3.3, 4.5,
      307, 57, 0, 219
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006295, 1.33, 1.20, 1.06, 26.5,
      1.5, 0.1, 4,
      8589934592, 5050891511, 41.2,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1769309,"tx_bytes_rate":911540}]', '[{"device":"sda","read_iops":235,"write_iops":108,"io_util_pct":"2.1"}]', 1702975,
      4.2, 2.1, 1.8,
      1.5, 0.1, 0.9,
      0.7, 5.3, 0.8,
      378, 20, 0, 308
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006325, 0.85, 0.77, 0.68, 17.0,
      1.1, 0.0, 4,
      8589934592, 4676132367, 45.6,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1082781,"tx_bytes_rate":2362913}]', '[{"device":"sda","read_iops":225,"write_iops":256,"io_util_pct":"29.8"}]', 1702975,
      1.2, 0.5, 0.0,
      0.6, 0.7, 0.5,
      6.2, 4.1, 4.3,
      314, 41, 0, 208
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006355, 1.47, 1.32, 1.18, 29.5,
      0.6, 0.2, 4,
      8589934592, 4468337424, 48.0,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2999581,"tx_bytes_rate":1783717}]', '[{"device":"sda","read_iops":128,"write_iops":356,"io_util_pct":"18.6"}]', 1702975,
      3.9, 0.2, 2.0,
      0.9, 1.4, 1.0,
      6.6, 7.0, 0.6,
      357, 65, 0, 211
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-redis-01', 1789006385, 1.64, 1.48, 1.31, 32.7,
      0.8, 0.1, 4,
      8589934592, 4786180127, 44.3,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1907904,"tx_bytes_rate":2673511}]', '[{"device":"sda","read_iops":121,"write_iops":434,"io_util_pct":"18.2"}]', 1702975,
      1.5, 3.1, 1.9,
      0.6, 0.1, 0.9,
      9.2, 4.8, 1.5,
      199, 42, 0, 318
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-stg-redis-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"redis-stg.staging.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.redis-stg.staging.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-qa-runner-01', 'qa-runner-01.ci.hexly.ai', 'Fedora Linux 40', '6.9.12-200.fc40.x86_64', 'x86_64', 'AMD Ryzen 9 5950X', 1787450356, 1789006415, 1789002815,
    1, 32, 16, 67108864000, 16777216000, 'bare-metal',
    '198.51.100.55', '2.1.2', 'Core server deployed for qa-runner-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["198.51.100.55"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1556059}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-qa-runner-01', 2);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-qa-runner-01', 12);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-qa-runner-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-qa-runner-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-qa-runner-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006115, 1.28, 1.15, 1.02, 25.6,
      0.2, 0.0, 32,
      67108864000, 43095590187, 35.8,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4984559,"tx_bytes_rate":1841746}]', '[{"device":"sda","read_iops":210,"write_iops":162,"io_util_pct":"4.9"}]', 1556059,
      0.3, 1.9, 1.7,
      0.1, 1.1, 0.0,
      8.1, 3.4, 2.1,
      397, 32, 0, 393
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006145, 0.83, 0.75, 0.66, 16.7,
      0.7, 0.1, 32,
      67108864000, 35937416225, 46.4,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4692633,"tx_bytes_rate":2157497}]', '[{"device":"sda","read_iops":100,"write_iops":557,"io_util_pct":"23.8"}]', 1556059,
      0.6, 0.5, 0.3,
      1.2, 1.4, 0.9,
      0.7, 0.6, 4.0,
      338, 20, 0, 454
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006175, 1.42, 1.28, 1.14, 28.3,
      0.4, 0.1, 32,
      67108864000, 43513932437, 35.2,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5675894,"tx_bytes_rate":2346560}]', '[{"device":"sda","read_iops":75,"write_iops":259,"io_util_pct":"11.8"}]', 1556059,
      0.1, 0.1, 2.5,
      0.5, 0.5, 0.2,
      0.2, 6.0, 2.7,
      398, 26, 0, 475
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006205, 1.48, 1.33, 1.18, 29.6,
      0.0, 0.1, 32,
      67108864000, 43486154922, 35.2,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1714995,"tx_bytes_rate":1428816}]', '[{"device":"sda","read_iops":55,"write_iops":593,"io_util_pct":"27.5"}]', 1556059,
      1.9, 2.0, 1.2,
      1.6, 1.2, 0.1,
      9.4, 6.9, 2.9,
      227, 42, 0, 246
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006235, 1.83, 1.65, 1.46, 36.7,
      1.1, 0.2, 32,
      67108864000, 41801074581, 37.7,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2632774,"tx_bytes_rate":2383541}]', '[{"device":"sda","read_iops":205,"write_iops":419,"io_util_pct":"27.9"}]', 1556059,
      0.1, 0.8, 0.2,
      1.6, 0.8, 0.5,
      3.0, 2.6, 2.6,
      214, 29, 0, 423
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006265, 1.01, 0.91, 0.81, 20.2,
      0.2, 0.2, 32,
      67108864000, 42826098658, 36.2,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1417900,"tx_bytes_rate":845908}]', '[{"device":"sda","read_iops":168,"write_iops":201,"io_util_pct":"27.8"}]', 1556059,
      3.8, 3.4, 2.6,
      1.4, 0.9, 0.1,
      3.2, 5.4, 0.9,
      294, 33, 0, 329
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006295, 1.02, 0.92, 0.82, 20.3,
      1.4, 0.0, 32,
      67108864000, 34612021147, 48.4,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4271614,"tx_bytes_rate":1673766}]', '[{"device":"sda","read_iops":228,"write_iops":333,"io_util_pct":"3.4"}]', 1556059,
      3.8, 0.5, 1.9,
      0.5, 0.2, 0.1,
      6.8, 2.0, 2.0,
      253, 29, 0, 346
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006325, 1.88, 1.69, 1.50, 37.6,
      0.6, 0.2, 32,
      67108864000, 43412211394, 35.3,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2156305,"tx_bytes_rate":1505560}]', '[{"device":"sda","read_iops":233,"write_iops":409,"io_util_pct":"15.5"}]', 1556059,
      3.3, 3.3, 0.8,
      0.6, 1.5, 0.4,
      3.2, 2.7, 1.7,
      149, 53, 0, 170
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006355, 1.03, 0.93, 0.82, 20.6,
      0.6, 0.1, 32,
      67108864000, 36108576796, 46.2,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4871505,"tx_bytes_rate":556295}]', '[{"device":"sda","read_iops":213,"write_iops":562,"io_util_pct":"1.1"}]', 1556059,
      0.2, 3.7, 1.4,
      1.8, 0.2, 1.0,
      6.1, 5.5, 3.0,
      379, 53, 0, 376
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-01', 1789006385, 1.80, 1.62, 1.44, 36.1,
      0.7, 0.1, 32,
      67108864000, 34647950793, 48.4,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4179683,"tx_bytes_rate":2236030}]', '[{"device":"sda","read_iops":212,"write_iops":149,"io_util_pct":"6.2"}]', 1556059,
      1.7, 2.2, 1.7,
      1.9, 0.1, 0.4,
      3.0, 6.2, 1.6,
      303, 41, 0, 492
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-qa-runner-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"qa-runner-01.ci.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.qa-runner-01.ci.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-qa-runner-02', 'qa-runner-02.ci.hexly.ai', 'Fedora Linux 40', '6.9.12-200.fc40.x86_64', 'x86_64', 'AMD Ryzen 9 5950X', 1786681681, 1789006407, 1789002815,
    1, 32, 16, 67108864000, 16777216000, 'bare-metal',
    '198.51.100.56', '2.1.2', 'Core server deployed for qa-runner-02',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["198.51.100.56"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":2324734}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-qa-runner-02', 2);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-qa-runner-02', 12);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-qa-runner-02', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-qa-runner-02', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-qa-runner-02', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006115, 3.69, 3.32, 2.95, 73.8,
      0.6, 0.1, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1720553,"tx_bytes_rate":918919}]', '[{"device":"sda","read_iops":163,"write_iops":396,"io_util_pct":"7.1"}]', 2324734,
      2.4, 1.9, 2.8,
      0.2, 1.3, 0.6,
      3.7, 4.9, 4.2,
      154, 55, 0, 302
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006145, 3.68, 3.31, 2.94, 73.7,
      1.5, 0.0, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5388239,"tx_bytes_rate":689978}]', '[{"device":"sda","read_iops":98,"write_iops":190,"io_util_pct":"29.2"}]', 2324734,
      4.5, 3.0, 1.4,
      0.6, 1.0, 0.3,
      6.5, 5.3, 2.2,
      387, 49, 0, 451
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006175, 3.27, 2.94, 2.62, 65.4,
      0.9, 0.1, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4524315,"tx_bytes_rate":2417956}]', '[{"device":"sda","read_iops":124,"write_iops":360,"io_util_pct":"15.0"}]', 2324734,
      0.6, 0.8, 2.3,
      1.6, 1.3, 0.2,
      0.7, 4.7, 3.2,
      242, 44, 0, 479
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006205, 3.70, 3.33, 2.96, 74.1,
      1.3, 0.2, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5192715,"tx_bytes_rate":892975}]', '[{"device":"sda","read_iops":104,"write_iops":198,"io_util_pct":"1.3"}]', 2324734,
      2.5, 3.2, 1.6,
      0.7, 0.5, 0.3,
      4.3, 0.8, 2.2,
      264, 34, 0, 350
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006235, 3.42, 3.08, 2.74, 68.5,
      0.7, 0.1, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5510822,"tx_bytes_rate":2345243}]', '[{"device":"sda","read_iops":164,"write_iops":255,"io_util_pct":"22.7"}]', 2324734,
      1.5, 2.6, 2.0,
      1.3, 1.2, 0.6,
      3.2, 7.2, 4.7,
      401, 25, 0, 187
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006265, 3.70, 3.33, 2.96, 74.0,
      0.4, 0.1, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4655631,"tx_bytes_rate":2388217}]', '[{"device":"sda","read_iops":123,"write_iops":283,"io_util_pct":"13.3"}]', 2324734,
      0.2, 0.1, 1.8,
      0.7, 0.7, 0.2,
      3.1, 3.2, 2.5,
      410, 50, 0, 189
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006295, 3.74, 3.37, 2.99, 74.7,
      0.5, 0.1, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1138776,"tx_bytes_rate":533130}]', '[{"device":"sda","read_iops":126,"write_iops":594,"io_util_pct":"8.4"}]', 2324734,
      4.6, 1.0, 2.5,
      1.0, 0.5, 0.6,
      3.3, 1.1, 4.7,
      123, 61, 0, 451
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006325, 3.49, 3.14, 2.79, 69.8,
      0.6, 0.2, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5035049,"tx_bytes_rate":1305710}]', '[{"device":"sda","read_iops":245,"write_iops":289,"io_util_pct":"23.9"}]', 2324734,
      4.5, 1.5, 1.2,
      1.7, 0.7, 0.5,
      0.5, 0.2, 2.5,
      145, 58, 0, 408
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006355, 3.60, 3.24, 2.88, 71.9,
      0.5, 0.1, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5541132,"tx_bytes_rate":2700180}]', '[{"device":"sda","read_iops":150,"write_iops":503,"io_util_pct":"6.4"}]', 2324734,
      1.4, 3.0, 0.1,
      0.8, 0.2, 0.9,
      8.1, 1.6, 0.2,
      211, 51, 0, 306
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-qa-runner-02', 1789006385, 3.64, 3.28, 2.91, 72.8,
      0.0, 0.0, 32,
      67108864000, 14763950079, 78.0,
      16777216000, 1677721600, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2594753,"tx_bytes_rate":2620689}]', '[{"device":"sda","read_iops":53,"write_iops":118,"io_util_pct":"22.6"}]', 2324734,
      1.7, 1.1, 2.1,
      2.0, 0.9, 0.6,
      5.8, 3.8, 0.9,
      147, 51, 0, 183
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-qa-runner-02', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"qa-runner-02.ci.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.qa-runner-02.ci.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
      VALUES ('srv-qa-runner-02', 'mem_high', 'warning', 78.4, 1789005965, 'Memory usage is elevated at 78.4% (threshold 75%)');
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-stg-mock-svc', 'mock-services.staging.hexly.ai', 'Alpine Linux 3.20.2', '6.6.47-0-virt', 'x86_64', 'Intel Xeon Silver 4210', 1787691181, 1789006408, 1789002815,
    1, 4, 2, 4294967296, 2147483648, 'kvm',
    '192.0.2.120', '2.0.3', 'Core server deployed for mock-services',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["192.0.2.120"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1315234}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-mock-svc', 2);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-mock-svc', 6);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-mock-svc', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-mock-svc', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-mock-svc', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006115, 1.51, 1.36, 1.21, 30.1,
      0.9, 0.0, 4,
      4294967296, 2323506061, 45.9,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5448879,"tx_bytes_rate":2255731}]', '[{"device":"sda","read_iops":222,"write_iops":212,"io_util_pct":"8.1"}]', 1315234,
      3.6, 3.7, 0.3,
      0.8, 0.8, 0.9,
      4.7, 7.9, 2.4,
      135, 51, 0, 259
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006145, 1.22, 1.10, 0.98, 24.5,
      1.0, 0.1, 4,
      4294967296, 2390911361, 44.3,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1891243,"tx_bytes_rate":1464818}]', '[{"device":"sda","read_iops":56,"write_iops":367,"io_util_pct":"1.3"}]', 1315234,
      2.9, 1.6, 0.1,
      1.1, 1.2, 0.5,
      1.1, 2.6, 0.2,
      371, 30, 0, 460
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006175, 1.14, 1.03, 0.91, 22.8,
      0.2, 0.0, 4,
      4294967296, 2286681262, 46.8,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4695522,"tx_bytes_rate":2723312}]', '[{"device":"sda","read_iops":50,"write_iops":313,"io_util_pct":"14.7"}]', 1315234,
      0.2, 3.6, 1.2,
      1.9, 0.6, 0.2,
      3.2, 4.4, 3.3,
      276, 27, 0, 261
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006205, 1.27, 1.14, 1.02, 25.4,
      0.7, 0.1, 4,
      4294967296, 2470713499, 42.5,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3078640,"tx_bytes_rate":840259}]', '[{"device":"sda","read_iops":198,"write_iops":304,"io_util_pct":"1.1"}]', 1315234,
      4.2, 3.7, 0.4,
      1.1, 0.2, 0.3,
      4.0, 2.4, 2.3,
      339, 65, 0, 292
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006235, 1.29, 1.16, 1.03, 25.8,
      0.6, 0.1, 4,
      4294967296, 2750205696, 36.0,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4996666,"tx_bytes_rate":1698430}]', '[{"device":"sda","read_iops":78,"write_iops":292,"io_util_pct":"28.2"}]', 1315234,
      1.9, 2.5, 1.2,
      0.6, 1.3, 0.8,
      3.2, 7.0, 3.3,
      391, 25, 0, 489
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006265, 0.83, 0.75, 0.66, 16.6,
      0.3, 0.0, 4,
      4294967296, 2585619539, 39.8,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4999490,"tx_bytes_rate":1283974}]', '[{"device":"sda","read_iops":144,"write_iops":401,"io_util_pct":"27.9"}]', 1315234,
      0.1, 2.0, 0.6,
      1.2, 0.7, 0.7,
      1.0, 5.1, 1.5,
      238, 38, 0, 463
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006295, 1.21, 1.09, 0.97, 24.3,
      0.6, 0.1, 4,
      4294967296, 2249198168, 47.6,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1855628,"tx_bytes_rate":1796075}]', '[{"device":"sda","read_iops":111,"write_iops":244,"io_util_pct":"4.1"}]', 1315234,
      3.8, 3.3, 0.6,
      1.9, 0.3, 0.1,
      9.2, 6.2, 2.1,
      309, 44, 0, 412
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006325, 1.96, 1.76, 1.57, 39.1,
      0.7, 0.0, 4,
      4294967296, 2553516168, 40.5,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3024477,"tx_bytes_rate":2516714}]', '[{"device":"sda","read_iops":168,"write_iops":496,"io_util_pct":"0.7"}]', 1315234,
      1.4, 3.2, 1.1,
      1.8, 0.4, 0.4,
      2.6, 1.4, 0.9,
      318, 59, 0, 420
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006355, 1.16, 1.04, 0.93, 23.2,
      0.8, 0.2, 4,
      4294967296, 2563297666, 40.3,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2010234,"tx_bytes_rate":2853346}]', '[{"device":"sda","read_iops":209,"write_iops":450,"io_util_pct":"28.8"}]', 1315234,
      3.7, 2.1, 2.6,
      1.7, 1.0, 0.1,
      1.2, 0.4, 1.2,
      367, 53, 0, 386
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-mock-svc', 1789006385, 1.19, 1.07, 0.95, 23.9,
      0.5, 0.1, 4,
      4294967296, 2153810334, 49.9,
      2147483648, 214748364, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2305768,"tx_bytes_rate":1815888}]', '[{"device":"sda","read_iops":218,"write_iops":141,"io_util_pct":"10.2"}]', 1315234,
      2.9, 0.4, 3.0,
      1.1, 1.0, 0.7,
      2.0, 6.3, 3.8,
      311, 65, 0, 420
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-stg-mock-svc', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"mock-services.staging.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.mock-services.staging.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-stg-k8s-master', 'k8s-cp-01.staging.hexly.ai', 'Ubuntu 22.04.4 LTS', '5.15.0-107-generic', 'x86_64', 'AMD EPYC 7002', 1788064667, 1789002815, 1789002815,
    1, 8, 4, 17179869184, 0, 'kvm',
    '192.0.2.150', '2.1.2', 'Core server deployed for k8s-cp-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["192.0.2.150"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":941748}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-k8s-master', 2);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-stg-k8s-master', 13);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-k8s-master', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-k8s-master', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-stg-k8s-master', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006115, 1.30, 1.17, 1.04, 26.0,
      1.3, 0.1, 8,
      17179869184, 10172757963, 40.8,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2663386,"tx_bytes_rate":1202609}]', '[{"device":"sda","read_iops":55,"write_iops":537,"io_util_pct":"4.9"}]', 941748,
      3.3, 3.9, 0.8,
      1.9, 0.1, 0.5,
      2.6, 2.1, 0.5,
      141, 61, 0, 168
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006145, 1.56, 1.40, 1.25, 31.2,
      1.5, 0.0, 8,
      17179869184, 9502499577, 44.7,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3088546,"tx_bytes_rate":2111747}]', '[{"device":"sda","read_iops":166,"write_iops":348,"io_util_pct":"18.7"}]', 941748,
      1.0, 3.8, 1.9,
      1.8, 0.5, 0.6,
      3.7, 3.0, 2.4,
      145, 22, 0, 194
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006175, 1.24, 1.12, 0.99, 24.8,
      1.5, 0.0, 8,
      17179869184, 11100644818, 35.4,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3385392,"tx_bytes_rate":1039298}]', '[{"device":"sda","read_iops":108,"write_iops":131,"io_util_pct":"8.3"}]', 941748,
      1.0, 0.6, 0.6,
      0.9, 0.6, 0.2,
      9.1, 4.2, 1.5,
      279, 65, 0, 387
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006205, 1.31, 1.18, 1.05, 26.2,
      1.1, 0.0, 8,
      17179869184, 10008328089, 41.7,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2915787,"tx_bytes_rate":1829528}]', '[{"device":"sda","read_iops":66,"write_iops":408,"io_util_pct":"4.3"}]', 941748,
      4.4, 3.8, 1.8,
      0.0, 0.9, 0.5,
      6.4, 0.9, 1.8,
      187, 60, 0, 475
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006235, 1.24, 1.12, 0.99, 24.8,
      1.0, 0.1, 8,
      17179869184, 8824998450, 48.6,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1471310,"tx_bytes_rate":1037441}]', '[{"device":"sda","read_iops":181,"write_iops":518,"io_util_pct":"10.6"}]', 941748,
      2.2, 3.2, 2.0,
      0.1, 0.7, 0.2,
      4.2, 5.9, 2.4,
      239, 55, 0, 390
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006265, 1.44, 1.30, 1.15, 28.7,
      0.8, 0.1, 8,
      17179869184, 10469293201, 39.1,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4085655,"tx_bytes_rate":766906}]', '[{"device":"sda","read_iops":101,"write_iops":592,"io_util_pct":"25.2"}]', 941748,
      0.4, 2.3, 2.7,
      1.8, 1.5, 0.8,
      4.0, 6.7, 2.4,
      410, 31, 0, 309
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006295, 0.90, 0.81, 0.72, 18.1,
      1.1, 0.0, 8,
      17179869184, 10242854233, 40.4,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5666593,"tx_bytes_rate":1405371}]', '[{"device":"sda","read_iops":158,"write_iops":375,"io_util_pct":"13.8"}]', 941748,
      3.4, 1.1, 1.7,
      2.0, 1.0, 0.1,
      9.4, 6.0, 1.7,
      283, 67, 0, 242
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006325, 1.20, 1.08, 0.96, 24.0,
      0.4, 0.0, 8,
      17179869184, 11085179146, 35.5,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2566507,"tx_bytes_rate":845459}]', '[{"device":"sda","read_iops":166,"write_iops":317,"io_util_pct":"5.6"}]', 941748,
      1.9, 3.4, 1.7,
      1.3, 0.5, 0.8,
      6.4, 4.9, 0.4,
      127, 69, 0, 466
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006355, 1.94, 1.75, 1.55, 38.8,
      1.1, 0.0, 8,
      17179869184, 9938881680, 42.1,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5828243,"tx_bytes_rate":1048069}]', '[{"device":"sda","read_iops":65,"write_iops":185,"io_util_pct":"12.6"}]', 941748,
      3.5, 1.4, 0.8,
      0.3, 0.8, 0.3,
      3.4, 3.3, 3.4,
      314, 58, 0, 335
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-stg-k8s-master', 1789006385, 1.51, 1.36, 1.21, 30.2,
      0.5, 0.0, 8,
      17179869184, 10364721443, 39.7,
      0, 0, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3157226,"tx_bytes_rate":755894}]', '[{"device":"sda","read_iops":202,"write_iops":571,"io_util_pct":"13.0"}]', 941748,
      1.8, 2.5, 2.3,
      0.2, 0.9, 0.8,
      9.8, 7.5, 4.0,
      247, 62, 0, 337
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-stg-k8s-master', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"k8s-cp-01.staging.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.k8s-cp-01.staging.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-ai-inference-01', 'gpu-node-01.ai.hexly.ai', 'Ubuntu 22.04.4 LTS', '5.15.0-107-generic', 'x86_64', 'AMD EPYC 9354 32-Core', 1787507453, 1789006405, 1789002815,
    1, 64, 32, 274877906944, 68719476736, 'bare-metal',
    '198.51.100.200', '2.1.2', 'Core server deployed for gpu-node-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["198.51.100.200"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1498962}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-ai-inference-01', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-ai-inference-01', 14);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-ai-inference-01', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-ai-inference-01', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-ai-inference-01', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006115, 1.88, 1.69, 1.50, 37.6,
      0.6, 0.1, 64,
      274877906944, 150950276991, 45.1,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2899972,"tx_bytes_rate":2984356}]', '[{"device":"sda","read_iops":58,"write_iops":582,"io_util_pct":"26.3"}]', 1498962,
      1.3, 3.1, 2.3,
      0.5, 1.4, 0.6,
      7.4, 3.0, 3.0,
      319, 27, 0, 200
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006145, 1.97, 1.77, 1.58, 39.4,
      1.2, 0.2, 64,
      274877906944, 145262660207, 47.2,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4599114,"tx_bytes_rate":2216319}]', '[{"device":"sda","read_iops":239,"write_iops":394,"io_util_pct":"9.8"}]', 1498962,
      4.4, 0.9, 2.6,
      0.5, 0.1, 0.7,
      8.3, 2.2, 4.9,
      175, 62, 0, 328
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006175, 1.77, 1.59, 1.42, 35.4,
      1.4, 0.0, 64,
      274877906944, 142712956332, 48.1,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5305925,"tx_bytes_rate":1405714}]', '[{"device":"sda","read_iops":185,"write_iops":206,"io_util_pct":"6.1"}]', 1498962,
      1.8, 1.2, 2.6,
      1.4, 1.5, 0.6,
      5.5, 4.4, 2.3,
      162, 38, 0, 265
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006205, 1.85, 1.67, 1.48, 37.0,
      1.2, 0.0, 64,
      274877906944, 146566288914, 46.7,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4640351,"tx_bytes_rate":607806}]', '[{"device":"sda","read_iops":130,"write_iops":439,"io_util_pct":"5.4"}]', 1498962,
      4.9, 2.3, 0.8,
      0.3, 0.5, 0.7,
      2.4, 1.1, 4.1,
      155, 51, 0, 423
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006235, 1.64, 1.48, 1.31, 32.8,
      0.4, 0.2, 64,
      274877906944, 140415230444, 48.9,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1813534,"tx_bytes_rate":2978030}]', '[{"device":"sda","read_iops":155,"write_iops":461,"io_util_pct":"18.8"}]', 1498962,
      2.8, 2.2, 2.8,
      1.1, 1.2, 0.1,
      9.3, 6.0, 2.7,
      162, 29, 0, 418
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006265, 0.82, 0.74, 0.66, 16.5,
      0.8, 0.0, 64,
      274877906944, 167370929788, 39.1,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1463860,"tx_bytes_rate":2182284}]', '[{"device":"sda","read_iops":194,"write_iops":413,"io_util_pct":"22.0"}]', 1498962,
      2.1, 2.2, 2.7,
      1.7, 0.8, 0.8,
      5.7, 3.4, 4.0,
      306, 69, 0, 209
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006295, 1.16, 1.04, 0.93, 23.2,
      0.4, 0.1, 64,
      274877906944, 148285441143, 46.1,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2005878,"tx_bytes_rate":2767046}]', '[{"device":"sda","read_iops":155,"write_iops":198,"io_util_pct":"20.0"}]', 1498962,
      4.7, 0.7, 1.4,
      0.3, 0.0, 0.6,
      6.4, 4.4, 0.4,
      216, 68, 0, 194
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006325, 1.43, 1.29, 1.14, 28.7,
      0.6, 0.0, 64,
      274877906944, 158170429014, 42.5,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2200380,"tx_bytes_rate":1109092}]', '[{"device":"sda","read_iops":158,"write_iops":117,"io_util_pct":"20.1"}]', 1498962,
      0.8, 2.0, 2.5,
      0.3, 0.3, 0.1,
      7.1, 0.7, 1.2,
      355, 37, 0, 322
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006355, 1.90, 1.71, 1.52, 37.9,
      0.6, 0.1, 64,
      274877906944, 154438087202, 43.8,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3095209,"tx_bytes_rate":2272531}]', '[{"device":"sda","read_iops":220,"write_iops":290,"io_util_pct":"28.2"}]', 1498962,
      1.0, 3.2, 0.3,
      1.2, 0.0, 0.0,
      5.4, 5.7, 2.0,
      162, 60, 0, 430
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-01', 1789006385, 1.50, 1.35, 1.20, 29.9,
      1.0, 0.1, 64,
      274877906944, 139392850286, 49.3,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5512299,"tx_bytes_rate":1834943}]', '[{"device":"sda","read_iops":185,"write_iops":577,"io_util_pct":"11.6"}]', 1498962,
      3.0, 2.2, 1.5,
      0.5, 0.8, 0.9,
      6.9, 6.0, 3.8,
      256, 38, 0, 427
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-ai-inference-01', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"gpu-node-01.ai.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.gpu-node-01.ai.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-ai-inference-02', 'gpu-node-02.ai.hexly.ai', 'Ubuntu 22.04.4 LTS', '5.15.0-107-generic', 'x86_64', 'AMD EPYC 9354 32-Core', 1788085202, 1789006405, 1789002815,
    1, 64, 32, 274877906944, 68719476736, 'bare-metal',
    '198.51.100.201', '2.1.2', 'Core server deployed for gpu-node-02',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["198.51.100.201"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":921213}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-ai-inference-02', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-ai-inference-02', 14);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-ai-inference-02', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-ai-inference-02', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-ai-inference-02', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006115, 1.92, 1.73, 1.54, 38.3,
      1.3, 0.1, 64,
      274877906944, 167533125758, 39.1,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4749337,"tx_bytes_rate":2981688}]', '[{"device":"sda","read_iops":99,"write_iops":353,"io_util_pct":"19.6"}]', 921213,
      1.2, 4.0, 2.5,
      1.1, 0.6, 0.2,
      6.7, 1.4, 2.2,
      174, 21, 0, 228
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006145, 0.88, 0.79, 0.70, 17.6,
      0.3, 0.1, 64,
      274877906944, 172985829925, 37.1,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1363725,"tx_bytes_rate":1329947}]', '[{"device":"sda","read_iops":58,"write_iops":556,"io_util_pct":"24.5"}]', 921213,
      0.3, 2.5, 0.8,
      1.7, 0.9, 0.7,
      9.0, 5.5, 4.7,
      296, 27, 0, 228
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006175, 1.59, 1.43, 1.27, 31.7,
      0.4, 0.1, 64,
      274877906944, 156408729397, 43.1,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4305257,"tx_bytes_rate":1065635}]', '[{"device":"sda","read_iops":144,"write_iops":266,"io_util_pct":"6.7"}]', 921213,
      2.6, 0.7, 0.2,
      1.0, 0.5, 0.8,
      5.8, 5.3, 1.4,
      265, 63, 0, 247
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006205, 1.99, 1.79, 1.59, 39.8,
      1.0, 0.0, 64,
      274877906944, 155644693238, 43.4,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3697331,"tx_bytes_rate":1076118}]', '[{"device":"sda","read_iops":165,"write_iops":555,"io_util_pct":"24.0"}]', 921213,
      1.6, 1.0, 0.1,
      1.8, 0.3, 0.5,
      6.6, 0.7, 0.4,
      216, 49, 0, 284
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006235, 1.50, 1.35, 1.20, 30.0,
      0.3, 0.0, 64,
      274877906944, 164393025464, 40.2,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1884492,"tx_bytes_rate":2570595}]', '[{"device":"sda","read_iops":66,"write_iops":146,"io_util_pct":"18.9"}]', 921213,
      1.1, 0.9, 2.7,
      0.8, 0.5, 0.3,
      9.8, 5.7, 3.2,
      239, 52, 0, 404
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006265, 1.83, 1.65, 1.46, 36.6,
      0.9, 0.0, 64,
      274877906944, 169688462101, 38.3,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3206615,"tx_bytes_rate":2153829}]', '[{"device":"sda","read_iops":86,"write_iops":358,"io_util_pct":"29.8"}]', 921213,
      2.7, 3.9, 2.8,
      0.3, 1.3, 0.9,
      2.5, 7.3, 4.9,
      197, 61, 0, 458
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006295, 1.80, 1.62, 1.44, 36.0,
      0.5, 0.2, 64,
      274877906944, 178151065784, 35.2,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5451782,"tx_bytes_rate":1398806}]', '[{"device":"sda","read_iops":206,"write_iops":195,"io_util_pct":"25.4"}]', 921213,
      3.4, 3.6, 1.0,
      1.0, 1.2, 0.0,
      7.9, 3.7, 0.6,
      358, 50, 0, 232
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006325, 0.92, 0.83, 0.74, 18.4,
      0.9, 0.0, 64,
      274877906944, 163225194055, 40.6,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1921510,"tx_bytes_rate":2378625}]', '[{"device":"sda","read_iops":156,"write_iops":227,"io_util_pct":"25.1"}]', 921213,
      4.9, 1.2, 0.8,
      0.5, 0.8, 0.5,
      4.1, 1.5, 1.1,
      381, 24, 0, 229
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006355, 1.00, 0.90, 0.80, 19.9,
      0.1, 0.1, 64,
      274877906944, 155432895882, 43.5,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4989932,"tx_bytes_rate":1357141}]', '[{"device":"sda","read_iops":64,"write_iops":468,"io_util_pct":"19.7"}]', 921213,
      3.6, 3.5, 1.2,
      2.0, 0.4, 0.0,
      5.8, 3.8, 3.4,
      376, 28, 0, 393
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-ai-inference-02', 1789006385, 1.56, 1.40, 1.25, 31.2,
      1.0, 0.0, 64,
      274877906944, 150124044131, 45.4,
      68719476736, 6871947673, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5493092,"tx_bytes_rate":1579389}]', '[{"device":"sda","read_iops":223,"write_iops":398,"io_util_pct":"27.9"}]', 921213,
      4.3, 0.0, 0.1,
      0.6, 0.1, 0.8,
      0.9, 3.2, 2.5,
      214, 51, 0, 292
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-ai-inference-02', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"gpu-node-02.ai.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.gpu-node-02.ai.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-edge-tokyo', 'nrt-edge-01.jp.hexly.ai', 'Debian 12.7', '6.1.0-25-arm64', 'aarch64', 'Ampere Altra Max M128-30', 1788594714, 1789006413, 1789002815,
    1, 32, 32, 68719476736, 8589934592, 'kvm',
    '133.242.18.5', '2.1.2', 'Core server deployed for nrt-edge-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["133.242.18.5"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":411701}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-tokyo', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-tokyo', 7);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-tokyo', 15);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-tokyo', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-tokyo', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-tokyo', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006115, 1.41, 1.27, 1.13, 28.1,
      1.2, 0.1, 32,
      68719476736, 37939378222, 44.8,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5325870,"tx_bytes_rate":1364540}]', '[{"device":"sda","read_iops":177,"write_iops":351,"io_util_pct":"21.6"}]', 411701,
      2.1, 3.6, 1.8,
      1.7, 1.2, 0.0,
      5.9, 2.4, 0.5,
      328, 24, 0, 175
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006145, 1.18, 1.06, 0.94, 23.5,
      0.0, 0.1, 32,
      68719476736, 43777558981, 36.3,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1019808,"tx_bytes_rate":2864555}]', '[{"device":"sda","read_iops":121,"write_iops":145,"io_util_pct":"14.0"}]', 411701,
      3.6, 3.4, 1.0,
      2.0, 1.5, 0.2,
      5.8, 6.3, 1.0,
      212, 60, 0, 320
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006175, 1.42, 1.28, 1.14, 28.4,
      0.7, 0.2, 32,
      68719476736, 42863123360, 37.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5790415,"tx_bytes_rate":1430187}]', '[{"device":"sda","read_iops":158,"write_iops":229,"io_util_pct":"20.6"}]', 411701,
      3.4, 2.8, 1.8,
      1.6, 1.3, 0.4,
      0.9, 2.6, 3.8,
      236, 21, 0, 394
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006205, 0.90, 0.81, 0.72, 18.0,
      1.3, 0.1, 32,
      68719476736, 36755268906, 46.5,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3815614,"tx_bytes_rate":617946}]', '[{"device":"sda","read_iops":196,"write_iops":466,"io_util_pct":"16.8"}]', 411701,
      1.1, 3.7, 0.3,
      1.1, 0.8, 0.3,
      9.4, 0.6, 4.9,
      271, 30, 0, 274
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006235, 1.88, 1.69, 1.50, 37.6,
      1.3, 0.2, 32,
      68719476736, 38542962384, 43.9,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1735294,"tx_bytes_rate":2479607}]', '[{"device":"sda","read_iops":203,"write_iops":194,"io_util_pct":"18.5"}]', 411701,
      2.3, 3.6, 1.6,
      2.0, 0.3, 0.6,
      6.5, 5.6, 0.4,
      251, 22, 0, 335
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006265, 1.03, 0.93, 0.82, 20.5,
      1.4, 0.0, 32,
      68719476736, 43591143625, 36.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1948536,"tx_bytes_rate":1242456}]', '[{"device":"sda","read_iops":154,"write_iops":580,"io_util_pct":"10.1"}]', 411701,
      0.2, 3.7, 1.6,
      0.0, 1.0, 0.1,
      6.8, 6.9, 0.1,
      237, 50, 0, 396
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006295, 1.88, 1.69, 1.50, 37.5,
      0.3, 0.2, 32,
      68719476736, 35584464758, 48.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3367999,"tx_bytes_rate":1637028}]', '[{"device":"sda","read_iops":116,"write_iops":477,"io_util_pct":"12.2"}]', 411701,
      1.8, 1.9, 0.7,
      1.9, 0.3, 0.0,
      0.5, 0.1, 3.5,
      246, 66, 0, 283
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006325, 1.36, 1.22, 1.09, 27.2,
      0.4, 0.2, 32,
      68719476736, 39270496030, 42.9,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1012587,"tx_bytes_rate":1252083}]', '[{"device":"sda","read_iops":191,"write_iops":114,"io_util_pct":"0.9"}]', 411701,
      4.3, 3.8, 2.1,
      0.6, 0.3, 0.8,
      4.7, 5.3, 3.4,
      328, 60, 0, 407
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006355, 1.16, 1.04, 0.93, 23.2,
      1.3, 0.1, 32,
      68719476736, 39551986686, 42.4,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4557593,"tx_bytes_rate":2284373}]', '[{"device":"sda","read_iops":210,"write_iops":398,"io_util_pct":"14.7"}]', 411701,
      4.9, 0.7, 2.1,
      1.4, 1.3, 0.7,
      5.0, 1.2, 3.3,
      219, 38, 0, 251
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-tokyo', 1789006385, 1.35, 1.22, 1.08, 27.0,
      1.2, 0.2, 32,
      68719476736, 38781591986, 43.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2562072,"tx_bytes_rate":657572}]', '[{"device":"sda","read_iops":103,"write_iops":315,"io_util_pct":"28.3"}]', 411701,
      2.0, 1.4, 1.6,
      1.5, 1.0, 0.8,
      10.0, 4.5, 3.7,
      134, 66, 0, 233
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-edge-tokyo', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"nrt-edge-01.jp.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.nrt-edge-01.jp.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-edge-london', 'lhr-edge-01.uk.hexly.ai', 'Debian 12.7', '6.1.0-25-amd64', 'x86_64', 'Intel Xeon E-2288G', 1787635658, 1789006404, 1789002815,
    1, 16, 8, 34359738368, 8589934592, 'kvm',
    '185.199.108.15', '2.1.2', 'Core server deployed for lhr-edge-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["185.199.108.15"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":1370757}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-london', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-london', 7);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-london', 16);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-london', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-london', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-london', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006115, 0.90, 0.81, 0.72, 18.1,
      0.2, 0.2, 16,
      34359738368, 19827088791, 42.3,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2852549,"tx_bytes_rate":1225907}]', '[{"device":"sda","read_iops":248,"write_iops":151,"io_util_pct":"15.3"}]', 1370757,
      4.1, 3.8, 2.4,
      1.8, 1.4, 0.7,
      10.0, 0.9, 1.3,
      399, 67, 0, 267
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006145, 1.10, 0.99, 0.88, 22.1,
      1.5, 0.1, 16,
      34359738368, 20606684961, 40.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1377157,"tx_bytes_rate":1849548}]', '[{"device":"sda","read_iops":180,"write_iops":260,"io_util_pct":"13.3"}]', 1370757,
      4.6, 3.5, 2.0,
      1.4, 0.2, 0.8,
      2.2, 5.3, 3.9,
      315, 66, 0, 199
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006175, 1.63, 1.47, 1.30, 32.6,
      0.0, 0.1, 16,
      34359738368, 19091340643, 44.4,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3737312,"tx_bytes_rate":516352}]', '[{"device":"sda","read_iops":232,"write_iops":432,"io_util_pct":"7.5"}]', 1370757,
      4.5, 3.6, 2.2,
      1.0, 0.1, 0.7,
      4.9, 1.1, 4.0,
      378, 25, 0, 340
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006205, 1.24, 1.12, 0.99, 24.8,
      0.4, 0.0, 16,
      34359738368, 18646457440, 45.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2898597,"tx_bytes_rate":675372}]', '[{"device":"sda","read_iops":64,"write_iops":547,"io_util_pct":"9.7"}]', 1370757,
      3.9, 0.5, 2.4,
      0.3, 1.2, 0.5,
      3.6, 4.5, 3.4,
      306, 25, 0, 330
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006235, 1.04, 0.94, 0.83, 20.8,
      0.3, 0.1, 16,
      34359738368, 18454852345, 46.3,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2575704,"tx_bytes_rate":1662796}]', '[{"device":"sda","read_iops":139,"write_iops":216,"io_util_pct":"27.8"}]', 1370757,
      1.5, 1.5, 0.8,
      0.6, 1.2, 0.1,
      6.0, 5.4, 0.0,
      285, 43, 0, 464
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006265, 1.60, 1.44, 1.28, 32.0,
      0.4, 0.1, 16,
      34359738368, 21718369808, 36.8,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5176059,"tx_bytes_rate":1130819}]', '[{"device":"sda","read_iops":202,"write_iops":382,"io_util_pct":"26.9"}]', 1370757,
      0.2, 1.0, 0.7,
      0.1, 0.2, 1.0,
      8.9, 4.8, 2.9,
      311, 48, 0, 476
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006295, 1.12, 1.01, 0.90, 22.5,
      1.4, 0.2, 16,
      34359738368, 21774222507, 36.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4159907,"tx_bytes_rate":2775960}]', '[{"device":"sda","read_iops":199,"write_iops":205,"io_util_pct":"9.8"}]', 1370757,
      4.4, 2.6, 1.5,
      1.1, 0.0, 0.5,
      8.3, 2.6, 4.1,
      266, 43, 0, 318
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006325, 1.07, 0.96, 0.86, 21.3,
      1.3, 0.0, 16,
      34359738368, 18256627525, 46.9,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2317980,"tx_bytes_rate":2668645}]', '[{"device":"sda","read_iops":74,"write_iops":564,"io_util_pct":"7.4"}]', 1370757,
      0.4, 0.6, 0.4,
      1.5, 1.3, 0.9,
      4.8, 0.5, 1.1,
      245, 27, 0, 388
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006355, 1.80, 1.62, 1.44, 35.9,
      1.2, 0.1, 16,
      34359738368, 17761673852, 48.3,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5773082,"tx_bytes_rate":2369540}]', '[{"device":"sda","read_iops":223,"write_iops":236,"io_util_pct":"12.4"}]', 1370757,
      3.9, 3.1, 1.1,
      1.5, 0.9, 0.8,
      3.5, 3.1, 1.0,
      326, 49, 0, 315
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-london', 1789006385, 1.60, 1.44, 1.28, 31.9,
      1.2, 0.1, 16,
      34359738368, 22001963013, 36.0,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1529726,"tx_bytes_rate":592489}]', '[{"device":"sda","read_iops":163,"write_iops":589,"io_util_pct":"25.5"}]', 1370757,
      2.0, 2.3, 0.9,
      1.6, 0.4, 0.1,
      3.4, 1.9, 3.9,
      309, 58, 0, 257
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-edge-london', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"lhr-edge-01.uk.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.lhr-edge-01.uk.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-edge-frankfurt', 'fra-edge-01.de.hexly.ai', 'Debian 12.7', '6.1.0-25-amd64', 'x86_64', 'Intel Xeon E-2288G', 1786572754, 1789006404, 1789002815,
    1, 16, 8, 34359738368, 8589934592, 'kvm',
    '185.199.109.15', '2.1.2', 'Core server deployed for fra-edge-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["185.199.109.15"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":2433661}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-frankfurt', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-frankfurt', 7);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-frankfurt', 17);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-frankfurt', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-frankfurt', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-frankfurt', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006115, 0.83, 0.75, 0.66, 16.6,
      1.2, 0.1, 16,
      34359738368, 17404522677, 49.3,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2430985,"tx_bytes_rate":1346248}]', '[{"device":"sda","read_iops":206,"write_iops":346,"io_util_pct":"2.3"}]', 2433661,
      1.8, 2.0, 2.7,
      0.7, 0.7, 0.9,
      6.7, 5.0, 2.4,
      204, 53, 0, 471
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006145, 0.81, 0.73, 0.65, 16.2,
      0.3, 0.1, 16,
      34359738368, 17457659439, 49.2,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4546031,"tx_bytes_rate":865403}]', '[{"device":"sda","read_iops":136,"write_iops":387,"io_util_pct":"2.9"}]', 2433661,
      4.5, 0.5, 2.3,
      1.8, 0.9, 0.4,
      6.0, 4.0, 0.5,
      257, 69, 0, 363
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006175, 0.80, 0.72, 0.64, 16.0,
      1.3, 0.0, 16,
      34359738368, 20466902333, 40.4,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4663728,"tx_bytes_rate":1009995}]', '[{"device":"sda","read_iops":194,"write_iops":451,"io_util_pct":"29.6"}]', 2433661,
      2.4, 2.1, 2.6,
      0.4, 0.6, 0.3,
      4.3, 3.7, 5.0,
      329, 61, 0, 392
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006205, 0.87, 0.78, 0.70, 17.4,
      0.0, 0.0, 16,
      34359738368, 20725858441, 39.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4167230,"tx_bytes_rate":2197734}]', '[{"device":"sda","read_iops":216,"write_iops":118,"io_util_pct":"24.5"}]', 2433661,
      0.3, 3.7, 1.8,
      0.6, 0.6, 0.9,
      7.0, 4.8, 4.7,
      247, 34, 0, 165
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006235, 1.12, 1.01, 0.90, 22.4,
      0.2, 0.0, 16,
      34359738368, 20822263218, 39.4,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5621258,"tx_bytes_rate":1551933}]', '[{"device":"sda","read_iops":87,"write_iops":457,"io_util_pct":"6.9"}]', 2433661,
      1.5, 0.5, 0.8,
      1.2, 1.0, 0.4,
      9.5, 4.9, 1.0,
      329, 28, 0, 248
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006265, 1.73, 1.56, 1.38, 34.6,
      0.7, 0.1, 16,
      34359738368, 20029740434, 41.7,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4080856,"tx_bytes_rate":2992662}]', '[{"device":"sda","read_iops":133,"write_iops":426,"io_util_pct":"15.3"}]', 2433661,
      2.2, 0.9, 2.1,
      0.3, 0.0, 0.1,
      2.9, 4.3, 4.9,
      232, 27, 0, 254
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006295, 0.75, 0.68, 0.60, 15.0,
      0.1, 0.1, 16,
      34359738368, 19296687437, 43.8,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5199815,"tx_bytes_rate":2717219}]', '[{"device":"sda","read_iops":60,"write_iops":590,"io_util_pct":"2.0"}]', 2433661,
      2.2, 2.3, 1.6,
      1.6, 0.1, 0.3,
      6.9, 6.3, 0.8,
      212, 61, 0, 299
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006325, 0.78, 0.70, 0.62, 15.5,
      0.8, 0.0, 16,
      34359738368, 18358466330, 46.6,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1888445,"tx_bytes_rate":1824133}]', '[{"device":"sda","read_iops":167,"write_iops":494,"io_util_pct":"25.1"}]', 2433661,
      4.5, 1.2, 0.6,
      1.2, 1.0, 0.4,
      9.1, 6.4, 1.0,
      390, 39, 0, 178
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006355, 1.22, 1.10, 0.98, 24.5,
      1.1, 0.1, 16,
      34359738368, 19154903682, 44.3,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1670741,"tx_bytes_rate":864287}]', '[{"device":"sda","read_iops":57,"write_iops":549,"io_util_pct":"6.5"}]', 2433661,
      3.9, 3.4, 2.0,
      0.1, 1.0, 0.6,
      4.7, 3.7, 1.5,
      157, 48, 0, 167
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-frankfurt', 1789006385, 1.27, 1.14, 1.02, 25.4,
      0.6, 0.1, 16,
      34359738368, 19814615587, 42.3,
      8589934592, 858993459, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5943745,"tx_bytes_rate":2419554}]', '[{"device":"sda","read_iops":231,"write_iops":147,"io_util_pct":"8.5"}]', 2433661,
      1.8, 0.3, 0.2,
      1.5, 1.2, 0.7,
      5.3, 6.8, 3.6,
      368, 44, 0, 452
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-edge-frankfurt', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"fra-edge-01.de.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.fra-edge-01.de.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-edge-singapore', 'sin-edge-01.sg.hexly.ai', 'Ubuntu 24.04.2 LTS', '6.8.0-45-generic', 'aarch64', 'Neoverse-N1', 1788521700, 1789006393, 1789002815,
    1, 8, 8, 17179869184, 4294967296, 'kvm',
    '128.199.200.12', '2.1.2', 'Core server deployed for sin-edge-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["128.199.200.12"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":484715}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-singapore', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-singapore', 7);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-edge-singapore', 18);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-singapore', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-singapore', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-edge-singapore', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006115, 3.64, 3.28, 2.91, 72.8,
      1.4, 0.1, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3695608,"tx_bytes_rate":1696516}]', '[{"device":"sda","read_iops":225,"write_iops":343,"io_util_pct":"20.4"}]', 484715,
      0.6, 2.9, 0.9,
      1.2, 0.8, 0.8,
      4.9, 3.4, 3.5,
      193, 51, 0, 345
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006145, 3.35, 3.02, 2.68, 67.0,
      0.6, 0.1, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3649948,"tx_bytes_rate":2150655}]', '[{"device":"sda","read_iops":115,"write_iops":594,"io_util_pct":"23.3"}]', 484715,
      4.3, 0.8, 0.3,
      1.4, 0.8, 0.1,
      6.2, 0.3, 4.7,
      145, 26, 0, 163
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006175, 3.58, 3.22, 2.86, 71.6,
      1.5, 0.1, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2352531,"tx_bytes_rate":1285289}]', '[{"device":"sda","read_iops":150,"write_iops":215,"io_util_pct":"26.6"}]', 484715,
      2.8, 1.1, 2.9,
      0.6, 0.7, 0.6,
      5.6, 1.4, 4.1,
      246, 61, 0, 357
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006205, 3.36, 3.02, 2.69, 67.2,
      0.6, 0.2, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3803187,"tx_bytes_rate":2697769}]', '[{"device":"sda","read_iops":197,"write_iops":294,"io_util_pct":"5.5"}]', 484715,
      4.1, 2.1, 1.9,
      1.8, 0.5, 0.2,
      5.9, 1.0, 0.3,
      311, 51, 0, 209
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006235, 3.64, 3.28, 2.91, 72.9,
      1.2, 0.2, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2311916,"tx_bytes_rate":2849034}]', '[{"device":"sda","read_iops":209,"write_iops":389,"io_util_pct":"24.5"}]', 484715,
      4.8, 3.7, 1.4,
      1.9, 0.8, 0.5,
      0.7, 2.7, 4.3,
      128, 55, 0, 254
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006265, 3.70, 3.33, 2.96, 74.1,
      0.6, 0.0, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4638003,"tx_bytes_rate":2430349}]', '[{"device":"sda","read_iops":129,"write_iops":280,"io_util_pct":"13.1"}]', 484715,
      3.5, 1.7, 1.7,
      0.1, 1.5, 0.9,
      7.0, 1.2, 2.7,
      317, 68, 0, 361
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006295, 3.36, 3.02, 2.69, 67.2,
      1.0, 0.1, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4334553,"tx_bytes_rate":2892759}]', '[{"device":"sda","read_iops":245,"write_iops":588,"io_util_pct":"18.3"}]', 484715,
      4.8, 2.1, 0.6,
      0.3, 0.6, 0.1,
      6.7, 3.5, 1.0,
      260, 63, 0, 182
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006325, 3.29, 2.96, 2.63, 65.8,
      1.0, 0.0, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4640654,"tx_bytes_rate":1128383}]', '[{"device":"sda","read_iops":117,"write_iops":378,"io_util_pct":"28.9"}]', 484715,
      4.1, 0.8, 0.8,
      1.0, 0.9, 0.6,
      3.4, 7.8, 0.3,
      344, 37, 0, 332
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006355, 3.67, 3.30, 2.94, 73.4,
      0.4, 0.2, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5218898,"tx_bytes_rate":1398503}]', '[{"device":"sda","read_iops":135,"write_iops":119,"io_util_pct":"13.4"}]', 484715,
      4.5, 2.6, 0.5,
      0.3, 0.8, 0.6,
      6.0, 2.3, 1.5,
      415, 39, 0, 443
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-edge-singapore', 1789006385, 3.48, 3.13, 2.78, 69.6,
      1.5, 0.1, 8,
      17179869184, 3779571220, 78.0,
      4294967296, 429496729, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1998167,"tx_bytes_rate":1082827}]', '[{"device":"sda","read_iops":66,"write_iops":337,"io_util_pct":"2.1"}]', 484715,
      1.1, 3.3, 2.8,
      0.3, 1.1, 0.6,
      1.0, 3.8, 3.5,
      122, 37, 0, 335
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-edge-singapore', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"sin-edge-01.sg.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.sin-edge-01.sg.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
      VALUES ('srv-edge-singapore', 'mem_high', 'warning', 78.4, 1789005965, 'Memory usage is elevated at 78.4% (threshold 75%)');
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-mon-prometheus', 'mon-core-01.infra.hexly.ai', 'Ubuntu 22.04.4 LTS', '5.15.0-107-generic', 'x86_64', 'Intel Xeon Gold 5218', 1788562269, 1789006391, 1789002815,
    1, 32, 16, 137438953472, 17179869184, 'kvm',
    '10.0.99.1', '2.1.2', 'Core server deployed for mon-core-01',
    NULL, NULL, NULL,
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.99.1"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":444146}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-mon-prometheus', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-mon-prometheus', 19);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-mon-prometheus', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-mon-prometheus', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-mon-prometheus', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006115, 1.60, 1.44, 1.28, 31.9,
      1.0, 0.2, 32,
      137438953472, 83545947096, 39.2,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1253008,"tx_bytes_rate":597111}]', '[{"device":"sda","read_iops":169,"write_iops":164,"io_util_pct":"9.5"}]', 444146,
      1.9, 1.6, 1.3,
      1.3, 0.5, 0.8,
      4.8, 1.5, 3.7,
      124, 65, 0, 244
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006145, 0.86, 0.77, 0.69, 17.1,
      1.1, 0.0, 32,
      137438953472, 76312802437, 44.5,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2036905,"tx_bytes_rate":1051228}]', '[{"device":"sda","read_iops":67,"write_iops":280,"io_util_pct":"1.7"}]', 444146,
      2.2, 4.0, 2.1,
      1.2, 0.8, 0.8,
      4.4, 4.9, 1.1,
      142, 53, 0, 466
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006175, 1.93, 1.74, 1.54, 38.7,
      0.1, 0.0, 32,
      137438953472, 74667945583, 45.7,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3685406,"tx_bytes_rate":2694411}]', '[{"device":"sda","read_iops":154,"write_iops":438,"io_util_pct":"12.3"}]', 444146,
      1.7, 2.4, 0.2,
      1.5, 0.8, 0.6,
      6.3, 7.2, 4.4,
      181, 26, 0, 446
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006205, 1.54, 1.39, 1.23, 30.7,
      0.6, 0.1, 32,
      137438953472, 76019969394, 44.7,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2848567,"tx_bytes_rate":2447101}]', '[{"device":"sda","read_iops":175,"write_iops":491,"io_util_pct":"16.2"}]', 444146,
      3.4, 3.4, 1.2,
      0.5, 1.0, 0.2,
      5.1, 4.1, 0.7,
      364, 51, 0, 415
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006235, 0.76, 0.68, 0.61, 15.3,
      1.5, 0.0, 32,
      137438953472, 80054103565, 41.8,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4370066,"tx_bytes_rate":2399722}]', '[{"device":"sda","read_iops":205,"write_iops":236,"io_util_pct":"1.8"}]', 444146,
      2.4, 1.1, 1.9,
      0.4, 1.0, 0.8,
      0.5, 2.8, 1.8,
      161, 66, 0, 374
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006265, 1.59, 1.43, 1.27, 31.8,
      1.0, 0.1, 32,
      137438953472, 72274735385, 47.4,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2062582,"tx_bytes_rate":2927405}]', '[{"device":"sda","read_iops":234,"write_iops":341,"io_util_pct":"20.2"}]', 444146,
      2.9, 2.7, 2.8,
      1.0, 0.4, 0.5,
      1.6, 7.7, 3.5,
      275, 27, 0, 245
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006295, 1.86, 1.67, 1.49, 37.2,
      1.4, 0.0, 32,
      137438953472, 79972210326, 41.8,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4374998,"tx_bytes_rate":999930}]', '[{"device":"sda","read_iops":210,"write_iops":302,"io_util_pct":"11.3"}]', 444146,
      3.3, 1.5, 0.7,
      1.4, 0.2, 0.9,
      0.9, 4.6, 4.1,
      178, 63, 0, 464
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006325, 1.46, 1.31, 1.17, 29.1,
      0.7, 0.2, 32,
      137438953472, 71396059331, 48.1,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2956081,"tx_bytes_rate":2304855}]', '[{"device":"sda","read_iops":171,"write_iops":571,"io_util_pct":"18.7"}]', 444146,
      3.7, 3.2, 1.9,
      1.4, 1.0, 0.5,
      7.0, 3.4, 1.9,
      334, 55, 0, 261
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006355, 1.72, 1.55, 1.38, 34.3,
      0.6, 0.1, 32,
      137438953472, 86925809525, 36.8,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":1428594,"tx_bytes_rate":2483042}]', '[{"device":"sda","read_iops":132,"write_iops":440,"io_util_pct":"17.0"}]', 444146,
      3.2, 1.0, 1.0,
      1.9, 1.4, 0.9,
      3.6, 1.7, 0.3,
      376, 27, 0, 249
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-mon-prometheus', 1789006385, 1.40, 1.26, 1.12, 28.0,
      1.3, 0.0, 32,
      137438953472, 88212830437, 35.8,
      17179869184, 1717986918, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5842546,"tx_bytes_rate":2611989}]', '[{"device":"sda","read_iops":139,"write_iops":193,"io_util_pct":"3.9"}]', 444146,
      1.5, 3.1, 1.8,
      2.0, 0.7, 0.2,
      4.2, 4.2, 1.2,
      307, 52, 0, 315
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-mon-prometheus', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"mon-core-01.infra.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.mon-core-01.infra.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO hosts (
    host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at,
    is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization,
    public_ip, probe_version, description, maintenance_start, maintenance_end, maintenance_reason,
    disks, net_interfaces, boot_mode, timezone, dns_resolvers, top_processes_json, top_processes_ts
  ) VALUES (
    'srv-backup-storage', 'zfs-vault-01.backup.hexly.ai', 'FreeBSD 14.1-RELEASE', '14.1-RELEASE-p3', 'x86_64', 'AMD EPYC 7302 16-Core', 1788593942, 1789006399, 1789002815,
    1, 32, 16, 137438953472, 34359738368, 'bare-metal',
    '10.0.99.50', '2.1.0', 'Core server deployed for zfs-vault-01',
    '02:00', '06:00', 'Kernel upgrade and security patching window',
    '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","ip_addresses":["10.0.99.50"],"mac_address":"52:54:00:12:34:56"},{"iface":"lo","ip_addresses":["127.0.0.1"],"mac_address":"00:00:00:00:00:00"}]', 'UEFI', 'UTC', '["1.1.1.1","8.8.8.8"]', '[{"pid":1024,"name":"node","cmd":"node dist/server.js","user":"app","state":"S","cpu_pct":12.4,"mem_pct":18.2,"mem_rss":1248576000,"num_threads":16,"io_read_rate":1048576,"io_write_rate":2097152,"uptime":84600},{"pid":2048,"name":"nginx","cmd":"nginx: worker process","user":"www-data","state":"S","cpu_pct":4.2,"mem_pct":2.1,"mem_rss":145000000,"num_threads":4,"io_read_rate":512000,"io_write_rate":128000,"uptime":120400},{"pid":3096,"name":"postgres","cmd":"postgres: writer","user":"postgres","state":"S","cpu_pct":8.9,"mem_pct":24.5,"mem_rss":4294967296,"num_threads":1,"io_read_rate":8388608,"io_write_rate":16777216,"uptime":254000},{"pid":4012,"name":"redis-server","cmd":"redis-server *:6379","user":"redis","state":"S","cpu_pct":2.1,"mem_pct":8.5,"mem_rss":850000000,"num_threads":4,"io_read_rate":0,"io_write_rate":64000,"uptime":300000},{"pid":5120,"name":"bat-probe","cmd":"/usr/local/bin/bat-probe","user":"root","state":"S","cpu_pct":0.1,"mem_pct":0.2,"mem_rss":16777216,"num_threads":4,"io_read_rate":4096,"io_write_rate":8192,"uptime":412473}]', 1789006385
  );
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-backup-storage', 1);
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES ('srv-backup-storage', 20);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-backup-storage', 22, 'SSH management access', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-backup-storage', 80, 'HTTP public traffic', 1788920015);
INSERT OR REPLACE INTO port_allowlist (host_id, port, reason, created_at) VALUES ('srv-backup-storage', 443, 'HTTPS secure traffic', 1788920015);
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006115, 1.03, 0.93, 0.82, 20.6,
      1.0, 0.1, 32,
      137438953472, 79810141309, 41.9,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":3134577,"tx_bytes_rate":2544978}]', '[{"device":"sda","read_iops":242,"write_iops":170,"io_util_pct":"24.5"}]', 412473,
      0.4, 0.8, 1.3,
      0.4, 1.1, 0.9,
      7.3, 2.1, 2.0,
      197, 42, 0, 310
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006145, 0.84, 0.76, 0.67, 16.7,
      0.9, 0.1, 32,
      137438953472, 71930006108, 47.7,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4907940,"tx_bytes_rate":953154}]', '[{"device":"sda","read_iops":82,"write_iops":587,"io_util_pct":"16.3"}]', 412473,
      0.3, 0.7, 0.6,
      0.9, 1.5, 1.0,
      4.5, 1.8, 0.7,
      272, 44, 0, 210
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006175, 1.59, 1.43, 1.27, 31.8,
      1.0, 0.0, 32,
      137438953472, 77027337121, 44.0,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5547775,"tx_bytes_rate":1518237}]', '[{"device":"sda","read_iops":150,"write_iops":461,"io_util_pct":"5.2"}]', 412473,
      2.4, 2.1, 3.0,
      0.8, 0.9, 0.5,
      0.0, 5.8, 2.4,
      129, 42, 0, 348
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006205, 1.40, 1.26, 1.12, 28.1,
      1.1, 0.1, 32,
      137438953472, 73201692095, 46.7,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2058102,"tx_bytes_rate":2905218}]', '[{"device":"sda","read_iops":193,"write_iops":505,"io_util_pct":"13.9"}]', 412473,
      1.8, 1.2, 1.5,
      0.8, 1.2, 0.7,
      8.9, 1.8, 1.0,
      394, 56, 0, 212
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006235, 1.77, 1.59, 1.42, 35.5,
      0.0, 0.1, 32,
      137438953472, 80850868277, 41.2,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5384116,"tx_bytes_rate":1104245}]', '[{"device":"sda","read_iops":56,"write_iops":339,"io_util_pct":"6.0"}]', 412473,
      1.9, 2.5, 1.9,
      1.1, 0.7, 0.3,
      1.1, 2.1, 0.3,
      307, 44, 0, 455
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006265, 1.89, 1.70, 1.51, 37.7,
      1.5, 0.2, 32,
      137438953472, 88285967242, 35.8,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5256744,"tx_bytes_rate":1461600}]', '[{"device":"sda","read_iops":115,"write_iops":171,"io_util_pct":"15.4"}]', 412473,
      4.1, 1.2, 1.2,
      0.1, 0.5, 0.9,
      4.2, 3.8, 1.8,
      312, 38, 0, 311
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006295, 1.62, 1.46, 1.30, 32.3,
      1.2, 0.0, 32,
      137438953472, 88262601278, 35.8,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":4278253,"tx_bytes_rate":2737996}]', '[{"device":"sda","read_iops":98,"write_iops":404,"io_util_pct":"4.2"}]', 412473,
      1.6, 0.5, 1.0,
      0.7, 1.1, 0.3,
      2.3, 7.8, 4.2,
      134, 43, 0, 354
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006325, 1.87, 1.68, 1.50, 37.3,
      1.0, 0.1, 32,
      137438953472, 88390867139, 35.7,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":2031237,"tx_bytes_rate":2767064}]', '[{"device":"sda","read_iops":169,"write_iops":338,"io_util_pct":"4.1"}]', 412473,
      3.1, 2.5, 2.0,
      1.9, 0.0, 0.7,
      8.2, 2.4, 0.8,
      170, 44, 0, 335
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006355, 1.46, 1.31, 1.17, 29.3,
      0.2, 0.0, 32,
      137438953472, 70000868550, 49.1,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5114761,"tx_bytes_rate":1829651}]', '[{"device":"sda","read_iops":138,"write_iops":156,"io_util_pct":"12.7"}]', 412473,
      0.5, 3.2, 2.7,
      1.9, 1.0, 0.0,
      2.3, 1.2, 4.9,
      358, 23, 0, 225
    );
INSERT OR REPLACE INTO metrics_raw (
      host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal,
      cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct,
      disk_json, net_json, disk_io_json, uptime_seconds,
      psi_cpu_some_avg10, psi_cpu_some_avg60, psi_cpu_some_avg300,
      psi_mem_some_avg10, psi_mem_some_avg60, psi_mem_some_avg300,
      psi_io_some_avg10, psi_io_some_avg60, psi_io_some_avg300,
      tcp_established, tcp_time_wait, tcp_orphan, tcp_allocated
    ) VALUES (
      'srv-backup-storage', 1789006385, 0.87, 0.78, 0.70, 17.4,
      0.9, 0.2, 32,
      137438953472, 79954406021, 41.8,
      34359738368, 3435973836, 10.0,
      '[{"mount":"/","total_bytes":536870912000,"avail_bytes":295279001600,"used_pct":45.1},{"mount":"/data","total_bytes":2147483648000,"avail_bytes":1395864371200,"used_pct":35}]', '[{"iface":"eth0","rx_bytes_rate":5542816,"tx_bytes_rate":2115024}]', '[{"device":"sda","read_iops":236,"write_iops":469,"io_util_pct":"0.7"}]', 412473,
      0.5, 1.9, 2.4,
      0.9, 0.2, 0.1,
      3.6, 1.5, 1.3,
      417, 38, 0, 430
    );
INSERT OR REPLACE INTO tier2_snapshots (
    host_id, ts, ports_json, software_json, websites_json
  ) VALUES (
    'srv-backup-storage', 1789006295, '{"listening":[{"port":22,"bind":"0.0.0.0","protocol":"tcp","process":"sshd","pid":890},{"port":80,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":443,"bind":"0.0.0.0","protocol":"tcp","process":"nginx","pid":2048},{"port":5432,"bind":"127.0.0.1","protocol":"tcp","process":"postgres","pid":3096}]}', '{"scan_duration_ms":120,"detected":[{"id":"nginx","name":"Nginx","category":"web","version":"1.26.1","source":"process","running":true,"listening_ports":[80,443]},{"id":"postgresql","name":"PostgreSQL","category":"db","version":"16.4","source":"systemd","running":true,"listening_ports":[5432]},{"id":"docker","name":"Docker CE","category":"runtime","version":"27.1.1","source":"binary","running":true,"listening_ports":[]}]}', '{"scan_duration_ms":45,"sites":[{"domain":"zfs-vault-01.backup.hexly.ai","root":"/var/www/html","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/default"},{"domain":"api.zfs-vault-01.backup.hexly.ai","root":"/srv/api","web_server":"nginx","ssl":true,"enabled":true,"config_path":"/etc/nginx/sites-enabled/api.conf"}]}'
  );
INSERT OR REPLACE INTO webhook_configs (id, host_id, token, rate_limit, is_active) VALUES (1, 'srv-prod-web-01', 'wh-token-srv-prod-web-01', 30, 1);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (1, 'srv-prod-web-01', 1, 'Deployment Release v2.4.0', '{"deployer":"alice@hexly.ai","commit":"a0b8c9d"}', '["deploy","prod"]', '104.21.45.12', 1789005215);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (2, 'srv-prod-web-01', 1, 'Service Restart: nginx', '{"service":"nginx","exit_code":0}', '["systemd","maintenance"]', '104.21.45.12', 1789005815);
INSERT OR REPLACE INTO webhook_configs (id, host_id, token, rate_limit, is_active) VALUES (2, 'srv-prod-web-02', 'wh-token-srv-prod-web-02', 30, 1);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (3, 'srv-prod-web-02', 2, 'Deployment Release v2.4.1', '{"deployer":"alice@hexly.ai","commit":"a1b8c9d"}', '["deploy","prod"]', '104.21.45.13', 1789001615);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (4, 'srv-prod-web-02', 2, 'Service Restart: nginx', '{"service":"nginx","exit_code":0}', '["systemd","maintenance"]', '104.21.45.13', 1789004015);
INSERT OR REPLACE INTO webhook_configs (id, host_id, token, rate_limit, is_active) VALUES (3, 'srv-prod-web-03', 'wh-token-srv-prod-web-03', 30, 1);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (5, 'srv-prod-web-03', 3, 'Deployment Release v2.4.2', '{"deployer":"alice@hexly.ai","commit":"a2b8c9d"}', '["deploy","prod"]', '172.67.182.90', 1788998015);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (6, 'srv-prod-web-03', 3, 'Service Restart: nginx', '{"service":"nginx","exit_code":0}', '["systemd","maintenance"]', '172.67.182.90', 1789002215);
INSERT OR REPLACE INTO webhook_configs (id, host_id, token, rate_limit, is_active) VALUES (4, 'srv-prod-backend-01', 'wh-token-srv-prod-backend-01', 30, 1);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (7, 'srv-prod-backend-01', 4, 'Deployment Release v2.4.3', '{"deployer":"alice@hexly.ai","commit":"a3b8c9d"}', '["deploy","prod"]', '198.51.100.10', 1788994415);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (8, 'srv-prod-backend-01', 4, 'Service Restart: nginx', '{"service":"nginx","exit_code":0}', '["systemd","maintenance"]', '198.51.100.10', 1789000415);
INSERT OR REPLACE INTO webhook_configs (id, host_id, token, rate_limit, is_active) VALUES (5, 'srv-prod-backend-02', 'wh-token-srv-prod-backend-02', 30, 1);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (9, 'srv-prod-backend-02', 5, 'Deployment Release v2.4.4', '{"deployer":"alice@hexly.ai","commit":"a4b8c9d"}', '["deploy","prod"]', '198.51.100.11', 1788990815);
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
    VALUES (10, 'srv-prod-backend-02', 5, 'Service Restart: nginx', '{"service":"nginx","exit_code":0}', '["systemd","maintenance"]', '198.51.100.11', 1788998615);
