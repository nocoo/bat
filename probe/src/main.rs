mod collectors;
mod config;
mod payload;
mod rate;
mod sender;

use std::collections::HashMap;
use std::time::Duration;

use collectors::cpu::CpuJiffies;
use collectors::network::NetCounters;
use payload::{
    CpuMetrics, DiskMetric, IdentityPayload, MemMetrics, MetricsPayload, NetMetric, SwapMetrics,
};
use sender::Sender;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("bat_probe=info".parse().unwrap()),
        )
        .init();

    let config_path = config::config_path_from_args(&std::env::args().collect::<Vec<_>>());
    let cfg = config::load_config(&config_path).unwrap_or_else(|e| {
        eprintln!("Failed to load config from {}: {e}", config_path.display());
        std::process::exit(1);
    });

    let sender = Sender::new(&cfg.worker_url, &cfg.write_key);

    let host_id = cfg.host_id.clone().unwrap_or_else(|| {
        collectors::identity::read_hostname().unwrap_or_else(|_| "unknown".to_string())
    });

    let cpu_count = collectors::cpu::read_cpu_count().unwrap_or(1);

    tracing::info!(
        host_id,
        cpu_count,
        interval = cfg.interval,
        "starting bat-probe"
    );

    // Send initial identity
    send_identity(&sender, &host_id).await;

    // Seed phase: read initial counters for delta calculation
    let mut prev_jiffies = collectors::cpu::read_jiffies().ok();
    let mut prev_net_counters =
        collectors::network::read_all_counters(&cfg.network.exclude_interfaces).ok();

    let interval = Duration::from_secs(u64::from(cfg.interval));
    let mut ticker = tokio::time::interval(interval);
    ticker.tick().await; // consume the immediate first tick

    let mut identity_timer = tokio::time::Instant::now();
    let identity_interval = Duration::from_secs(6 * 3600); // 6 hours

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                collect_and_send(
                    &sender,
                    &host_id,
                    &cfg,
                    cpu_count,
                    &mut prev_jiffies,
                    &mut prev_net_counters,
                )
                .await;

                if identity_timer.elapsed() >= identity_interval {
                    send_identity(&sender, &host_id).await;
                    identity_timer = tokio::time::Instant::now();
                }
            }
            () = shutdown_signal() => {
                tracing::info!("received shutdown signal, exiting");
                break;
            }
        }
    }
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let ctrl_c = tokio::signal::ctrl_c();
        let mut sigterm =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).unwrap();
        tokio::select! {
            _ = ctrl_c => {}
            _ = sigterm.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        tokio::signal::ctrl_c().await.ok();
    }
}

async fn collect_and_send(
    sender: &Sender,
    host_id: &str,
    cfg: &config::Config,
    cpu_count: u32,
    prev_jiffies: &mut Option<CpuJiffies>,
    prev_net_counters: &mut Option<HashMap<String, NetCounters>>,
) {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // CPU usage (delta from previous jiffies)
    let curr_jiffies = collectors::cpu::read_jiffies().ok();
    let cpu_usage = compute_cpu_delta(prev_jiffies.as_ref(), curr_jiffies.as_ref());
    *prev_jiffies = curr_jiffies;

    // Load averages
    let loadavg = collectors::cpu::read_loadavg().unwrap_or((0.0, 0.0, 0.0));

    // Memory
    let mem_info = collectors::memory::read_meminfo().ok();
    let (mem, swap) = build_mem_swap_metrics(mem_info.as_ref());

    // Disk
    let disk = convert_disk_infos(
        collectors::disk::read_disk_metrics(&cfg.disk.exclude_mounts, &cfg.disk.exclude_fs_types)
            .unwrap_or_default(),
    );

    // Network (delta from previous counters)
    let curr_net = collectors::network::read_all_counters(&cfg.network.exclude_interfaces).ok();
    let net = compute_net_delta(prev_net_counters.as_ref(), curr_net.as_ref(), cfg.interval);
    *prev_net_counters = curr_net;

    // Uptime
    let uptime_seconds = collectors::identity::read_uptime().unwrap_or(0);

    let payload = build_metrics_payload(
        host_id,
        timestamp,
        cfg.interval,
        cpu_count,
        cpu_usage,
        loadavg,
        mem,
        swap,
        disk,
        net,
        uptime_seconds,
    );

    if let Err(e) = sender.post("/api/ingest", &payload).await {
        tracing::error!(error = %e, "failed to send metrics");
    }
}

async fn send_identity(sender: &Sender, host_id: &str) {
    let hostname = collectors::identity::read_hostname().unwrap_or_else(|_| "unknown".into());
    let os = collectors::identity::read_os_release().unwrap_or_else(|_| "unknown".into());
    let kernel = collectors::identity::read_kernel_version().unwrap_or_else(|_| "unknown".into());
    let arch = collectors::identity::get_arch();
    let cpu_model = collectors::cpu::read_cpu_model().unwrap_or_else(|_| "unknown".into());
    let uptime_seconds = collectors::identity::read_uptime().unwrap_or(0);

    // boot_time = now - uptime
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let boot_time = compute_boot_time(now_secs, uptime_seconds);

    let payload = build_identity_payload(
        host_id,
        &hostname,
        &os,
        &kernel,
        &arch,
        &cpu_model,
        uptime_seconds,
        boot_time,
    );

    if let Err(e) = sender.post("/api/identity", &payload).await {
        tracing::error!(error = %e, "failed to send identity");
    }
}

/// Compute CPU usage delta from optional previous and current jiffies.
fn compute_cpu_delta(prev: Option<&CpuJiffies>, curr: Option<&CpuJiffies>) -> (f64, f64, f64) {
    match (prev, curr) {
        (Some(p), Some(c)) => collectors::cpu::compute_cpu_usage(p, c),
        _ => (0.0, 0.0, 0.0),
    }
}

/// Compute network metrics delta from optional previous and current counters.
fn compute_net_delta(
    prev: Option<&HashMap<String, NetCounters>>,
    curr: Option<&HashMap<String, NetCounters>>,
    interval: u32,
) -> Vec<NetMetric> {
    match (prev, curr) {
        (Some(p), Some(c)) => convert_net_infos(collectors::network::compute_net_metrics(
            p,
            c,
            u64::from(interval),
        )),
        _ => vec![],
    }
}

/// Build a [`MetricsPayload`] from collected system values.
#[allow(clippy::too_many_arguments)]
fn build_metrics_payload(
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
fn convert_disk_infos(infos: Vec<collectors::disk::DiskInfo>) -> Vec<DiskMetric> {
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
fn convert_net_infos(infos: Vec<collectors::network::NetInfo>) -> Vec<NetMetric> {
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
const fn compute_boot_time(now_secs: u64, uptime_secs: u64) -> u64 {
    now_secs.saturating_sub(uptime_secs)
}

/// Build memory and swap metrics from an optional [`MemInfo`], defaulting to zero.
fn build_mem_swap_metrics(
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
fn build_identity_payload(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_identity_payload_normal() {
        let p = build_identity_payload(
            "host-1",
            "myserver",
            "Ubuntu 22.04",
            "5.15.0",
            "x86_64",
            "Intel Xeon",
            86400,
            1_700_000_000,
        );
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
        let p = build_identity_payload("", "", "", "", "", "", 0, 0);
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
        let metrics = compute_net_delta(Some(&prev), Some(&curr), 30);
        assert_eq!(metrics.len(), 1);
        assert_eq!(metrics[0].iface, "eth0");
    }

    #[test]
    fn compute_net_delta_missing_prev() {
        use collectors::network::NetCounters;
        let mut curr = HashMap::new();
        curr.insert("eth0".to_string(), NetCounters::default());
        let metrics = compute_net_delta(None, Some(&curr), 30);
        assert!(metrics.is_empty());
    }

    #[test]
    fn compute_net_delta_both_none() {
        let metrics = compute_net_delta(None, None, 30);
        assert!(metrics.is_empty());
    }
}
