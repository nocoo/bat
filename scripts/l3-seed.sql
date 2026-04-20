-- L3 Playwright test seed data
-- Applied by scripts/l3-setup.sh after migrations

-- Two test hosts with realistic data
INSERT OR REPLACE INTO hosts (host_id, hostname, os, kernel, arch, cpu_model, boot_time, last_seen, identity_updated_at, is_active, cpu_logical, cpu_physical, mem_total_bytes, swap_total_bytes, virtualization, public_ip, probe_version)
VALUES
  ('pw-host-alpha', 'alpha.test.local', 'Ubuntu 24.04.2 LTS', '6.8.0-45-generic', 'x86_64', 'Intel Xeon E5-2680 v4', strftime('%s','now') - 86400, strftime('%s','now') - 30, strftime('%s','now') - 3600, 1, 8, 4, 8589934592, 2147483648, 'kvm', '203.0.113.10', '1.0.3'),
  ('pw-host-beta', 'beta.test.local', 'Debian 12.7', '6.1.0-25-arm64', 'aarch64', 'Ampere Altra Q80-30', strftime('%s','now') - 172800, strftime('%s','now') - 60, strftime('%s','now') - 7200, 1, 4, 4, 4294967296, 0, NULL, '198.51.100.20', '1.0.3');

-- Recent raw metrics for alpha (last hour, every 30s → 2 samples suffice for charts)
INSERT OR REPLACE INTO metrics_raw (host_id, ts, cpu_load1, cpu_load5, cpu_load15, cpu_usage_pct, cpu_iowait, cpu_steal, cpu_count, mem_total, mem_available, mem_used_pct, swap_total, swap_used, swap_used_pct, disk_json, net_json, uptime_seconds)
VALUES
  ('pw-host-alpha', strftime('%s','now') - 60, 1.2, 0.8, 0.5, 35.2, 1.1, 0.0, 8, 8589934592, 5368709120, 37.5, 2147483648, 214748365, 10.0, '[{"mount":"/","total_bytes":53687091200,"avail_bytes":32212254720,"used_pct":40.0}]', '[{"iface":"eth0","rx_bytes_rate":125000,"tx_bytes_rate":62500,"rx_errors":0,"tx_errors":0}]', 86340),
  ('pw-host-alpha', strftime('%s','now') - 30, 1.5, 0.9, 0.6, 42.1, 1.3, 0.1, 8, 8589934592, 5100000000, 40.6, 2147483648, 322122547, 15.0, '[{"mount":"/","total_bytes":53687091200,"avail_bytes":31000000000,"used_pct":42.3}]', '[{"iface":"eth0","rx_bytes_rate":200000,"tx_bytes_rate":100000,"rx_errors":0,"tx_errors":0}]', 86370),
  ('pw-host-beta', strftime('%s','now') - 45, 0.3, 0.2, 0.1, 12.4, 0.2, 0.0, 4, 4294967296, 3435973837, 20.0, 0, 0, 0.0, '[{"mount":"/","total_bytes":21474836480,"avail_bytes":16106127360,"used_pct":25.0}]', '[{"iface":"eth0","rx_bytes_rate":50000,"tx_bytes_rate":25000,"rx_errors":0,"tx_errors":0}]', 172755);

-- Tags
INSERT OR REPLACE INTO tags (id, name, color) VALUES
  (1, 'production', 0),
  (2, 'staging', 3),
  (3, 'us-east', 5);

-- Tag assignments
INSERT OR REPLACE INTO host_tags (host_id, tag_id) VALUES
  ('pw-host-alpha', 1),
  ('pw-host-alpha', 3),
  ('pw-host-beta', 2);

-- Alert states for alpha
INSERT OR REPLACE INTO alert_states (host_id, rule_id, severity, value, triggered_at, message)
VALUES
  ('pw-host-alpha', 'mem_high', 'warning', 85.2, strftime('%s','now') - 600, 'Memory usage 85.2% exceeds 80% threshold'),
  ('pw-host-alpha', 'disk_full', 'critical', 92.1, strftime('%s','now') - 300, 'Disk / usage 92.1% exceeds 90% threshold');

-- Webhook config for alpha
INSERT OR REPLACE INTO webhook_configs (id, host_id, token, rate_limit, is_active)
VALUES (1, 'pw-host-alpha', 'pw-test-token-abc123', 10, 1);

-- Events
INSERT OR REPLACE INTO events (id, host_id, webhook_config_id, title, body, tags, source_ip, created_at)
VALUES
  (1, 'pw-host-alpha', 1, 'Deploy v2.1.0', '{"version":"2.1.0","commit":"abc1234"}', '["deploy","release"]', '203.0.113.10', strftime('%s','now') - 3600),
  (2, 'pw-host-alpha', 1, 'Config reload', '{"service":"nginx"}', '["config"]', '203.0.113.10', strftime('%s','now') - 1800);
