mod collectors;
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

    // Network (delta from previous counters)
    let curr_net = collectors::network::read_all_counters(&cfg.network.exclude_interfaces).ok();
    let net =
        orchestrate::compute_net_delta(prev_net_counters.as_ref(), curr_net.as_ref(), cfg.interval);
    *prev_net_counters = curr_net;

    // Uptime
    let uptime_seconds = collectors::identity::read_uptime().unwrap_or(0);

    let payload = orchestrate::build_metrics_payload(
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
    let boot_time = orchestrate::compute_boot_time(now_secs, uptime_seconds);

    let payload = orchestrate::build_identity_payload(
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
