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

    let interval = Duration::from_secs(cfg.interval as u64);
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
            _ = shutdown_signal() => {
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
    let (usage_pct, iowait_pct, steal_pct) = match (&*prev_jiffies, &curr_jiffies) {
        (Some(prev), Some(curr)) => collectors::cpu::compute_cpu_usage(prev, curr),
        _ => (0.0, 0.0, 0.0),
    };
    *prev_jiffies = curr_jiffies;

    // Load averages
    let (load1, load5, load15) = collectors::cpu::read_loadavg().unwrap_or((0.0, 0.0, 0.0));

    // Memory
    let mem_info = collectors::memory::read_meminfo().ok();
    let (mem, swap) = match &mem_info {
        Some(info) => (
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
        ),
        None => (
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
    };

    // Disk
    let disk: Vec<DiskMetric> =
        collectors::disk::read_disk_metrics(&cfg.disk.exclude_mounts, &cfg.disk.exclude_fs_types)
            .unwrap_or_default()
            .into_iter()
            .map(|d| DiskMetric {
                mount: d.mount,
                total_bytes: d.total_bytes,
                avail_bytes: d.avail_bytes,
                used_pct: d.used_pct,
            })
            .collect();

    // Network (delta from previous counters)
    let curr_net = collectors::network::read_all_counters(&cfg.network.exclude_interfaces).ok();
    let net: Vec<NetMetric> = match (&*prev_net_counters, &curr_net) {
        (Some(prev), Some(curr)) => {
            collectors::network::compute_net_metrics(prev, curr, cfg.interval as u64)
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
        _ => vec![],
    };
    *prev_net_counters = curr_net;

    // Uptime
    let uptime_seconds = collectors::identity::read_uptime().unwrap_or(0);

    let payload = MetricsPayload {
        host_id: host_id.to_string(),
        timestamp,
        interval: cfg.interval,
        cpu: CpuMetrics {
            load1,
            load5,
            load15,
            usage_pct,
            iowait_pct,
            steal_pct,
            count: cpu_count,
        },
        mem,
        swap,
        disk,
        net,
        uptime_seconds,
    };

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
    let boot_time = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .saturating_sub(uptime_seconds);

    let payload = IdentityPayload {
        host_id: host_id.to_string(),
        hostname,
        os,
        kernel,
        arch,
        cpu_model,
        uptime_seconds,
        boot_time,
    };

    if let Err(e) = sender.post("/api/identity", &payload).await {
        tracing::error!(error = %e, "failed to send identity");
    }
}
