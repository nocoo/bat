use std::collections::HashMap;
use std::time::Duration;

use crate::collectors;
use crate::collectors::cpu::CpuJiffies;
use crate::collectors::network::NetCounters;
use crate::payload::{
    CpuMetrics, DiskMetric, IdentityPayload, MemMetrics, MetricsPayload, NetMetric, SwapMetrics,
    Tier2DiskDeep, Tier2Docker, Tier2DockerContainer, Tier2DockerImages, Tier2FailedService,
    Tier2LargeFile, Tier2ListeningPort, Tier2PackageUpdate, Tier2Payload, Tier2Ports,
    Tier2Security, Tier2Systemd, Tier2TopDir, Tier2Updates,
};

/// Compute CPU usage delta from optional previous and current jiffies.
pub fn compute_cpu_delta(prev: Option<&CpuJiffies>, curr: Option<&CpuJiffies>) -> (f64, f64, f64) {
    match (prev, curr) {
        (Some(p), Some(c)) => collectors::cpu::compute_cpu_usage(p, c),
        _ => (0.0, 0.0, 0.0),
    }
}

/// Compute network metrics delta from optional previous and current counters.
pub fn compute_net_delta(
    prev: Option<&HashMap<String, NetCounters>>,
    curr: Option<&HashMap<String, NetCounters>>,
    elapsed: Duration,
) -> Vec<NetMetric> {
    match (prev, curr) {
        (Some(p), Some(c)) => {
            convert_net_infos(collectors::network::compute_net_metrics(p, c, elapsed))
        }
        _ => vec![],
    }
}

/// Build a [`MetricsPayload`] from collected system values.
#[allow(clippy::too_many_arguments)]
pub fn build_metrics_payload(
    probe_version: &str,
    host_id: &str,
    timestamp: u64,
    interval: u32,
    cpu_count: u32,
    usage: (f64, f64, f64),
    loadavg: (f64, f64, f64),
    mem: MemMetrics,
    swap: SwapMetrics,
    disk: Vec<DiskMetric>,
    net: Vec<NetMetric>,
    uptime_seconds: u64,
) -> MetricsPayload {
    MetricsPayload {
        probe_version: probe_version.to_string(),
        host_id: host_id.to_string(),
        timestamp,
        interval,
        cpu: CpuMetrics {
            load1: loadavg.0,
            load5: loadavg.1,
            load15: loadavg.2,
            usage_pct: usage.0,
            iowait_pct: usage.1,
            steal_pct: usage.2,
            count: cpu_count,
        },
        mem,
        swap,
        disk,
        net,
        uptime_seconds,
    }
}

/// Convert collector disk infos to payload disk metrics.
pub fn convert_disk_infos(infos: Vec<collectors::disk::DiskInfo>) -> Vec<DiskMetric> {
    infos
        .into_iter()
        .map(|d| DiskMetric {
            mount: d.mount,
            total_bytes: d.total_bytes,
            avail_bytes: d.avail_bytes,
            used_pct: d.used_pct,
        })
        .collect()
}

/// Convert collector net infos to payload net metrics.
pub fn convert_net_infos(infos: Vec<collectors::network::NetInfo>) -> Vec<NetMetric> {
    infos
        .into_iter()
        .map(|n| NetMetric {
            iface: n.iface,
            rx_bytes_rate: n.rx_bytes_rate,
            tx_bytes_rate: n.tx_bytes_rate,
            rx_errors: n.rx_errors,
            tx_errors: n.tx_errors,
        })
        .collect()
}

/// Compute boot time from current epoch seconds and uptime seconds.
pub const fn compute_boot_time(now_secs: u64, uptime_secs: u64) -> u64 {
    now_secs.saturating_sub(uptime_secs)
}

/// Build memory and swap metrics from an optional [`MemInfo`], defaulting to zero.
pub fn build_mem_swap_metrics(
    mem_info: Option<&collectors::memory::MemInfo>,
) -> (MemMetrics, SwapMetrics) {
    mem_info.map_or(
        (
            MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
            },
            SwapMetrics {
                total_bytes: 0,
                used_bytes: 0,
                used_pct: 0.0,
            },
        ),
        |info| {
            (
                MemMetrics {
                    total_bytes: info.mem_total,
                    available_bytes: info.mem_available,
                    used_pct: info.mem_used_pct,
                },
                SwapMetrics {
                    total_bytes: info.swap_total,
                    used_bytes: info.swap_used,
                    used_pct: info.swap_used_pct,
                },
            )
        },
    )
}

/// Build an [`IdentityPayload`] from collected system values.
#[allow(clippy::too_many_arguments)]
pub fn build_identity_payload(
    probe_version: &str,
    host_id: &str,
    hostname: &str,
    os: &str,
    kernel: &str,
    arch: &str,
    cpu_model: &str,
    uptime_seconds: u64,
    boot_time: u64,
) -> IdentityPayload {
    IdentityPayload {
        probe_version: probe_version.to_string(),
        host_id: host_id.to_string(),
        hostname: hostname.to_string(),
        os: os.to_string(),
        kernel: kernel.to_string(),
        arch: arch.to_string(),
        cpu_model: cpu_model.to_string(),
        uptime_seconds,
        boot_time,
    }
}

// --- Tier 2 conversion functions ---

use crate::collectors::tier2::disk_deep::DiskDeepScanInfo;
use crate::collectors::tier2::docker::DockerStatusInfo;
use crate::collectors::tier2::ports::ListeningPort;
use crate::collectors::tier2::security::SecurityPostureInfo;
use crate::collectors::tier2::systemd::SystemdServicesInfo;
use crate::collectors::tier2::updates::PackageUpdatesInfo;

/// Convert collector ports to payload ports.
pub fn convert_ports(ports: Vec<ListeningPort>) -> Tier2Ports {
    Tier2Ports {
        listening: ports
            .into_iter()
            .map(|p| Tier2ListeningPort {
                port: p.port,
                bind: p.bind,
                protocol: p.protocol,
                pid: p.pid,
                process: p.process,
            })
            .collect(),
    }
}

/// Convert collector updates to payload updates.
pub fn convert_updates(info: PackageUpdatesInfo) -> Tier2Updates {
    Tier2Updates {
        total_count: info.total_count,
        security_count: info.security_count,
        list: info
            .list
            .into_iter()
            .map(|u| Tier2PackageUpdate {
                name: u.name,
                current_version: u.current_version,
                new_version: u.new_version,
                is_security: u.is_security,
            })
            .collect(),
        reboot_required: info.reboot_required,
        cache_age_seconds: info.cache_age_seconds,
    }
}

/// Convert collector systemd to payload systemd.
pub fn convert_systemd(info: SystemdServicesInfo) -> Tier2Systemd {
    Tier2Systemd {
        failed_count: info.failed_count,
        failed: info
            .failed
            .into_iter()
            .map(|s| Tier2FailedService {
                unit: s.unit,
                load_state: s.load_state,
                active_state: s.active_state,
                sub_state: s.sub_state,
                description: s.description,
            })
            .collect(),
    }
}

/// Convert collector security to payload security.
pub fn convert_security(info: SecurityPostureInfo) -> Tier2Security {
    Tier2Security {
        ssh_password_auth: info.ssh_password_auth,
        ssh_root_login: info.ssh_root_login,
        ssh_failed_logins_7d: info.ssh_failed_logins_7d,
        firewall_active: info.firewall_active,
        firewall_default_policy: info.firewall_default_policy,
        fail2ban_active: info.fail2ban_active,
        fail2ban_banned_count: info.fail2ban_banned_count,
        unattended_upgrades_active: info.unattended_upgrades_active,
    }
}

/// Convert collector docker to payload docker.
pub fn convert_docker(info: DockerStatusInfo) -> Tier2Docker {
    Tier2Docker {
        installed: info.installed,
        version: info.version,
        containers: info
            .containers
            .into_iter()
            .map(|c| Tier2DockerContainer {
                id: c.id,
                name: c.name,
                image: c.image,
                status: c.status,
                state: c.state,
                cpu_pct: c.cpu_pct,
                mem_bytes: c.mem_bytes,
                restart_count: c.restart_count,
                started_at: c.started_at,
            })
            .collect(),
        images: info.images.map(|i| Tier2DockerImages {
            total_count: i.total_count,
            total_bytes: i.total_bytes,
            reclaimable_bytes: i.reclaimable_bytes,
        }),
    }
}

/// Convert collector disk deep to payload disk deep.
pub fn convert_disk_deep(info: DiskDeepScanInfo) -> Tier2DiskDeep {
    Tier2DiskDeep {
        top_dirs: info
            .top_dirs
            .into_iter()
            .map(|d| Tier2TopDir {
                path: d.path,
                size_bytes: d.size_bytes,
            })
            .collect(),
        journal_bytes: info.journal_bytes,
        large_files: info
            .large_files
            .into_iter()
            .map(|f| Tier2LargeFile {
                path: f.path,
                size_bytes: f.size_bytes,
            })
            .collect(),
    }
}

/// Build a [`Tier2Payload`] from collected tier 2 data.
#[allow(clippy::too_many_arguments)]
pub fn build_tier2_payload(
    probe_version: &str,
    host_id: &str,
    timestamp: u64,
    ports: Option<Tier2Ports>,
    updates: Option<Tier2Updates>,
    systemd: Option<Tier2Systemd>,
    security: Option<Tier2Security>,
    docker: Option<Tier2Docker>,
    disk_deep: Option<Tier2DiskDeep>,
) -> Tier2Payload {
    Tier2Payload {
        probe_version: probe_version.to_string(),
        host_id: host_id.to_string(),
        timestamp,
        ports,
        updates,
        systemd,
        security,
        docker,
        disk_deep,
    }
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn build_identity_payload_normal() {
        let p = build_identity_payload(
            "0.2.0",
            "host-1",
            "myserver",
            "Ubuntu 22.04",
            "5.15.0",
            "x86_64",
            "Intel Xeon",
            86400,
            1_700_000_000,
        );
        assert_eq!(p.probe_version, "0.2.0");
        assert_eq!(p.host_id, "host-1");
        assert_eq!(p.hostname, "myserver");
        assert_eq!(p.os, "Ubuntu 22.04");
        assert_eq!(p.kernel, "5.15.0");
        assert_eq!(p.arch, "x86_64");
        assert_eq!(p.cpu_model, "Intel Xeon");
        assert_eq!(p.uptime_seconds, 86400);
        assert_eq!(p.boot_time, 1_700_000_000);
    }

    #[test]
    fn build_identity_payload_empty_fields() {
        let p = build_identity_payload("", "", "", "", "", "", "", 0, 0);
        assert_eq!(p.host_id, "");
        assert_eq!(p.hostname, "");
        assert_eq!(p.uptime_seconds, 0);
        assert_eq!(p.boot_time, 0);
    }

    #[test]
    fn build_mem_swap_metrics_with_some() {
        use collectors::memory::MemInfo;

        let info = MemInfo {
            mem_total: 4_000_000,
            mem_available: 2_000_000,
            mem_used_pct: 50.0,
            swap_total: 1_000_000,
            swap_free: 500_000,
            swap_used: 500_000,
            swap_used_pct: 50.0,
        };
        let (mem, swap) = build_mem_swap_metrics(Some(&info));
        assert_eq!(mem.total_bytes, 4_000_000);
        assert_eq!(mem.available_bytes, 2_000_000);
        assert_eq!(swap.total_bytes, 1_000_000);
        assert_eq!(swap.used_bytes, 500_000);
    }

    #[test]
    fn build_mem_swap_metrics_with_none() {
        let (mem, swap) = build_mem_swap_metrics(None);
        assert_eq!(mem.total_bytes, 0);
        assert_eq!(mem.available_bytes, 0);
        assert_eq!(swap.total_bytes, 0);
        assert_eq!(swap.used_bytes, 0);
    }

    #[test]
    fn build_metrics_payload_normal() {
        let mem = MemMetrics {
            total_bytes: 4_000_000,
            available_bytes: 2_000_000,
            used_pct: 50.0,
        };
        let swap = SwapMetrics {
            total_bytes: 1_000_000,
            used_bytes: 500_000,
            used_pct: 50.0,
        };
        let disk = vec![DiskMetric {
            mount: "/".into(),
            total_bytes: 100,
            avail_bytes: 50,
            used_pct: 50.0,
        }];
        let net = vec![NetMetric {
            iface: "eth0".into(),
            rx_bytes_rate: 100.0,
            tx_bytes_rate: 200.0,
            rx_errors: 0,
            tx_errors: 0,
        }];
        let p = build_metrics_payload(
            "0.2.0",
            "host-1",
            1_700_000_000,
            30,
            4,
            (12.5, 1.2, 0.0),
            (0.5, 0.3, 0.2),
            mem,
            swap,
            disk,
            net,
            86400,
        );
        assert_eq!(p.host_id, "host-1");
        assert_eq!(p.timestamp, 1_700_000_000);
        assert_eq!(p.interval, 30);
        assert_eq!(p.cpu.count, 4);
        assert_eq!(p.cpu.usage_pct, 12.5);
        assert_eq!(p.cpu.load1, 0.5);
        assert_eq!(p.disk.len(), 1);
        assert_eq!(p.net.len(), 1);
        assert_eq!(p.uptime_seconds, 86400);
    }

    #[test]
    fn build_metrics_payload_empty_collections() {
        let mem = MemMetrics {
            total_bytes: 0,
            available_bytes: 0,
            used_pct: 0.0,
        };
        let swap = SwapMetrics {
            total_bytes: 0,
            used_bytes: 0,
            used_pct: 0.0,
        };
        let p = build_metrics_payload(
            "0.2.0",
            "h",
            0,
            30,
            1,
            (0.0, 0.0, 0.0),
            (0.0, 0.0, 0.0),
            mem,
            swap,
            vec![],
            vec![],
            0,
        );
        assert!(p.disk.is_empty());
        assert!(p.net.is_empty());
    }

    #[test]
    fn convert_disk_infos_normal() {
        use collectors::disk::DiskInfo;
        let infos = vec![DiskInfo {
            mount: "/data".into(),
            total_bytes: 1000,
            avail_bytes: 400,
            used_pct: 60.0,
        }];
        let metrics = convert_disk_infos(infos);
        assert_eq!(metrics.len(), 1);
        assert_eq!(metrics[0].mount, "/data");
        assert_eq!(metrics[0].total_bytes, 1000);
    }

    #[test]
    fn convert_disk_infos_empty() {
        let metrics = convert_disk_infos(vec![]);
        assert!(metrics.is_empty());
    }

    #[test]
    fn convert_net_infos_normal() {
        use collectors::network::NetInfo;
        let infos = vec![NetInfo {
            iface: "eth0".into(),
            rx_bytes_rate: 100.0,
            tx_bytes_rate: 200.0,
            rx_errors: 1,
            tx_errors: 2,
        }];
        let metrics = convert_net_infos(infos);
        assert_eq!(metrics.len(), 1);
        assert_eq!(metrics[0].iface, "eth0");
        assert_eq!(metrics[0].rx_bytes_rate, 100.0);
    }

    #[test]
    fn convert_net_infos_empty() {
        let metrics = convert_net_infos(vec![]);
        assert!(metrics.is_empty());
    }

    #[test]
    fn compute_boot_time_normal() {
        assert_eq!(compute_boot_time(1_700_000_000, 86400), 1_699_913_600);
    }

    #[test]
    fn compute_boot_time_uptime_exceeds_now() {
        // saturating_sub should clamp to 0
        assert_eq!(compute_boot_time(100, 200), 0);
    }

    #[test]
    fn compute_boot_time_zero_uptime() {
        assert_eq!(compute_boot_time(1_700_000_000, 0), 1_700_000_000);
    }

    #[test]
    fn compute_cpu_delta_with_both() {
        let prev = CpuJiffies {
            user: 10000,
            nice: 200,
            system: 3000,
            idle: 40000,
            ..Default::default()
        };
        let curr = CpuJiffies {
            user: 11000,
            nice: 200,
            system: 3500,
            idle: 45000,
            ..Default::default()
        };
        let (usage, _, _) = compute_cpu_delta(Some(&prev), Some(&curr));
        assert!(usage > 0.0);
    }

    #[test]
    fn compute_cpu_delta_missing_prev() {
        let curr = CpuJiffies {
            user: 11000,
            ..Default::default()
        };
        let (usage, iowait, steal) = compute_cpu_delta(None, Some(&curr));
        assert_eq!(usage, 0.0);
        assert_eq!(iowait, 0.0);
        assert_eq!(steal, 0.0);
    }

    #[test]
    fn compute_cpu_delta_missing_curr() {
        let prev = CpuJiffies {
            user: 10000,
            ..Default::default()
        };
        let (usage, iowait, steal) = compute_cpu_delta(Some(&prev), None);
        assert_eq!(usage, 0.0);
        assert_eq!(iowait, 0.0);
        assert_eq!(steal, 0.0);
    }

    #[test]
    fn compute_cpu_delta_both_none() {
        let (usage, iowait, steal) = compute_cpu_delta(None, None);
        assert_eq!(usage, 0.0);
        assert_eq!(iowait, 0.0);
        assert_eq!(steal, 0.0);
    }

    #[test]
    fn compute_net_delta_with_both() {
        use collectors::network::NetCounters;
        let mut prev = HashMap::new();
        prev.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 1000,
                tx_bytes: 2000,
                ..Default::default()
            },
        );
        let mut curr = HashMap::new();
        curr.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 4000,
                tx_bytes: 5000,
                ..Default::default()
            },
        );
        let metrics = compute_net_delta(Some(&prev), Some(&curr), Duration::from_secs(30));
        assert_eq!(metrics.len(), 1);
        assert_eq!(metrics[0].iface, "eth0");
    }

    #[test]
    fn compute_net_delta_missing_prev() {
        use collectors::network::NetCounters;
        let mut curr = HashMap::new();
        curr.insert("eth0".to_string(), NetCounters::default());
        let metrics = compute_net_delta(None, Some(&curr), Duration::from_secs(30));
        assert!(metrics.is_empty());
    }

    #[test]
    fn compute_net_delta_both_none() {
        let metrics = compute_net_delta(None, None, Duration::from_secs(30));
        assert!(metrics.is_empty());
    }

    // --- Tier 2 conversion tests ---

    #[test]
    fn convert_ports_normal() {
        let ports = vec![ListeningPort {
            port: 22,
            bind: "0.0.0.0".into(),
            protocol: "tcp".into(),
            pid: Some(1234),
            process: Some("sshd".into()),
        }];
        let result = convert_ports(ports);
        assert_eq!(result.listening.len(), 1);
        assert_eq!(result.listening[0].port, 22);
        assert_eq!(result.listening[0].bind, "0.0.0.0");
        assert_eq!(result.listening[0].process, Some("sshd".into()));
    }

    #[test]
    fn convert_ports_empty() {
        let result = convert_ports(vec![]);
        assert!(result.listening.is_empty());
    }

    #[test]
    fn convert_updates_normal() {
        use collectors::tier2::updates::PackageUpdate;
        let info = PackageUpdatesInfo {
            total_count: 2,
            security_count: 1,
            list: vec![PackageUpdate {
                name: "openssl".into(),
                current_version: "3.0.0".into(),
                new_version: "3.0.1".into(),
                is_security: true,
            }],
            reboot_required: false,
            cache_age_seconds: Some(3600),
        };
        let result = convert_updates(info);
        assert_eq!(result.total_count, 2);
        assert_eq!(result.security_count, 1);
        assert_eq!(result.list.len(), 1);
        assert_eq!(result.list[0].name, "openssl");
        assert!(result.list[0].is_security);
        assert!(!result.reboot_required);
        assert_eq!(result.cache_age_seconds, Some(3600));
    }

    #[test]
    fn convert_systemd_normal() {
        use collectors::tier2::systemd::FailedService;
        let info = SystemdServicesInfo {
            failed_count: 1,
            failed: vec![FailedService {
                unit: "nginx.service".into(),
                load_state: "loaded".into(),
                active_state: "failed".into(),
                sub_state: "failed".into(),
                description: "The nginx HTTP server".into(),
            }],
        };
        let result = convert_systemd(info);
        assert_eq!(result.failed_count, 1);
        assert_eq!(result.failed.len(), 1);
        assert_eq!(result.failed[0].unit, "nginx.service");
        assert_eq!(result.failed[0].description, "The nginx HTTP server");
    }

    #[test]
    fn convert_security_normal() {
        let info = SecurityPostureInfo {
            ssh_password_auth: Some(false),
            ssh_root_login: Some("no".into()),
            ssh_failed_logins_7d: Some(42),
            firewall_active: Some(true),
            firewall_default_policy: Some("deny".into()),
            fail2ban_active: Some(true),
            fail2ban_banned_count: Some(3),
            unattended_upgrades_active: Some(true),
        };
        let result = convert_security(info);
        assert_eq!(result.ssh_password_auth, Some(false));
        assert_eq!(result.ssh_root_login, Some("no".into()));
        assert_eq!(result.ssh_failed_logins_7d, Some(42));
        assert_eq!(result.firewall_active, Some(true));
        assert_eq!(result.fail2ban_banned_count, Some(3));
    }

    #[test]
    fn convert_docker_normal() {
        use collectors::tier2::docker::{DockerContainer, DockerImagesInfo};
        let info = DockerStatusInfo {
            installed: true,
            version: Some("24.0.5".into()),
            containers: vec![DockerContainer {
                id: "abc123".into(),
                name: "web".into(),
                image: "nginx:latest".into(),
                status: "Up 2 hours".into(),
                state: "running".into(),
                cpu_pct: Some(1.5),
                mem_bytes: Some(50_000_000),
                restart_count: 0,
                started_at: Some(1_700_000_000),
            }],
            images: Some(DockerImagesInfo {
                total_count: 5,
                total_bytes: 1_000_000_000,
                reclaimable_bytes: 200_000_000,
            }),
        };
        let result = convert_docker(info);
        assert!(result.installed);
        assert_eq!(result.version, Some("24.0.5".into()));
        assert_eq!(result.containers.len(), 1);
        assert_eq!(result.containers[0].name, "web");
        assert_eq!(result.containers[0].restart_count, 0);
        let imgs = result.images.unwrap();
        assert_eq!(imgs.total_count, 5);
        assert_eq!(imgs.reclaimable_bytes, 200_000_000);
    }

    #[test]
    fn convert_docker_no_images() {
        let info = DockerStatusInfo {
            installed: true,
            version: None,
            containers: vec![],
            images: None,
        };
        let result = convert_docker(info);
        assert!(result.images.is_none());
    }

    #[test]
    fn convert_disk_deep_normal() {
        use collectors::tier2::disk_deep::{LargeFile, TopDir};
        let info = DiskDeepScanInfo {
            top_dirs: vec![TopDir {
                path: "/var/log".into(),
                size_bytes: 500_000_000,
            }],
            journal_bytes: Some(100_000_000),
            large_files: vec![LargeFile {
                path: "/var/log/syslog".into(),
                size_bytes: 50_000_000,
            }],
        };
        let result = convert_disk_deep(info);
        assert_eq!(result.top_dirs.len(), 1);
        assert_eq!(result.top_dirs[0].path, "/var/log");
        assert_eq!(result.journal_bytes, Some(100_000_000));
        assert_eq!(result.large_files.len(), 1);
        assert_eq!(result.large_files[0].size_bytes, 50_000_000);
    }

    #[test]
    fn build_tier2_payload_normal() {
        let payload = build_tier2_payload(
            "0.2.0",
            "host-1",
            1_700_000_000,
            Some(convert_ports(vec![])),
            None,
            None,
            None,
            None,
            None,
        );
        assert_eq!(payload.probe_version, "0.2.0");
        assert_eq!(payload.host_id, "host-1");
        assert_eq!(payload.timestamp, 1_700_000_000);
        assert!(payload.ports.is_some());
        assert!(payload.updates.is_none());
    }

    #[test]
    fn net_delta_different_elapsed_produces_different_rates() {
        use collectors::network::NetCounters;

        let mut prev = HashMap::new();
        prev.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 1000,
                tx_bytes: 2000,
                ..Default::default()
            },
        );
        let mut curr = HashMap::new();
        curr.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 4000,
                tx_bytes: 5000,
                ..Default::default()
            },
        );

        // Same delta (3000 bytes), different elapsed → different rates
        let m30 = compute_net_delta(Some(&prev), Some(&curr), Duration::from_secs(30));
        let m60 = compute_net_delta(Some(&prev), Some(&curr), Duration::from_secs(60));
        let m90 = compute_net_delta(Some(&prev), Some(&curr), Duration::from_secs(90));

        assert_eq!(m30.len(), 1);
        assert_eq!(m60.len(), 1);
        assert_eq!(m90.len(), 1);

        // 3000/30 = 100, 3000/60 = 50, 3000/90 ≈ 33.3
        assert!(m30[0].rx_bytes_rate > m60[0].rx_bytes_rate);
        assert!(m60[0].rx_bytes_rate > m90[0].rx_bytes_rate);
        assert!((m30[0].rx_bytes_rate - 100.0).abs() < f64::EPSILON);
        assert!((m60[0].rx_bytes_rate - 50.0).abs() < f64::EPSILON);
    }
}
