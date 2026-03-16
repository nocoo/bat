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
    let (usage_pct, iowait_pct, steal_pct) = match (&*prev_jiffies, &curr_jiffies) {
        (Some(prev), Some(curr)) => collectors::cpu::compute_cpu_usage(prev, curr),
        _ => (0.0, 0.0, 0.0),
    };
    *prev_jiffies = curr_jiffies;

    // Load averages
    let (load1, load5, load15) = collectors::cpu::read_loadavg().unwrap_or((0.0, 0.0, 0.0));

    // Memory
    let mem_info = collectors::memory::read_meminfo().ok();
    let (mem, swap) = mem_info.as_ref().map_or(
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
    );

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
            collectors::network::compute_net_metrics(prev, curr, u64::from(cfg.interval))
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
}
