#![cfg_attr(coverage_nightly, feature(coverage_attribute))]

mod collectors;
mod command;
mod config;
mod orchestrate;
mod payload;
mod rate;
mod sender;

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use collectors::cpu::CpuJiffies;
use collectors::network::NetCounters;
use sender::Sender;
use tokio::sync::Mutex;
use tokio::time::MissedTickBehavior;

const PROBE_VERSION: &str = env!("CARGO_PKG_VERSION");
const ECHO_URL: &str = "https://echo.nocoo.cloud/api/ip";

#[tokio::main(flavor = "current_thread")]
#[allow(clippy::too_many_lines)]
#[cfg_attr(coverage_nightly, coverage(off))]
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

    let host_id: Arc<str> = cfg
        .host_id
        .clone()
        .unwrap_or_else(|| {
            collectors::identity::read_hostname().unwrap_or_else(|_| "unknown".to_string())
        })
        .into();

    let cpu_count = collectors::cpu::read_cpu_count().unwrap_or(1);

    // Public IP via echo service — shared state updated every 1h
    let public_ip: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    // Fetch initial public IP before first identity send (15s timeout to avoid blocking startup)
    if let Ok(Some(ip)) = tokio::time::timeout(Duration::from_secs(15), fetch_public_ip()).await {
        *public_ip.lock().await = Some(ip);
    }

    tracing::info!(
        %host_id,
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

    let identity_payload = build_identity_payload(&host_id, &public_ip).await;
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
    let mut prev_disk_io = collectors::disk_io::read_diskstats().ok();
    let mut prev_vmstat = collectors::memory::read_vmstat();
    let mut prev_psi = collectors::psi::read_psi();
    let mut prev_snmp = collectors::snmp::read_snmp();
    let mut prev_netstat = collectors::netstat::read_netstat();
    let mut prev_softnet = collectors::softnet::read_softnet_stat();

    let interval = Duration::from_secs(u64::from(cfg.interval));
    let mut ticker = tokio::time::interval(interval);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    ticker.tick().await; // consume the immediate first tick

    let mut last_sample_at = tokio::time::Instant::now();
    let mut identity_timer = tokio::time::Instant::now();
    let identity_interval = Duration::from_secs(6 * 3600);

    // Tier 2 deep collection: initial send on startup + every 30 minutes
    // Independent of identity timer.
    let mut tier2_timer = tokio::time::Instant::now();
    let tier2_interval = Duration::from_secs(30 * 60);

    // Public IP echo fetch: every 1 hour
    let mut echo_timer = tokio::time::Instant::now();
    let echo_interval = Duration::from_secs(3600);

    // Send initial tier2 in background (does not block T1 seed)
    spawn_tier2_task(sender.clone(), Arc::clone(&host_id));

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
                    &mut prev_disk_io,
                    &mut prev_vmstat,
                    &mut prev_psi,
                    &mut prev_snmp,
                    &mut prev_netstat,
                    &mut prev_softnet,
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
                    let id_payload = build_identity_payload(&host_id, &public_ip).await;
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

                // Periodic tier2 re-send (spawned in background, never blocks T1)
                if tier2_timer.elapsed() >= tier2_interval {
                    spawn_tier2_task(sender.clone(), Arc::clone(&host_id));
                    tier2_timer = tokio::time::Instant::now();
                }

                // Periodic public IP refresh via echo service (1h)
                if echo_timer.elapsed() >= echo_interval {
                    let pip = Arc::clone(&public_ip);
                    tokio::spawn(async move {
                        if let Some(ip) = fetch_public_ip().await {
                            *pip.lock().await = Some(ip);
                        }
                    });
                    echo_timer = tokio::time::Instant::now();
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

/// Spawn a background task that collects tier 2 data and sends it.
///
/// Runs independently of the T1 tick loop — T1 metrics are never delayed
/// by slow T2 collectors (du, find, docker inspect, etc.).
#[cfg_attr(coverage_nightly, coverage(off))]
fn spawn_tier2_task(sender: Sender, host_id: Arc<str>) {
    tokio::spawn(async move {
        let t2_payload = collect_tier2(&host_id).await;
        if let Err(e) = sender.post("/api/tier2", &t2_payload).await {
            tracing::error!(error = %e, "failed to send tier2");
        }
    });
}

#[cfg_attr(coverage_nightly, coverage(off))]
#[allow(clippy::too_many_arguments, clippy::too_many_lines)]
fn collect_metrics(
    host_id: &str,
    cfg: &config::Config,
    cpu_count: u32,
    prev_jiffies: &mut Option<CpuJiffies>,
    prev_net_counters: &mut Option<HashMap<String, NetCounters>>,
    prev_disk_io: &mut Option<Vec<collectors::disk_io::DiskIoCounters>>,
    prev_vmstat: &mut Option<collectors::memory::VmstatCounters>,
    prev_psi: &mut Option<collectors::psi::PsiData>,
    prev_snmp: &mut Option<collectors::snmp::SnmpCounters>,
    prev_netstat: &mut Option<collectors::netstat::NetstatCounters>,
    prev_softnet: &mut Option<collectors::softnet::SoftnetCounters>,
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
    let cpu_ext =
        orchestrate::compute_cpu_ext(prev_jiffies.as_ref(), curr_jiffies.as_ref(), elapsed);
    *prev_jiffies = curr_jiffies;

    // Load averages
    let loadavg_data = collectors::cpu::read_loadavg().ok();
    let loadavg = loadavg_data
        .as_ref()
        .map_or((0.0, 0.0, 0.0), |la| (la.load1, la.load5, la.load15));
    let tasks = loadavg_data
        .as_ref()
        .map_or((None, None), |la| (la.tasks_running, la.tasks_total));

    // Memory + vmstat (single /proc/vmstat read for both oom_kill and swap/pgfault rates)
    let mem_info = collectors::memory::read_meminfo().ok();
    let curr_vmstat = collectors::memory::read_vmstat();
    let prev_oom = prev_vmstat.as_ref().and_then(|v| v.oom_kill);
    let curr_oom = curr_vmstat.as_ref().and_then(|v| v.oom_kill);
    let oom_kills_delta = orchestrate::compute_oom_delta(prev_oom, curr_oom);
    let vmstat_rates =
        orchestrate::compute_vmstat_rates(prev_vmstat.as_ref(), curr_vmstat.as_ref(), elapsed);
    *prev_vmstat = curr_vmstat;

    let (mem, swap) =
        orchestrate::build_mem_swap_metrics(mem_info.as_ref(), oom_kills_delta, &vmstat_rates);

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

    // PSI pressure (with total deltas from previous sample)
    let curr_psi = collectors::psi::read_psi();
    let psi = curr_psi
        .as_ref()
        .map(|data| orchestrate::convert_psi(data, prev_psi.as_ref()));
    *prev_psi = curr_psi;

    // Disk I/O (Tier 3) — delta from previous diskstats sample
    let curr_disk_io = collectors::disk_io::read_diskstats().ok();
    let disk_io = orchestrate::compute_disk_io_delta(
        prev_disk_io.as_deref(),
        curr_disk_io.as_deref(),
        elapsed,
    );
    *prev_disk_io = curr_disk_io;

    // TCP connection state + sockstat extras
    let sockstat = collectors::tcp::read_sockstat();
    let tcp = sockstat
        .as_ref()
        .map(|(state, _)| orchestrate::convert_tcp(state));
    let socket = sockstat
        .as_ref()
        .and_then(|(_, extra)| extra.as_ref().map(orchestrate::convert_socket));
    let udp = sockstat
        .as_ref()
        .and_then(|(_, extra)| extra.as_ref().map(orchestrate::convert_udp));

    // File descriptor usage
    let fd = collectors::fd::read_fd_info().map(|i| orchestrate::convert_fd(&i));

    // SNMP protocol counters (delta/rate)
    let curr_snmp = collectors::snmp::read_snmp();
    let snmp = orchestrate::compute_snmp_delta(prev_snmp.as_ref(), curr_snmp.as_ref(), elapsed);
    *prev_snmp = curr_snmp;

    // Netstat extended TCP stats (delta)
    let curr_netstat = collectors::netstat::read_netstat();
    let netstat = orchestrate::compute_netstat_delta(prev_netstat.as_ref(), curr_netstat.as_ref());
    *prev_netstat = curr_netstat;

    // Softnet counters (delta)
    let curr_softnet = collectors::softnet::read_softnet_stat();
    let softnet = orchestrate::compute_softnet_delta(prev_softnet.as_ref(), curr_softnet.as_ref());
    *prev_softnet = curr_softnet;

    // Conntrack (instantaneous gauge, no delta)
    let conntrack =
        collectors::conntrack::read_conntrack().map(|s| orchestrate::convert_conntrack(&s));

    orchestrate::build_metrics_payload(
        PROBE_VERSION,
        host_id,
        timestamp,
        cfg.interval,
        cpu_count,
        cpu_usage,
        loadavg,
        cpu_ext,
        tasks,
        mem,
        swap,
        disk,
        net,
        uptime_seconds,
        psi,
        disk_io,
        tcp,
        fd,
        socket,
        udp,
        snmp,
        netstat,
        softnet,
        conntrack,
    )
}

#[cfg_attr(coverage_nightly, coverage(off))]
async fn build_identity_payload(
    host_id: &str,
    public_ip: &Arc<Mutex<Option<String>>>,
) -> payload::IdentityPayload {
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

    // Host inventory: CPU topology + memory totals
    let cpu_logical = collectors::cpu::read_cpu_count().ok();
    let cpu_physical = collectors::cpu::read_cpu_physical().ok();
    let mem_info = collectors::memory::read_meminfo().ok();
    let mem_total_bytes = mem_info.as_ref().map(|m| m.mem_total);
    let swap_total_bytes = mem_info.as_ref().map(|m| m.swap_total);

    // Host inventory: virtualization, network interfaces, disks, boot mode
    let virt = collectors::inventory::read_virtualization();
    let virtualization = if virt.is_empty() { None } else { Some(virt) };

    let ipv6_map = std::fs::read_to_string("/proc/net/if_inet6")
        .ok()
        .map(|c| collectors::inventory::parse_if_inet6(&c))
        .unwrap_or_default();
    // Build ip_map with empty IPv4 (no clean procfs source) and IPv6 from if_inet6
    let ip_map: std::collections::HashMap<String, (Vec<String>, Vec<String>)> = ipv6_map
        .into_iter()
        .map(|(iface, v6)| (iface, (vec![], v6)))
        .collect();
    let net_interfaces = Some(collectors::inventory::read_net_interfaces_from(
        "/sys/class/net",
        &ip_map,
    ));

    let disks_vec = collectors::inventory::read_block_devices();
    let disks = Some(disks_vec);

    let boot_mode = Some(collectors::inventory::detect_boot_mode());

    let pip = public_ip.lock().await.clone();

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
        cpu_logical,
        cpu_physical,
        mem_total_bytes,
        swap_total_bytes,
        virtualization,
        net_interfaces,
        disks,
        boot_mode,
        pip,
    )
}

#[cfg_attr(coverage_nightly, coverage(off))]
async fn collect_tier2(host_id: &str) -> payload::Tier2Payload {
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Ports: synchronous procfs scan (/proc/*/fd), offload to blocking
    // thread pool so the executor can yield back to T1 immediately.
    let ports_raw = tokio::task::spawn_blocking(collectors::tier2::ports::read_listening_ports)
        .await
        .unwrap_or_default();

    // Run all async collectors concurrently
    let (updates, systemd, security, docker, disk_deep) = tokio::join!(
        collectors::tier2::updates::collect_package_updates(),
        collectors::tier2::systemd::collect_failed_services(),
        collectors::tier2::security::collect_security_posture(),
        collectors::tier2::docker::collect_docker_status(),
        collectors::tier2::disk_deep::collect_disk_deep_scan(),
    );

    // Software discovery — reuses raw ports data
    let software = collectors::tier2::software::collect_software_discovery(Some(&ports_raw)).await;

    let ports_payload = Some(orchestrate::convert_ports(ports_raw));

    // Tier 2 inventory: timezone + DNS (fast synchronous reads)
    let tz = collectors::inventory::read_timezone();
    let timezone = if tz.is_empty() { None } else { Some(tz) };
    let dns = collectors::inventory::read_dns_config();
    let dns_resolvers = Some(dns.resolvers);
    let dns_search = Some(dns.search);

    orchestrate::build_tier2_payload(
        PROBE_VERSION,
        host_id,
        timestamp,
        ports_payload,
        updates.map(orchestrate::convert_updates),
        systemd.map(orchestrate::convert_systemd),
        Some(orchestrate::convert_security(security)),
        docker.map(orchestrate::convert_docker),
        Some(orchestrate::convert_disk_deep(disk_deep)),
        Some(orchestrate::convert_software(software)),
        timezone,
        dns_resolvers,
        dns_search,
    )
}

/// Fetch public IP from the echo service.
/// Returns `None` on any error (timeout, parse failure, network issue).
#[cfg_attr(coverage_nightly, coverage(off))]
async fn fetch_public_ip() -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .ok()?;

    let resp = match client.get(ECHO_URL).send().await {
        Ok(r) => r,
        Err(e) => {
            tracing::warn!(error = %e, "failed to fetch public IP from echo service");
            return None;
        }
    };

    let json: serde_json::Value = match resp.json().await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!(error = %e, "failed to parse echo service response");
            return None;
        }
    };

    json["ip"].as_str().map(ToString::to_string)
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
