use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct MetricsPayload {
    pub probe_version: String,
    pub host_id: String,
    pub timestamp: u64,
    pub interval: u32,
    pub cpu: CpuMetrics,
    pub mem: MemMetrics,
    pub swap: SwapMetrics,
    pub disk: Vec<DiskMetric>,
    pub net: Vec<NetMetric>,
    pub uptime_seconds: u64,
    /// Tier 3: PSI pressure — None if kernel < 4.20 or `CONFIG_PSI=n`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub psi: Option<PsiMetrics>,
    /// Tier 3: Disk I/O per device — delta counters from `/proc/diskstats`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_io: Option<Vec<DiskIoMetric>>,
    /// Tier 3: TCP connection state from `/proc/net/sockstat`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tcp: Option<TcpMetrics>,
    /// Tier 3: System-wide file descriptor usage from `/proc/sys/fs/file-nr`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fd: Option<FdMetrics>,
}

#[derive(Debug, Serialize)]
pub struct CpuMetrics {
    pub load1: f64,
    pub load5: f64,
    pub load15: f64,
    pub usage_pct: f64,
    pub iowait_pct: f64,
    pub steal_pct: f64,
    pub count: u32,
    /// Tier 3: context switches per second (delta from `/proc/stat` ctxt)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_switches_sec: Option<f64>,
    /// Tier 3: forks per second (delta from `/proc/stat` processes)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub forks_sec: Option<f64>,
    /// Tier 3: number of processes in runnable state
    #[serde(skip_serializing_if = "Option::is_none")]
    pub procs_running: Option<u32>,
    /// Tier 3: number of processes waiting for I/O
    #[serde(skip_serializing_if = "Option::is_none")]
    pub procs_blocked: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct MemMetrics {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_pct: f64,
    /// Tier 3: OOM kills since last sample (delta from `/proc/vmstat` `oom_kill`)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oom_kills_delta: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct SwapMetrics {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub used_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct DiskMetric {
    pub mount: String,
    pub total_bytes: u64,
    pub avail_bytes: u64,
    pub used_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct NetMetric {
    pub iface: String,
    pub rx_bytes_rate: f64,
    pub tx_bytes_rate: f64,
    pub rx_errors: u64,
    pub tx_errors: u64,
}

#[derive(Debug, Serialize)]
pub struct PsiMetrics {
    pub cpu_some_avg10: f64,
    pub cpu_some_avg60: f64,
    pub cpu_some_avg300: f64,
    pub mem_some_avg10: f64,
    pub mem_some_avg60: f64,
    pub mem_some_avg300: f64,
    pub mem_full_avg10: f64,
    pub mem_full_avg60: f64,
    pub mem_full_avg300: f64,
    pub io_some_avg10: f64,
    pub io_some_avg60: f64,
    pub io_some_avg300: f64,
    pub io_full_avg10: f64,
    pub io_full_avg60: f64,
    pub io_full_avg300: f64,
}

#[derive(Debug, Serialize)]
pub struct DiskIoMetric {
    pub device: String,
    pub read_iops: f64,
    pub write_iops: f64,
    pub read_bytes_sec: f64,
    pub write_bytes_sec: f64,
    pub io_util_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct TcpMetrics {
    pub established: u32,
    pub time_wait: u32,
    pub orphan: u32,
    pub allocated: u32,
}

#[derive(Debug, Serialize)]
pub struct FdMetrics {
    pub allocated: u64,
    pub max: u64,
}

#[derive(Debug, Serialize)]
pub struct IdentityPayload {
    pub probe_version: String,
    pub host_id: String,
    pub hostname: String,
    pub os: String,
    pub kernel: String,
    pub arch: String,
    pub cpu_model: String,
    pub uptime_seconds: u64,
    pub boot_time: u64,
    // --- Host inventory fields (optional for backward compat) ---
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_logical: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_physical: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mem_total_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swap_total_bytes: Option<u64>,
}

// --- Tier 2 payload types ---

#[derive(Debug, Serialize)]
pub struct Tier2Payload {
    pub probe_version: String,
    pub host_id: String,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ports: Option<Tier2Ports>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updates: Option<Tier2Updates>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub systemd: Option<Tier2Systemd>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub security: Option<Tier2Security>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docker: Option<Tier2Docker>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_deep: Option<Tier2DiskDeep>,
}

#[derive(Debug, Serialize)]
pub struct Tier2ListeningPort {
    pub port: u16,
    pub bind: String,
    pub protocol: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Tier2Ports {
    pub listening: Vec<Tier2ListeningPort>,
}

#[derive(Debug, Serialize)]
pub struct Tier2PackageUpdate {
    pub name: String,
    pub current_version: String,
    pub new_version: String,
    pub is_security: bool,
}

#[derive(Debug, Serialize)]
pub struct Tier2Updates {
    pub total_count: u32,
    pub security_count: u32,
    pub list: Vec<Tier2PackageUpdate>,
    pub reboot_required: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_age_seconds: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct Tier2FailedService {
    pub unit: String,
    pub load_state: String,
    pub active_state: String,
    pub sub_state: String,
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct Tier2Systemd {
    pub failed_count: u32,
    pub failed: Vec<Tier2FailedService>,
}

#[derive(Debug, Serialize)]
pub struct Tier2Security {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_password_auth: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_root_login: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssh_failed_logins_7d: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub firewall_active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub firewall_default_policy: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fail2ban_active: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fail2ban_banned_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unattended_upgrades_active: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct Tier2DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_pct: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mem_bytes: Option<u64>,
    pub restart_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub started_at: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct Tier2DockerImages {
    pub total_count: u32,
    pub total_bytes: u64,
    pub reclaimable_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct Tier2Docker {
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub containers: Vec<Tier2DockerContainer>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub images: Option<Tier2DockerImages>,
}

#[derive(Debug, Serialize)]
pub struct Tier2TopDir {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct Tier2LargeFile {
    pub path: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct Tier2DiskDeep {
    pub top_dirs: Vec<Tier2TopDir>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub journal_bytes: Option<u64>,
    pub large_files: Vec<Tier2LargeFile>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_payload_serializes_expected_fields() {
        let payload = MetricsPayload {
            probe_version: "0.2.0".into(),
            host_id: "test-host".into(),
            timestamp: 1_700_000_000,
            interval: 30,
            cpu: CpuMetrics {
                load1: 0.5,
                load5: 0.3,
                load15: 0.2,
                usage_pct: 12.5,
                iowait_pct: 1.2,
                steal_pct: 0.0,
                count: 4,
                context_switches_sec: None,
                forks_sec: None,
                procs_running: None,
                procs_blocked: None,
            },
            mem: MemMetrics {
                total_bytes: 4_000_000_000,
                available_bytes: 2_000_000_000,
                used_pct: 50.0,
                oom_kills_delta: None,
            },
            swap: SwapMetrics {
                total_bytes: 2_000_000_000,
                used_bytes: 500_000_000,
                used_pct: 25.0,
            },
            disk: vec![DiskMetric {
                mount: "/".into(),
                total_bytes: 50_000_000_000,
                avail_bytes: 30_000_000_000,
                used_pct: 40.0,
            }],
            net: vec![NetMetric {
                iface: "eth0".into(),
                rx_bytes_rate: 1024.5,
                tx_bytes_rate: 512.3,
                rx_errors: 0,
                tx_errors: 0,
            }],
            uptime_seconds: 86400,
            psi: None,
            disk_io: None,
            tcp: None,
            fd: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();

        // Top-level fields
        assert_eq!(json["probe_version"], "0.2.0");
        assert_eq!(json["host_id"], "test-host");
        assert_eq!(json["timestamp"], 1_700_000_000_u64);
        assert_eq!(json["interval"], 30);
        assert_eq!(json["uptime_seconds"], 86400);

        // CPU nested fields
        assert_eq!(json["cpu"]["load1"], 0.5);
        assert_eq!(json["cpu"]["usage_pct"], 12.5);
        assert_eq!(json["cpu"]["iowait_pct"], 1.2);
        assert_eq!(json["cpu"]["steal_pct"], 0.0);
        assert_eq!(json["cpu"]["count"], 4);

        // Memory
        assert_eq!(json["mem"]["total_bytes"], 4_000_000_000u64);
        assert_eq!(json["mem"]["available_bytes"], 2_000_000_000u64);
        assert_eq!(json["mem"]["used_pct"], 50.0);

        // Swap
        assert_eq!(json["swap"]["total_bytes"], 2_000_000_000u64);
        assert_eq!(json["swap"]["used_bytes"], 500_000_000u64);
        assert_eq!(json["swap"]["used_pct"], 25.0);

        // Disk array
        assert_eq!(json["disk"][0]["mount"], "/");
        assert_eq!(json["disk"][0]["total_bytes"], 50_000_000_000u64);
        assert_eq!(json["disk"][0]["avail_bytes"], 30_000_000_000u64);
        assert_eq!(json["disk"][0]["used_pct"], 40.0);

        // Net array
        assert_eq!(json["net"][0]["iface"], "eth0");
        assert_eq!(json["net"][0]["rx_bytes_rate"], 1024.5);
        assert_eq!(json["net"][0]["tx_bytes_rate"], 512.3);
        assert_eq!(json["net"][0]["rx_errors"], 0);
        assert_eq!(json["net"][0]["tx_errors"], 0);
    }

    #[test]
    fn identity_payload_serializes_expected_fields() {
        let payload = IdentityPayload {
            probe_version: "0.2.0".into(),
            host_id: "test-host".into(),
            hostname: "myserver".into(),
            os: "Ubuntu 22.04.3 LTS".into(),
            kernel: "5.15.0-91-generic".into(),
            arch: "x86_64".into(),
            cpu_model: "Intel Xeon E5-2680".into(),
            uptime_seconds: 86400,
            boot_time: 1_699_913_600,
            cpu_logical: Some(8),
            cpu_physical: Some(4),
            mem_total_bytes: Some(8_388_608_000),
            swap_total_bytes: Some(2_147_483_648),
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();

        assert_eq!(json["probe_version"], "0.2.0");
        assert_eq!(json["host_id"], "test-host");
        assert_eq!(json["hostname"], "myserver");
        assert_eq!(json["os"], "Ubuntu 22.04.3 LTS");
        assert_eq!(json["kernel"], "5.15.0-91-generic");
        assert_eq!(json["arch"], "x86_64");
        assert_eq!(json["cpu_model"], "Intel Xeon E5-2680");
        assert_eq!(json["uptime_seconds"], 86400);
        assert_eq!(json["boot_time"], 1_699_913_600_u64);
        assert_eq!(json["cpu_logical"], 8);
        assert_eq!(json["cpu_physical"], 4);
        assert_eq!(json["mem_total_bytes"], 8_388_608_000_u64);
        assert_eq!(json["swap_total_bytes"], 2_147_483_648_u64);
    }

    #[test]
    fn identity_payload_omits_none_inventory_fields() {
        let payload = IdentityPayload {
            probe_version: "0.2.0".into(),
            host_id: "test-host".into(),
            hostname: "myserver".into(),
            os: "Ubuntu 22.04.3 LTS".into(),
            kernel: "5.15.0-91-generic".into(),
            arch: "x86_64".into(),
            cpu_model: "Intel Xeon E5-2680".into(),
            uptime_seconds: 86400,
            boot_time: 1_699_913_600,
            cpu_logical: None,
            cpu_physical: None,
            mem_total_bytes: None,
            swap_total_bytes: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        let obj = json.as_object().unwrap();
        assert!(!obj.contains_key("cpu_logical"));
        assert!(!obj.contains_key("cpu_physical"));
        assert!(!obj.contains_key("mem_total_bytes"));
        assert!(!obj.contains_key("swap_total_bytes"));
    }

    #[test]
    fn metrics_payload_empty_arrays() {
        let payload = MetricsPayload {
            probe_version: "0.2.0".into(),
            host_id: "h".into(),
            timestamp: 0,
            interval: 30,
            cpu: CpuMetrics {
                load1: 0.0,
                load5: 0.0,
                load15: 0.0,
                usage_pct: 0.0,
                iowait_pct: 0.0,
                steal_pct: 0.0,
                count: 1,
                context_switches_sec: None,
                forks_sec: None,
                procs_running: None,
                procs_blocked: None,
            },
            mem: MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
                oom_kills_delta: None,
            },
            swap: SwapMetrics {
                total_bytes: 0,
                used_bytes: 0,
                used_pct: 0.0,
            },
            disk: vec![],
            net: vec![],
            uptime_seconds: 0,
            psi: None,
            disk_io: None,
            tcp: None,
            fd: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        assert!(json["disk"].as_array().unwrap().is_empty());
        assert!(json["net"].as_array().unwrap().is_empty());
    }

    #[test]
    fn tier2_payload_full_serializes_all_fields() {
        let payload = Tier2Payload {
            probe_version: "0.2.1".into(),
            host_id: "host-42".into(),
            timestamp: 1_710_000_000,
            ports: Some(Tier2Ports {
                listening: vec![Tier2ListeningPort {
                    port: 22,
                    bind: "0.0.0.0".into(),
                    protocol: "tcp".into(),
                    pid: Some(1234),
                    process: Some("sshd".into()),
                }],
            }),
            updates: Some(Tier2Updates {
                total_count: 3,
                security_count: 1,
                list: vec![Tier2PackageUpdate {
                    name: "openssl".into(),
                    current_version: "3.0.0".into(),
                    new_version: "3.0.1".into(),
                    is_security: true,
                }],
                reboot_required: false,
                cache_age_seconds: Some(7200),
            }),
            systemd: Some(Tier2Systemd {
                failed_count: 1,
                failed: vec![Tier2FailedService {
                    unit: "nginx.service".into(),
                    load_state: "loaded".into(),
                    active_state: "failed".into(),
                    sub_state: "failed".into(),
                    description: "The nginx HTTP server".into(),
                }],
            }),
            security: Some(Tier2Security {
                ssh_password_auth: Some(false),
                ssh_root_login: Some("no".into()),
                ssh_failed_logins_7d: Some(42),
                firewall_active: Some(true),
                firewall_default_policy: Some("deny".into()),
                fail2ban_active: Some(true),
                fail2ban_banned_count: Some(5),
                unattended_upgrades_active: Some(true),
            }),
            docker: Some(Tier2Docker {
                installed: true,
                version: Some("24.0.5".into()),
                containers: vec![Tier2DockerContainer {
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
                images: Some(Tier2DockerImages {
                    total_count: 5,
                    total_bytes: 1_000_000_000,
                    reclaimable_bytes: 200_000_000,
                }),
            }),
            disk_deep: Some(Tier2DiskDeep {
                top_dirs: vec![Tier2TopDir {
                    path: "/var".into(),
                    size_bytes: 500_000_000,
                }],
                journal_bytes: Some(100_000_000),
                large_files: vec![Tier2LargeFile {
                    path: "/var/log/syslog".into(),
                    size_bytes: 150_000_000,
                }],
            }),
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();

        // Top-level fields
        assert_eq!(json["probe_version"], "0.2.1");
        assert_eq!(json["host_id"], "host-42");
        assert_eq!(json["timestamp"], 1_710_000_000_u64);

        // Ports
        assert_eq!(json["ports"]["listening"][0]["port"], 22);
        assert_eq!(json["ports"]["listening"][0]["bind"], "0.0.0.0");
        assert_eq!(json["ports"]["listening"][0]["pid"], 1234);
        assert_eq!(json["ports"]["listening"][0]["process"], "sshd");

        // Updates
        assert_eq!(json["updates"]["total_count"], 3);
        assert_eq!(json["updates"]["security_count"], 1);
        assert_eq!(json["updates"]["list"][0]["name"], "openssl");
        assert!(json["updates"]["list"][0]["is_security"].as_bool().unwrap());
        assert_eq!(json["updates"]["cache_age_seconds"], 7200);

        // Systemd
        assert_eq!(json["systemd"]["failed_count"], 1);
        assert_eq!(json["systemd"]["failed"][0]["unit"], "nginx.service");

        // Security
        assert_eq!(json["security"]["ssh_password_auth"], false);
        assert_eq!(json["security"]["ssh_root_login"], "no");
        assert_eq!(json["security"]["ssh_failed_logins_7d"], 42);
        assert_eq!(json["security"]["fail2ban_banned_count"], 5);

        // Docker
        assert!(json["docker"]["installed"].as_bool().unwrap());
        assert_eq!(json["docker"]["version"], "24.0.5");
        assert_eq!(json["docker"]["containers"][0]["name"], "web");
        assert_eq!(json["docker"]["images"]["total_count"], 5);

        // Disk deep
        assert_eq!(json["disk_deep"]["top_dirs"][0]["path"], "/var");
        assert_eq!(json["disk_deep"]["journal_bytes"], 100_000_000);
        assert_eq!(
            json["disk_deep"]["large_files"][0]["size_bytes"],
            150_000_000_u64
        );
    }

    #[test]
    fn tier2_payload_sparse_skips_none_fields() {
        let payload = Tier2Payload {
            probe_version: "0.2.1".into(),
            host_id: "host-1".into(),
            timestamp: 1_710_000_000,
            ports: None,
            updates: None,
            systemd: None,
            security: None,
            docker: None,
            disk_deep: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();

        // Required fields present
        assert_eq!(json["probe_version"], "0.2.1");
        assert_eq!(json["host_id"], "host-1");
        assert_eq!(json["timestamp"], 1_710_000_000_u64);

        // Optional fields must be absent (skip_serializing_if = "Option::is_none")
        let obj = json.as_object().unwrap();
        assert!(!obj.contains_key("ports"));
        assert!(!obj.contains_key("updates"));
        assert!(!obj.contains_key("systemd"));
        assert!(!obj.contains_key("security"));
        assert!(!obj.contains_key("docker"));
        assert!(!obj.contains_key("disk_deep"));
    }

    #[test]
    fn tier2_security_sparse_skips_none_fields() {
        let security = Tier2Security {
            ssh_password_auth: None,
            ssh_root_login: None,
            ssh_failed_logins_7d: None,
            firewall_active: Some(true),
            firewall_default_policy: None,
            fail2ban_active: None,
            fail2ban_banned_count: None,
            unattended_upgrades_active: None,
        };

        let json: serde_json::Value = serde_json::to_value(&security).unwrap();
        let obj = json.as_object().unwrap();

        // Only firewall_active should be present
        assert_eq!(obj.len(), 1);
        assert_eq!(json["firewall_active"], true);
    }

    #[test]
    fn tier2_docker_container_sparse_skips_none_fields() {
        let container = Tier2DockerContainer {
            id: "abc".into(),
            name: "web".into(),
            image: "nginx".into(),
            status: "Exited (0) 2 hours ago".into(),
            state: "exited".into(),
            cpu_pct: None,
            mem_bytes: None,
            restart_count: 3,
            started_at: None,
        };

        let json: serde_json::Value = serde_json::to_value(&container).unwrap();
        let obj = json.as_object().unwrap();

        // Required fields present
        assert_eq!(json["id"], "abc");
        assert_eq!(json["restart_count"], 3);
        // Optional fields absent
        assert!(!obj.contains_key("cpu_pct"));
        assert!(!obj.contains_key("mem_bytes"));
        assert!(!obj.contains_key("started_at"));
    }

    #[test]
    fn tier2_listening_port_sparse_skips_none_fields() {
        let port = Tier2ListeningPort {
            port: 80,
            bind: "::".into(),
            protocol: "tcp6".into(),
            pid: None,
            process: None,
        };

        let json: serde_json::Value = serde_json::to_value(&port).unwrap();
        let obj = json.as_object().unwrap();

        assert_eq!(json["port"], 80);
        assert_eq!(json["bind"], "::");
        assert!(!obj.contains_key("pid"));
        assert!(!obj.contains_key("process"));
    }

    #[test]
    fn metrics_payload_multiple_disks_and_nets() {
        let payload = MetricsPayload {
            probe_version: "0.2.1".into(),
            host_id: "multi".into(),
            timestamp: 1_710_000_000,
            interval: 30,
            cpu: CpuMetrics {
                load1: 0.0,
                load5: 0.0,
                load15: 0.0,
                usage_pct: 0.0,
                iowait_pct: 0.0,
                steal_pct: 0.0,
                count: 1,
                context_switches_sec: None,
                forks_sec: None,
                procs_running: None,
                procs_blocked: None,
            },
            mem: MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
                oom_kills_delta: None,
            },
            swap: SwapMetrics {
                total_bytes: 0,
                used_bytes: 0,
                used_pct: 0.0,
            },
            disk: vec![
                DiskMetric {
                    mount: "/".into(),
                    total_bytes: 100_000_000_000,
                    avail_bytes: 50_000_000_000,
                    used_pct: 50.0,
                },
                DiskMetric {
                    mount: "/data".into(),
                    total_bytes: 500_000_000_000,
                    avail_bytes: 200_000_000_000,
                    used_pct: 60.0,
                },
                DiskMetric {
                    mount: "/boot".into(),
                    total_bytes: 1_000_000_000,
                    avail_bytes: 500_000_000,
                    used_pct: 50.0,
                },
            ],
            net: vec![
                NetMetric {
                    iface: "eth0".into(),
                    rx_bytes_rate: 1024.0,
                    tx_bytes_rate: 512.0,
                    rx_errors: 0,
                    tx_errors: 0,
                },
                NetMetric {
                    iface: "wlan0".into(),
                    rx_bytes_rate: 256.5,
                    tx_bytes_rate: 128.25,
                    rx_errors: 3,
                    tx_errors: 1,
                },
            ],
            uptime_seconds: 86400,
            psi: None,
            disk_io: None,
            tcp: None,
            fd: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();

        assert_eq!(json["disk"].as_array().unwrap().len(), 3);
        assert_eq!(json["disk"][0]["mount"], "/");
        assert_eq!(json["disk"][1]["mount"], "/data");
        assert_eq!(json["disk"][2]["mount"], "/boot");

        assert_eq!(json["net"].as_array().unwrap().len(), 2);
        assert_eq!(json["net"][0]["iface"], "eth0");
        assert_eq!(json["net"][1]["iface"], "wlan0");
        assert_eq!(json["net"][1]["rx_errors"], 3);
    }

    #[test]
    fn metrics_payload_extreme_values() {
        let payload = MetricsPayload {
            probe_version: "0.2.1".into(),
            host_id: "extreme".into(),
            timestamp: u64::MAX,
            interval: u32::MAX,
            cpu: CpuMetrics {
                load1: f64::MAX,
                load5: 0.0,
                load15: 0.0,
                usage_pct: 100.0,
                iowait_pct: 100.0,
                steal_pct: 100.0,
                count: u32::MAX,
                context_switches_sec: None,
                forks_sec: None,
                procs_running: None,
                procs_blocked: None,
            },
            mem: MemMetrics {
                total_bytes: u64::MAX,
                available_bytes: 0,
                used_pct: 100.0,
                oom_kills_delta: None,
            },
            swap: SwapMetrics {
                total_bytes: u64::MAX,
                used_bytes: u64::MAX,
                used_pct: 100.0,
            },
            disk: vec![],
            net: vec![],
            uptime_seconds: u64::MAX,
            psi: None,
            disk_io: None,
            tcp: None,
            fd: None,
        };

        // Should serialize without panic
        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["timestamp"], u64::MAX);
        assert_eq!(json["cpu"]["count"], u32::MAX);
        assert_eq!(json["mem"]["total_bytes"], u64::MAX);
        assert_eq!(json["uptime_seconds"], u64::MAX);
    }

    #[test]
    fn identity_payload_unicode_fields() {
        let payload = IdentityPayload {
            probe_version: "0.2.1".into(),
            host_id: "host-日本語".into(),
            hostname: "服务器-01".into(),
            os: "Ubuntu 22.04 中文版".into(),
            kernel: "5.15.0".into(),
            arch: "aarch64".into(),
            cpu_model: "Apple M1 — Pro™".into(),
            uptime_seconds: 0,
            boot_time: 0,
            cpu_logical: None,
            cpu_physical: None,
            mem_total_bytes: None,
            swap_total_bytes: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["host_id"], "host-日本語");
        assert_eq!(json["hostname"], "服务器-01");
        assert_eq!(json["os"], "Ubuntu 22.04 中文版");
        assert_eq!(json["cpu_model"], "Apple M1 — Pro™");
    }

    #[test]
    fn tier2_updates_no_cache_age() {
        let updates = Tier2Updates {
            total_count: 0,
            security_count: 0,
            list: vec![],
            reboot_required: true,
            cache_age_seconds: None,
        };

        let json: serde_json::Value = serde_json::to_value(&updates).unwrap();
        let obj = json.as_object().unwrap();
        assert_eq!(json["total_count"], 0);
        assert!(json["reboot_required"].as_bool().unwrap());
        assert!(!obj.contains_key("cache_age_seconds"));
        assert!(json["list"].as_array().unwrap().is_empty());
    }

    #[test]
    fn metrics_payload_psi_none_omitted() {
        let payload = MetricsPayload {
            probe_version: "0.3.0".into(),
            host_id: "h".into(),
            timestamp: 0,
            interval: 30,
            cpu: CpuMetrics {
                load1: 0.0,
                load5: 0.0,
                load15: 0.0,
                usage_pct: 0.0,
                iowait_pct: 0.0,
                steal_pct: 0.0,
                count: 1,
                context_switches_sec: None,
                forks_sec: None,
                procs_running: None,
                procs_blocked: None,
            },
            mem: MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
                oom_kills_delta: None,
            },
            swap: SwapMetrics {
                total_bytes: 0,
                used_bytes: 0,
                used_pct: 0.0,
            },
            disk: vec![],
            net: vec![],
            uptime_seconds: 0,
            psi: None,
            disk_io: None,
            tcp: None,
            fd: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        let obj = json.as_object().unwrap();
        assert!(!obj.contains_key("psi"), "psi should be omitted when None");
    }

    #[test]
    fn metrics_payload_psi_some_serialized() {
        let payload = MetricsPayload {
            probe_version: "0.3.0".into(),
            host_id: "h".into(),
            timestamp: 0,
            interval: 30,
            cpu: CpuMetrics {
                load1: 0.0,
                load5: 0.0,
                load15: 0.0,
                usage_pct: 0.0,
                iowait_pct: 0.0,
                steal_pct: 0.0,
                count: 1,
                context_switches_sec: None,
                forks_sec: None,
                procs_running: None,
                procs_blocked: None,
            },
            mem: MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
                oom_kills_delta: None,
            },
            swap: SwapMetrics {
                total_bytes: 0,
                used_bytes: 0,
                used_pct: 0.0,
            },
            disk: vec![],
            net: vec![],
            uptime_seconds: 0,
            psi: Some(PsiMetrics {
                cpu_some_avg10: 2.40,
                cpu_some_avg60: 2.13,
                cpu_some_avg300: 1.40,
                mem_some_avg10: 0.0,
                mem_some_avg60: 0.0,
                mem_some_avg300: 0.0,
                mem_full_avg10: 0.0,
                mem_full_avg60: 0.0,
                mem_full_avg300: 0.0,
                io_some_avg10: 0.50,
                io_some_avg60: 0.01,
                io_some_avg300: 0.0,
                io_full_avg10: 0.30,
                io_full_avg60: 0.0,
                io_full_avg300: 0.0,
            }),
            disk_io: None,
            tcp: None,
            fd: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        assert!(json.get("psi").is_some(), "psi should be present when Some");
        assert_eq!(json["psi"]["cpu_some_avg10"], 2.40);
        assert_eq!(json["psi"]["cpu_some_avg60"], 2.13);
        assert_eq!(json["psi"]["io_some_avg10"], 0.50);
        assert_eq!(json["psi"]["io_full_avg10"], 0.30);
    }

    #[test]
    fn metrics_payload_oom_kills_none_omitted() {
        let payload = MetricsPayload {
            probe_version: "0.3.0".into(),
            host_id: "h".into(),
            timestamp: 0,
            interval: 30,
            cpu: CpuMetrics {
                load1: 0.0,
                load5: 0.0,
                load15: 0.0,
                usage_pct: 0.0,
                iowait_pct: 0.0,
                steal_pct: 0.0,
                count: 1,
                context_switches_sec: None,
                forks_sec: None,
                procs_running: None,
                procs_blocked: None,
            },
            mem: MemMetrics {
                total_bytes: 1000,
                available_bytes: 500,
                used_pct: 50.0,
                oom_kills_delta: None,
            },
            swap: SwapMetrics {
                total_bytes: 0,
                used_bytes: 0,
                used_pct: 0.0,
            },
            disk: vec![],
            net: vec![],
            uptime_seconds: 0,
            psi: None,
            disk_io: None,
            tcp: None,
            fd: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        let mem = json["mem"].as_object().unwrap();
        assert!(
            !mem.contains_key("oom_kills_delta"),
            "oom_kills_delta should be omitted when None"
        );
    }

    #[test]
    fn metrics_payload_oom_kills_some_serialized() {
        let payload = MetricsPayload {
            probe_version: "0.3.0".into(),
            host_id: "h".into(),
            timestamp: 0,
            interval: 30,
            cpu: CpuMetrics {
                load1: 0.0,
                load5: 0.0,
                load15: 0.0,
                usage_pct: 0.0,
                iowait_pct: 0.0,
                steal_pct: 0.0,
                count: 1,
                context_switches_sec: None,
                forks_sec: None,
                procs_running: None,
                procs_blocked: None,
            },
            mem: MemMetrics {
                total_bytes: 1000,
                available_bytes: 500,
                used_pct: 50.0,
                oom_kills_delta: Some(2),
            },
            swap: SwapMetrics {
                total_bytes: 0,
                used_bytes: 0,
                used_pct: 0.0,
            },
            disk: vec![],
            net: vec![],
            uptime_seconds: 0,
            psi: None,
            disk_io: None,
            tcp: None,
            fd: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["mem"]["oom_kills_delta"], 2);
    }
}
