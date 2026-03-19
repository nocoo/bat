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
    /// Socket usage from `/proc/net/sockstat`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub socket: Option<SocketMetrics>,
    /// UDP stats from `/proc/net/sockstat`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub udp: Option<UdpMetrics>,
    /// SNMP protocol counters (deltas/rates) from `/proc/net/snmp`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub snmp: Option<SnmpMetrics>,
    /// Extended TCP stats (deltas) from `/proc/net/netstat`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub netstat: Option<NetstatMetrics>,
    /// Softnet counters (deltas) from `/proc/net/softnet_stat`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub softnet: Option<SoftnetMetrics>,
    /// Connection tracking from `/proc/sys/net/netfilter/`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conntrack: Option<ConntrackMetrics>,
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
    /// Interrupts per second (delta from `/proc/stat` intr total)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interrupts_sec: Option<f64>,
    /// `NET_RX` softirq per second
    #[serde(skip_serializing_if = "Option::is_none")]
    pub softirq_net_rx_sec: Option<f64>,
    /// BLOCK softirq per second
    #[serde(skip_serializing_if = "Option::is_none")]
    pub softirq_block_sec: Option<f64>,
    /// Number of runnable tasks from `/proc/loadavg`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tasks_running: Option<u32>,
    /// Total number of tasks from `/proc/loadavg`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tasks_total: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct MemMetrics {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_pct: f64,
    /// Tier 3: OOM kills since last sample (delta from `/proc/vmstat` `oom_kill`)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oom_kills_delta: Option<u64>,
    // --- Extended meminfo fields ---
    #[serde(skip_serializing_if = "Option::is_none")]
    pub buffers: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cached: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dirty: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub writeback: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shmem: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slab_reclaimable: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slab_unreclaim: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub committed_as: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit_limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hw_corrupted: Option<u64>,
    // --- Vmstat rate fields ---
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swap_in_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swap_out_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pgmajfault_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pgpgin_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pgpgout_sec: Option<f64>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inodes_total: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inodes_avail: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inodes_used_pct: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct NetMetric {
    pub iface: String,
    pub rx_bytes_rate: f64,
    pub tx_bytes_rate: f64,
    pub rx_errors: u64,
    pub tx_errors: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rx_packets_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_packets_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rx_dropped: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tx_dropped: Option<u64>,
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
    // --- Total microsecond deltas ---
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cpu_some_total_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mem_some_total_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mem_full_total_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub io_some_total_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub io_full_total_delta: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct DiskIoMetric {
    pub device: String,
    pub read_iops: f64,
    pub write_iops: f64,
    pub read_bytes_sec: f64,
    pub write_bytes_sec: f64,
    pub io_util_pct: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub read_await_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub write_await_ms: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub io_queue_depth: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct TcpMetrics {
    pub established: u32,
    pub time_wait: u32,
    pub orphan: u32,
    pub allocated: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mem_pages: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct FdMetrics {
    pub allocated: u64,
    pub max: u64,
}

#[derive(Debug, Serialize)]
pub struct SocketMetrics {
    pub sockets_used: u32,
}

#[derive(Debug, Serialize)]
pub struct UdpMetrics {
    pub inuse: u32,
    pub mem_pages: u32,
}

#[derive(Debug, Serialize)]
pub struct SnmpMetrics {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retrans_segs_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_opens_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passive_opens_sec: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempt_fails_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estab_resets_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub in_errs_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub out_rsts_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub udp_rcvbuf_errors_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub udp_sndbuf_errors_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub udp_in_errors_delta: Option<u64>,
}

#[derive(Debug, Serialize)]
#[allow(clippy::struct_field_names)]
pub struct NetstatMetrics {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listen_overflows_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listen_drops_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tcp_timeouts_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tcp_syn_retrans_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tcp_fast_retrans_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tcp_ofo_queue_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tcp_abort_on_memory_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub syncookies_sent_delta: Option<u64>,
}

#[derive(Debug, Serialize)]
#[allow(clippy::struct_field_names)]
pub struct SoftnetMetrics {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub processed_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dropped_delta: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_squeeze_delta: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct ConntrackMetrics {
    pub count: u64,
    pub max: u64,
}

use crate::collectors::inventory::{BlockDevice, NetInterface};

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub virtualization: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub net_interfaces: Option<Vec<NetInterface>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disks: Option<Vec<BlockDevice>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boot_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_ip: Option<String>,
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
    pub systemd: Option<Tier2Systemd>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub security: Option<Tier2Security>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub docker: Option<Tier2Docker>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disk_deep: Option<Tier2DiskDeep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub software: Option<Tier2Software>,
    // --- Host inventory tier 2 fields ---
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dns_resolvers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dns_search: Option<Vec<String>>,
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

#[derive(Debug, Serialize)]
pub struct Tier2DetectedSoftware {
    pub id: String,
    pub name: String,
    pub category: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub source: String,
    pub running: bool,
    pub listening_ports: Vec<u16>,
}

#[derive(Debug, Serialize)]
pub struct Tier2Software {
    pub detected: Vec<Tier2DetectedSoftware>,
    pub scan_duration_ms: u64,
    pub version_duration_ms: u64,
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
                interrupts_sec: None,
                softirq_net_rx_sec: None,
                softirq_block_sec: None,
                tasks_running: None,
                tasks_total: None,
            },
            mem: MemMetrics {
                total_bytes: 4_000_000_000,
                available_bytes: 2_000_000_000,
                used_pct: 50.0,
                oom_kills_delta: None,
                buffers: None,
                cached: None,
                dirty: None,
                writeback: None,
                shmem: None,
                slab_reclaimable: None,
                slab_unreclaim: None,
                committed_as: None,
                commit_limit: None,
                hw_corrupted: None,
                swap_in_sec: None,
                swap_out_sec: None,
                pgmajfault_sec: None,
                pgpgin_sec: None,
                pgpgout_sec: None,
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
                inodes_total: None,
                inodes_avail: None,
                inodes_used_pct: None,
            }],
            net: vec![NetMetric {
                iface: "eth0".into(),
                rx_bytes_rate: 1024.5,
                tx_bytes_rate: 512.3,
                rx_errors: 0,
                tx_errors: 0,
                rx_packets_rate: None,
                tx_packets_rate: None,
                rx_dropped: None,
                tx_dropped: None,
            }],
            uptime_seconds: 86400,
            psi: None,
            disk_io: None,
            tcp: None,
            fd: None,
            socket: None,
            udp: None,
            snmp: None,
            netstat: None,
            softnet: None,
            conntrack: None,
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
            virtualization: Some("kvm".into()),
            net_interfaces: Some(vec![]),
            disks: Some(vec![]),
            boot_mode: Some("uefi".into()),
            public_ip: Some("203.0.113.1".into()),
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
        assert_eq!(json["virtualization"], "kvm");
        assert!(json["net_interfaces"].as_array().unwrap().is_empty());
        assert!(json["disks"].as_array().unwrap().is_empty());
        assert_eq!(json["boot_mode"], "uefi");
        assert_eq!(json["public_ip"], "203.0.113.1");
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
            virtualization: None,
            net_interfaces: None,
            disks: None,
            boot_mode: None,
            public_ip: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        let obj = json.as_object().unwrap();
        assert!(!obj.contains_key("cpu_logical"));
        assert!(!obj.contains_key("cpu_physical"));
        assert!(!obj.contains_key("mem_total_bytes"));
        assert!(!obj.contains_key("swap_total_bytes"));
        assert!(!obj.contains_key("virtualization"));
        assert!(!obj.contains_key("net_interfaces"));
        assert!(!obj.contains_key("disks"));
        assert!(!obj.contains_key("boot_mode"));
        assert!(!obj.contains_key("public_ip"));
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
                interrupts_sec: None,
                softirq_net_rx_sec: None,
                softirq_block_sec: None,
                tasks_running: None,
                tasks_total: None,
            },
            mem: MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
                oom_kills_delta: None,
                buffers: None,
                cached: None,
                dirty: None,
                writeback: None,
                shmem: None,
                slab_reclaimable: None,
                slab_unreclaim: None,
                committed_as: None,
                commit_limit: None,
                hw_corrupted: None,
                swap_in_sec: None,
                swap_out_sec: None,
                pgmajfault_sec: None,
                pgpgin_sec: None,
                pgpgout_sec: None,
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
            socket: None,
            udp: None,
            snmp: None,
            netstat: None,
            softnet: None,
            conntrack: None,
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
            software: None,
            timezone: Some("UTC".into()),
            dns_resolvers: Some(vec!["1.1.1.1".into(), "8.8.8.8".into()]),
            dns_search: Some(vec!["example.com".into()]),
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

        // Tier 2 inventory
        assert_eq!(json["timezone"], "UTC");
        assert_eq!(json["dns_resolvers"][0], "1.1.1.1");
        assert_eq!(json["dns_resolvers"][1], "8.8.8.8");
        assert_eq!(json["dns_search"][0], "example.com");
    }

    #[test]
    fn tier2_payload_sparse_skips_none_fields() {
        let payload = Tier2Payload {
            probe_version: "0.2.1".into(),
            host_id: "host-1".into(),
            timestamp: 1_710_000_000,
            ports: None,
            systemd: None,
            security: None,
            docker: None,
            disk_deep: None,
            software: None,
            timezone: None,
            dns_resolvers: None,
            dns_search: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();

        // Required fields present
        assert_eq!(json["probe_version"], "0.2.1");
        assert_eq!(json["host_id"], "host-1");
        assert_eq!(json["timestamp"], 1_710_000_000_u64);

        // Optional fields must be absent (skip_serializing_if = "Option::is_none")
        let obj = json.as_object().unwrap();
        assert!(!obj.contains_key("ports"));
        assert!(!obj.contains_key("systemd"));
        assert!(!obj.contains_key("security"));
        assert!(!obj.contains_key("docker"));
        assert!(!obj.contains_key("disk_deep"));
        assert!(!obj.contains_key("timezone"));
        assert!(!obj.contains_key("dns_resolvers"));
        assert!(!obj.contains_key("dns_search"));
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
                interrupts_sec: None,
                softirq_net_rx_sec: None,
                softirq_block_sec: None,
                tasks_running: None,
                tasks_total: None,
            },
            mem: MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
                oom_kills_delta: None,
                buffers: None,
                cached: None,
                dirty: None,
                writeback: None,
                shmem: None,
                slab_reclaimable: None,
                slab_unreclaim: None,
                committed_as: None,
                commit_limit: None,
                hw_corrupted: None,
                swap_in_sec: None,
                swap_out_sec: None,
                pgmajfault_sec: None,
                pgpgin_sec: None,
                pgpgout_sec: None,
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
                    inodes_total: None,
                    inodes_avail: None,
                    inodes_used_pct: None,
                },
                DiskMetric {
                    mount: "/data".into(),
                    total_bytes: 500_000_000_000,
                    avail_bytes: 200_000_000_000,
                    used_pct: 60.0,
                    inodes_total: None,
                    inodes_avail: None,
                    inodes_used_pct: None,
                },
                DiskMetric {
                    mount: "/boot".into(),
                    total_bytes: 1_000_000_000,
                    avail_bytes: 500_000_000,
                    used_pct: 50.0,
                    inodes_total: None,
                    inodes_avail: None,
                    inodes_used_pct: None,
                },
            ],
            net: vec![
                NetMetric {
                    iface: "eth0".into(),
                    rx_bytes_rate: 1024.0,
                    tx_bytes_rate: 512.0,
                    rx_errors: 0,
                    tx_errors: 0,
                    rx_packets_rate: None,
                    tx_packets_rate: None,
                    rx_dropped: None,
                    tx_dropped: None,
                },
                NetMetric {
                    iface: "wlan0".into(),
                    rx_bytes_rate: 256.5,
                    tx_bytes_rate: 128.25,
                    rx_errors: 3,
                    tx_errors: 1,
                    rx_packets_rate: None,
                    tx_packets_rate: None,
                    rx_dropped: None,
                    tx_dropped: None,
                },
            ],
            uptime_seconds: 86400,
            psi: None,
            disk_io: None,
            tcp: None,
            fd: None,
            socket: None,
            udp: None,
            snmp: None,
            netstat: None,
            softnet: None,
            conntrack: None,
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
                interrupts_sec: None,
                softirq_net_rx_sec: None,
                softirq_block_sec: None,
                tasks_running: None,
                tasks_total: None,
            },
            mem: MemMetrics {
                total_bytes: u64::MAX,
                available_bytes: 0,
                used_pct: 100.0,
                oom_kills_delta: None,
                buffers: None,
                cached: None,
                dirty: None,
                writeback: None,
                shmem: None,
                slab_reclaimable: None,
                slab_unreclaim: None,
                committed_as: None,
                commit_limit: None,
                hw_corrupted: None,
                swap_in_sec: None,
                swap_out_sec: None,
                pgmajfault_sec: None,
                pgpgin_sec: None,
                pgpgout_sec: None,
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
            socket: None,
            udp: None,
            snmp: None,
            netstat: None,
            softnet: None,
            conntrack: None,
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
            virtualization: None,
            net_interfaces: None,
            disks: None,
            boot_mode: None,
            public_ip: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["host_id"], "host-日本語");
        assert_eq!(json["hostname"], "服务器-01");
        assert_eq!(json["os"], "Ubuntu 22.04 中文版");
        assert_eq!(json["cpu_model"], "Apple M1 — Pro™");
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
                interrupts_sec: None,
                softirq_net_rx_sec: None,
                softirq_block_sec: None,
                tasks_running: None,
                tasks_total: None,
            },
            mem: MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
                oom_kills_delta: None,
                buffers: None,
                cached: None,
                dirty: None,
                writeback: None,
                shmem: None,
                slab_reclaimable: None,
                slab_unreclaim: None,
                committed_as: None,
                commit_limit: None,
                hw_corrupted: None,
                swap_in_sec: None,
                swap_out_sec: None,
                pgmajfault_sec: None,
                pgpgin_sec: None,
                pgpgout_sec: None,
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
            socket: None,
            udp: None,
            snmp: None,
            netstat: None,
            softnet: None,
            conntrack: None,
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
                interrupts_sec: None,
                softirq_net_rx_sec: None,
                softirq_block_sec: None,
                tasks_running: None,
                tasks_total: None,
            },
            mem: MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
                oom_kills_delta: None,
                buffers: None,
                cached: None,
                dirty: None,
                writeback: None,
                shmem: None,
                slab_reclaimable: None,
                slab_unreclaim: None,
                committed_as: None,
                commit_limit: None,
                hw_corrupted: None,
                swap_in_sec: None,
                swap_out_sec: None,
                pgmajfault_sec: None,
                pgpgin_sec: None,
                pgpgout_sec: None,
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
                cpu_some_total_delta: None,
                mem_some_total_delta: None,
                mem_full_total_delta: None,
                io_some_total_delta: None,
                io_full_total_delta: None,
            }),
            disk_io: None,
            tcp: None,
            fd: None,
            socket: None,
            udp: None,
            snmp: None,
            netstat: None,
            softnet: None,
            conntrack: None,
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
                interrupts_sec: None,
                softirq_net_rx_sec: None,
                softirq_block_sec: None,
                tasks_running: None,
                tasks_total: None,
            },
            mem: MemMetrics {
                total_bytes: 1000,
                available_bytes: 500,
                used_pct: 50.0,
                oom_kills_delta: None,
                buffers: None,
                cached: None,
                dirty: None,
                writeback: None,
                shmem: None,
                slab_reclaimable: None,
                slab_unreclaim: None,
                committed_as: None,
                commit_limit: None,
                hw_corrupted: None,
                swap_in_sec: None,
                swap_out_sec: None,
                pgmajfault_sec: None,
                pgpgin_sec: None,
                pgpgout_sec: None,
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
            socket: None,
            udp: None,
            snmp: None,
            netstat: None,
            softnet: None,
            conntrack: None,
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
                interrupts_sec: None,
                softirq_net_rx_sec: None,
                softirq_block_sec: None,
                tasks_running: None,
                tasks_total: None,
            },
            mem: MemMetrics {
                total_bytes: 1000,
                available_bytes: 500,
                used_pct: 50.0,
                oom_kills_delta: Some(2),
                buffers: None,
                cached: None,
                dirty: None,
                writeback: None,
                shmem: None,
                slab_reclaimable: None,
                slab_unreclaim: None,
                committed_as: None,
                commit_limit: None,
                hw_corrupted: None,
                swap_in_sec: None,
                swap_out_sec: None,
                pgmajfault_sec: None,
                pgpgin_sec: None,
                pgpgout_sec: None,
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
            socket: None,
            udp: None,
            snmp: None,
            netstat: None,
            softnet: None,
            conntrack: None,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        assert_eq!(json["mem"]["oom_kills_delta"], 2);
    }
}
