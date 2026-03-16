mod collectors;
#[allow(dead_code)]
mod command;
mod config;
mod orchestrate;
mod payload;
mod rate;
mod sender;

use std::collections::HashMap;
use std::time::Duration;

use collectors::cpu::CpuJiffies;
use collectors::network::NetCounters;
use sender::Sender;
use tokio::time::MissedTickBehavior;

const PROBE_VERSION: &str = env!("CARGO_PKG_VERSION");

#[tokio::main(flavor = "current_thread")]
#[allow(clippy::too_many_lines)]
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

    // Send initial identity (cancellable by shutdown)
    let ctrl_c = tokio::signal::ctrl_c();
    tokio::pin!(ctrl_c);

    #[cfg(unix)]
    let mut sigterm =
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).unwrap();

    let identity_payload = build_identity_payload(&host_id);
    tokio::select! {
        result = sender.post("/api/identity", &identity_payload) => {
            if let Err(e) = result {
                tracing::error!(error = %e, "failed to send identity");
            }
        }
        _ = &mut ctrl_c => {
            tracing::info!("received shutdown signal during identity send, exiting");
            return;
        }
        _ = sigterm.recv(), if cfg!(unix) => {
            tracing::info!("received shutdown signal during identity send, exiting");
            return;
        }
    }

    // Seed phase: read initial counters for delta calculation
    let mut prev_jiffies = collectors::cpu::read_jiffies().ok();
    let mut prev_net_counters =
        collectors::network::read_all_counters(&cfg.network.exclude_interfaces).ok();

    let interval = Duration::from_secs(u64::from(cfg.interval));
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    ticker.tick().await; // consume the immediate first tick

    let mut last_sample_at = tokio::time::Instant::now();
    let mut identity_timer = tokio::time::Instant::now();
    let identity_interval = Duration::from_secs(6 * 3600); // 6 hours

    loop {
        tokio::select! {
            _ = ticker.tick() => {
                // Phase 1: collect metrics (fast, synchronous logic)
                let payload = collect_metrics(
                    &host_id,
                    &cfg,
                    cpu_count,
                    &mut prev_jiffies,
                    &mut prev_net_counters,
                    &mut last_sample_at,
                );

                // Phase 2: send metrics (slow, cancellable by shutdown)
                tokio::select! {
                    result = sender.post("/api/ingest", &payload) => {
                        if let Err(e) = result {
                            tracing::error!(error = %e, "failed to send metrics");
                        }
                    }
                    _ = &mut ctrl_c => {
                        tracing::info!("received shutdown signal during send, exiting");
                        break;
                    }
                    _ = sigterm.recv(), if cfg!(unix) => {
                        tracing::info!("received shutdown signal during send, exiting");
                        break;
                    }
                }

                // Periodic identity re-send
                if identity_timer.elapsed() >= identity_interval {
                    let id_payload = build_identity_payload(&host_id);
                    tokio::select! {
                        result = sender.post("/api/identity", &id_payload) => {
                            if let Err(e) = result {
                                tracing::error!(error = %e, "failed to send identity");
                            }
                        }
                        _ = &mut ctrl_c => {
                            tracing::info!("received shutdown signal during identity send, exiting");
                            break;
                        }
                        _ = sigterm.recv(), if cfg!(unix) => {
                            tracing::info!("received shutdown signal during identity send, exiting");
                            break;
                        }
                    }
                    identity_timer = tokio::time::Instant::now();
                }
            }
            _ = &mut ctrl_c => {
                tracing::info!("received shutdown signal, exiting");
                break;
            }
            _ = sigterm.recv(), if cfg!(unix) => {
                tracing::info!("received shutdown signal, exiting");
                break;
            }
        }
    }
}

fn collect_metrics(
    host_id: &str,
    cfg: &config::Config,
    cpu_count: u32,
    prev_jiffies: &mut Option<CpuJiffies>,
    prev_net_counters: &mut Option<HashMap<String, NetCounters>>,
    last_sample_at: &mut tokio::time::Instant,
) -> payload::MetricsPayload {
    let now = tokio::time::Instant::now();
    let elapsed = now.duration_since(*last_sample_at);

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // CPU usage (delta from previous jiffies)
    let curr_jiffies = collectors::cpu::read_jiffies().ok();
    let cpu_usage = orchestrate::compute_cpu_delta(prev_jiffies.as_ref(), curr_jiffies.as_ref());
    *prev_jiffies = curr_jiffies;

    // Load averages
    let loadavg = collectors::cpu::read_loadavg().unwrap_or((0.0, 0.0, 0.0));

    // Memory
    let mem_info = collectors::memory::read_meminfo().ok();
    let (mem, swap) = orchestrate::build_mem_swap_metrics(mem_info.as_ref());

    // Disk
    let disk = orchestrate::convert_disk_infos(
        collectors::disk::read_disk_metrics(&cfg.disk.exclude_mounts, &cfg.disk.exclude_fs_types)
            .unwrap_or_default(),
    );

    // Network (delta from previous counters, using actual elapsed time)
    let curr_net = collectors::network::read_all_counters(&cfg.network.exclude_interfaces).ok();
    let net =
        orchestrate::compute_net_delta(prev_net_counters.as_ref(), curr_net.as_ref(), elapsed);
    *prev_net_counters = curr_net;
    *last_sample_at = now;

    // Uptime
    let uptime_seconds = collectors::identity::read_uptime().unwrap_or(0);

    orchestrate::build_metrics_payload(
        PROBE_VERSION,
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
    )
}

fn build_identity_payload(host_id: &str) -> payload::IdentityPayload {
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
    let boot_time = orchestrate::compute_boot_time(now_secs, uptime_seconds);

    orchestrate::build_identity_payload(
        PROBE_VERSION,
        host_id,
        &hostname,
        &os,
        &kernel,
        &arch,
        &cpu_model,
        uptime_seconds,
        boot_time,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn delay_behavior_skips_missed_ticks() {
        tokio::time::pause();
        let mut ticker = tokio::time::interval(Duration::from_secs(30));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
        ticker.tick().await; // consume first immediate tick

        // Simulate a 91s handler delay
        tokio::time::advance(Duration::from_secs(91)).await;
        ticker.tick().await; // fires once (caught up)

        // Next tick should wait a full 30s from now, not fire immediately
        let before = tokio::time::Instant::now();
        ticker.tick().await;
        let waited = tokio::time::Instant::now() - before;
        assert!(waited >= Duration::from_secs(29));
    }
}
