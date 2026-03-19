use std::collections::HashMap;
use std::time::Duration;

use crate::collectors;
use crate::collectors::cpu::CpuJiffies;
use crate::collectors::network::NetCounters;
use crate::payload::{
    ConntrackMetrics, CpuMetrics, DiskIoMetric, DiskMetric, FdMetrics, IdentityPayload, MemMetrics,
    MetricsPayload, NetMetric, NetstatMetrics, PsiMetrics, SnmpMetrics, SocketMetrics,
    SoftnetMetrics, SwapMetrics, TcpMetrics, Tier2DetectedSoftware, Tier2DiskDeep, Tier2Docker,
    Tier2DockerContainer, Tier2DockerImages, Tier2FailedService, Tier2LargeFile,
    Tier2ListeningPort, Tier2Payload, Tier2Ports, Tier2Security, Tier2Software, Tier2Systemd,
    Tier2TopDir, TopProcess, UdpMetrics,
};

/// Compute CPU usage delta from optional previous and current jiffies.
pub fn compute_cpu_delta(prev: Option<&CpuJiffies>, curr: Option<&CpuJiffies>) -> (f64, f64, f64) {
    match (prev, curr) {
        (Some(p), Some(c)) => collectors::cpu::compute_cpu_usage(p, c),
        _ => (0.0, 0.0, 0.0),
    }
}

/// Compute Tier 3 CPU extensions from previous and current jiffies.
///
/// Returns `(context_switches_sec, forks_sec, procs_running, procs_blocked,
///           interrupts_sec, softirq_net_rx_sec, softirq_block_sec)`.
/// All `None` if either sample is missing.
#[allow(clippy::type_complexity)]
pub fn compute_cpu_ext(
    prev: Option<&CpuJiffies>,
    curr: Option<&CpuJiffies>,
    elapsed: Duration,
) -> (
    Option<f64>,
    Option<f64>,
    Option<u32>,
    Option<u32>,
    Option<f64>,
    Option<f64>,
    Option<f64>,
) {
    match (prev, curr) {
        (Some(p), Some(c)) => {
            let secs = elapsed.as_secs_f64();
            let ctxt_sec = if secs > 0.0 {
                Some(c.ctxt.saturating_sub(p.ctxt) as f64 / secs)
            } else {
                None
            };
            let forks_sec = if secs > 0.0 {
                Some(c.processes.saturating_sub(p.processes) as f64 / secs)
            } else {
                None
            };
            let intr_sec = if secs > 0.0 {
                Some(c.intr_total.saturating_sub(p.intr_total) as f64 / secs)
            } else {
                None
            };
            let softirq_net_rx_sec = if secs > 0.0 {
                Some(c.softirq_net_rx.saturating_sub(p.softirq_net_rx) as f64 / secs)
            } else {
                None
            };
            let softirq_block_sec = if secs > 0.0 {
                Some(c.softirq_block.saturating_sub(p.softirq_block) as f64 / secs)
            } else {
                None
            };
            (
                ctxt_sec,
                forks_sec,
                Some(c.procs_running),
                Some(c.procs_blocked),
                intr_sec,
                softirq_net_rx_sec,
                softirq_block_sec,
            )
        }
        _ => (None, None, None, None, None, None, None),
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
#[allow(clippy::too_many_arguments, clippy::type_complexity)]
pub fn build_metrics_payload(
    probe_version: &str,
    host_id: &str,
    timestamp: u64,
    interval: u32,
    cpu_count: u32,
    usage: (f64, f64, f64),
    loadavg: (f64, f64, f64),
    cpu_ext: (
        Option<f64>,
        Option<f64>,
        Option<u32>,
        Option<u32>,
        Option<f64>,
        Option<f64>,
        Option<f64>,
    ),
    tasks: (Option<u32>, Option<u32>),
    mem: MemMetrics,
    swap: SwapMetrics,
    disk: Vec<DiskMetric>,
    net: Vec<NetMetric>,
    uptime_seconds: u64,
    psi: Option<PsiMetrics>,
    disk_io: Option<Vec<DiskIoMetric>>,
    tcp: Option<TcpMetrics>,
    fd: Option<FdMetrics>,
    socket: Option<SocketMetrics>,
    udp: Option<UdpMetrics>,
    snmp: Option<SnmpMetrics>,
    netstat: Option<NetstatMetrics>,
    softnet: Option<SoftnetMetrics>,
    conntrack: Option<ConntrackMetrics>,
    top_processes: Option<Vec<TopProcess>>,
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
            context_switches_sec: cpu_ext.0,
            forks_sec: cpu_ext.1,
            procs_running: cpu_ext.2,
            procs_blocked: cpu_ext.3,
            interrupts_sec: cpu_ext.4,
            softirq_net_rx_sec: cpu_ext.5,
            softirq_block_sec: cpu_ext.6,
            tasks_running: tasks.0,
            tasks_total: tasks.1,
        },
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
        top_processes,
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
            inodes_total: d.inodes_total,
            inodes_avail: d.inodes_avail,
            inodes_used_pct: d.inodes_used_pct,
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
            rx_packets_rate: Some(n.rx_packets_rate),
            tx_packets_rate: Some(n.tx_packets_rate),
            rx_dropped: Some(n.rx_dropped_delta),
            tx_dropped: Some(n.tx_dropped_delta),
        })
        .collect()
}

/// Convert collector PSI data to payload PSI metrics.
///
/// If `prev` totals are provided, compute microsecond deltas for each resource.
pub fn convert_psi(
    data: &collectors::psi::PsiData,
    prev: Option<&collectors::psi::PsiData>,
) -> PsiMetrics {
    let (cpu_some_td, mem_some_td, mem_full_td, io_some_td, io_full_td) =
        prev.map_or((None, None, None, None, None), |p| {
            (
                Some(data.cpu.some.total.saturating_sub(p.cpu.some.total)),
                Some(data.memory.some.total.saturating_sub(p.memory.some.total)),
                Some(data.memory.full.total.saturating_sub(p.memory.full.total)),
                Some(data.io.some.total.saturating_sub(p.io.some.total)),
                Some(data.io.full.total.saturating_sub(p.io.full.total)),
            )
        });

    PsiMetrics {
        cpu_some_avg10: data.cpu.some.avg10,
        cpu_some_avg60: data.cpu.some.avg60,
        cpu_some_avg300: data.cpu.some.avg300,
        mem_some_avg10: data.memory.some.avg10,
        mem_some_avg60: data.memory.some.avg60,
        mem_some_avg300: data.memory.some.avg300,
        mem_full_avg10: data.memory.full.avg10,
        mem_full_avg60: data.memory.full.avg60,
        mem_full_avg300: data.memory.full.avg300,
        io_some_avg10: data.io.some.avg10,
        io_some_avg60: data.io.some.avg60,
        io_some_avg300: data.io.some.avg300,
        io_full_avg10: data.io.full.avg10,
        io_full_avg60: data.io.full.avg60,
        io_full_avg300: data.io.full.avg300,
        cpu_some_total_delta: cpu_some_td,
        mem_some_total_delta: mem_some_td,
        mem_full_total_delta: mem_full_td,
        io_some_total_delta: io_some_td,
        io_full_total_delta: io_full_td,
    }
}

/// Compute disk I/O metrics from previous and current counter samples.
///
/// Returns a `Vec<DiskIoMetric>` with per-device IOPS, throughput, and utilization.
/// Only includes devices present in both samples (new devices in `curr` are ignored
/// on the first sample, same as network counters).
pub fn compute_disk_io_delta(
    prev: Option<&[collectors::disk_io::DiskIoCounters]>,
    curr: Option<&[collectors::disk_io::DiskIoCounters]>,
    elapsed: Duration,
) -> Option<Vec<DiskIoMetric>> {
    let (Some(prev), Some(curr)) = (prev, curr) else {
        return None;
    };

    let elapsed_secs = elapsed.as_secs_f64();
    if elapsed_secs <= 0.0 {
        return Some(vec![]);
    }
    let elapsed_ms = elapsed.as_millis() as f64;

    let mut metrics = Vec::new();

    for curr_dev in curr {
        if let Some(prev_dev) = prev.iter().find(|d| d.device == curr_dev.device) {
            let reads_delta = curr_dev
                .reads_completed
                .saturating_sub(prev_dev.reads_completed);
            let writes_delta = curr_dev
                .writes_completed
                .saturating_sub(prev_dev.writes_completed);
            let sectors_read_delta = curr_dev.sectors_read.saturating_sub(prev_dev.sectors_read);
            let sectors_written_delta = curr_dev
                .sectors_written
                .saturating_sub(prev_dev.sectors_written);
            let io_ms_delta = curr_dev.io_ms.saturating_sub(prev_dev.io_ms);

            let io_util_pct = if elapsed_ms > 0.0 {
                (io_ms_delta as f64 / elapsed_ms * 100.0).min(100.0)
            } else {
                0.0
            };

            // Compute average await times: total_ms / total_ios for each direction.
            let read_ms_delta = curr_dev.read_ms.saturating_sub(prev_dev.read_ms);
            let write_ms_delta = curr_dev.write_ms.saturating_sub(prev_dev.write_ms);
            let read_await = if reads_delta > 0 {
                Some(read_ms_delta as f64 / reads_delta as f64)
            } else {
                Some(0.0)
            };
            let write_await = if writes_delta > 0 {
                Some(write_ms_delta as f64 / writes_delta as f64)
            } else {
                Some(0.0)
            };

            metrics.push(DiskIoMetric {
                device: curr_dev.device.clone(),
                read_iops: reads_delta as f64 / elapsed_secs,
                write_iops: writes_delta as f64 / elapsed_secs,
                read_bytes_sec: sectors_read_delta as f64 * 512.0 / elapsed_secs,
                write_bytes_sec: sectors_written_delta as f64 * 512.0 / elapsed_secs,
                io_util_pct,
                read_await_ms: read_await,
                write_await_ms: write_await,
                io_queue_depth: Some(curr_dev.io_in_progress),
            });
        }
    }

    Some(metrics)
}

/// Convert collector TCP state to payload TCP metrics.
pub const fn convert_tcp(state: &collectors::tcp::TcpState) -> TcpMetrics {
    TcpMetrics {
        established: state.established,
        time_wait: state.time_wait,
        orphan: state.orphan,
        allocated: state.allocated,
        mem_pages: state.mem_pages,
    }
}

/// Convert collector FD info to payload FD metrics.
pub const fn convert_fd(info: &collectors::fd::FdInfo) -> FdMetrics {
    FdMetrics {
        allocated: info.allocated,
        max: info.max,
    }
}

/// Convert sockstat extra to payload socket metrics.
pub const fn convert_socket(extra: &collectors::tcp::SockstatExtra) -> SocketMetrics {
    SocketMetrics {
        sockets_used: extra.sockets_used,
    }
}

/// Convert sockstat extra to payload UDP metrics.
pub const fn convert_udp(extra: &collectors::tcp::SockstatExtra) -> UdpMetrics {
    UdpMetrics {
        inuse: extra.udp_inuse,
        mem_pages: extra.udp_mem_pages,
    }
}

/// Compute SNMP counter deltas/rates from two samples.
pub fn compute_snmp_delta(
    prev: Option<&collectors::snmp::SnmpCounters>,
    curr: Option<&collectors::snmp::SnmpCounters>,
    elapsed: Duration,
) -> Option<SnmpMetrics> {
    let (Some(p), Some(c)) = (prev, curr) else {
        return None;
    };
    let secs = elapsed.as_secs_f64();
    if secs <= 0.0 {
        return None;
    }
    Some(SnmpMetrics {
        retrans_segs_sec: Some(c.retrans_segs.saturating_sub(p.retrans_segs) as f64 / secs),
        active_opens_sec: Some(c.active_opens.saturating_sub(p.active_opens) as f64 / secs),
        passive_opens_sec: Some(c.passive_opens.saturating_sub(p.passive_opens) as f64 / secs),
        attempt_fails_delta: Some(c.attempt_fails.saturating_sub(p.attempt_fails)),
        estab_resets_delta: Some(c.estab_resets.saturating_sub(p.estab_resets)),
        in_errs_delta: Some(c.in_errs.saturating_sub(p.in_errs)),
        out_rsts_delta: Some(c.out_rsts.saturating_sub(p.out_rsts)),
        udp_rcvbuf_errors_delta: Some(c.udp_rcvbuf_errors.saturating_sub(p.udp_rcvbuf_errors)),
        udp_sndbuf_errors_delta: Some(c.udp_sndbuf_errors.saturating_sub(p.udp_sndbuf_errors)),
        udp_in_errors_delta: Some(c.udp_in_errors.saturating_sub(p.udp_in_errors)),
    })
}

/// Compute netstat counter deltas from two samples.
pub const fn compute_netstat_delta(
    prev: Option<&collectors::netstat::NetstatCounters>,
    curr: Option<&collectors::netstat::NetstatCounters>,
) -> Option<NetstatMetrics> {
    let (Some(p), Some(c)) = (prev, curr) else {
        return None;
    };
    Some(NetstatMetrics {
        listen_overflows_delta: Some(c.listen_overflows.saturating_sub(p.listen_overflows)),
        listen_drops_delta: Some(c.listen_drops.saturating_sub(p.listen_drops)),
        tcp_timeouts_delta: Some(c.tcp_timeouts.saturating_sub(p.tcp_timeouts)),
        tcp_syn_retrans_delta: Some(c.tcp_syn_retrans.saturating_sub(p.tcp_syn_retrans)),
        tcp_fast_retrans_delta: Some(c.tcp_fast_retrans.saturating_sub(p.tcp_fast_retrans)),
        tcp_ofo_queue_delta: Some(c.tcp_ofo_queue.saturating_sub(p.tcp_ofo_queue)),
        tcp_abort_on_memory_delta: Some(
            c.tcp_abort_on_memory.saturating_sub(p.tcp_abort_on_memory),
        ),
        syncookies_sent_delta: Some(c.syncookies_sent.saturating_sub(p.syncookies_sent)),
    })
}

/// Compute softnet counter deltas from two samples.
pub const fn compute_softnet_delta(
    prev: Option<&collectors::softnet::SoftnetCounters>,
    curr: Option<&collectors::softnet::SoftnetCounters>,
) -> Option<SoftnetMetrics> {
    let (Some(p), Some(c)) = (prev, curr) else {
        return None;
    };
    Some(SoftnetMetrics {
        processed_delta: Some(c.processed.saturating_sub(p.processed)),
        dropped_delta: Some(c.dropped.saturating_sub(p.dropped)),
        time_squeeze_delta: Some(c.time_squeeze.saturating_sub(p.time_squeeze)),
    })
}

/// Convert conntrack state to payload metrics.
pub const fn convert_conntrack(state: &collectors::conntrack::ConntrackState) -> ConntrackMetrics {
    ConntrackMetrics {
        count: state.count,
        max: state.max,
    }
}

/// Convert a collector `ProcessSnapshot` to a payload `TopProcess`.
#[allow(dead_code)] // used in commit #3 when wired into collect_metrics
pub fn convert_top_process(snap: &collectors::top_processes::ProcessSnapshot) -> TopProcess {
    TopProcess {
        pid: snap.pid,
        name: snap.name.clone(),
        cmd: snap.cmd.clone(),
        state: snap.state.clone(),
        ppid: snap.ppid,
        user: snap.user.clone(),
        cpu_pct: snap.cpu_pct,
        mem_rss: snap.mem_rss,
        mem_pct: snap.mem_pct,
        mem_virt: snap.mem_virt,
        num_threads: snap.num_threads,
        uptime: snap.uptime_secs,
        majflt_rate: snap.majflt_rate,
        io_read_rate: snap.io_read_rate,
        io_write_rate: snap.io_write_rate,
        processor: snap.processor,
    }
}

/// Convert a list of process snapshots to payload format.
#[allow(dead_code)] // used in commit #3 when wired into collect_metrics
pub fn convert_top_processes(
    snapshots: &[collectors::top_processes::ProcessSnapshot],
) -> Vec<TopProcess> {
    snapshots.iter().map(convert_top_process).collect()
}

/// Compute OOM kill delta from previous and current cumulative counters.
///
/// Returns `None` if either sample is missing. Returns `Some(0)` when
/// both are present but no new kills occurred.
pub const fn compute_oom_delta(prev: Option<u64>, curr: Option<u64>) -> Option<u64> {
    match (prev, curr) {
        (Some(p), Some(c)) => Some(c.saturating_sub(p)),
        _ => None,
    }
}

/// Compute boot time from current epoch seconds and uptime seconds.
pub const fn compute_boot_time(now_secs: u64, uptime_secs: u64) -> u64 {
    now_secs.saturating_sub(uptime_secs)
}

/// Vmstat rate fields computed from two samples.
#[derive(Debug, Clone, Default)]
#[allow(clippy::struct_field_names)]
pub struct VmstatRates {
    pub swap_in_sec: Option<f64>,
    pub swap_out_sec: Option<f64>,
    pub pgmajfault_sec: Option<f64>,
    pub pgpgin_sec: Option<f64>,
    pub pgpgout_sec: Option<f64>,
}

/// Compute vmstat rates from previous and current [`VmstatCounters`].
pub fn compute_vmstat_rates(
    prev: Option<&collectors::memory::VmstatCounters>,
    curr: Option<&collectors::memory::VmstatCounters>,
    elapsed: Duration,
) -> VmstatRates {
    match (prev, curr) {
        (Some(p), Some(c)) => {
            let secs = elapsed.as_secs_f64();
            if secs <= 0.0 {
                return VmstatRates::default();
            }
            VmstatRates {
                swap_in_sec: Some(c.pswpin.saturating_sub(p.pswpin) as f64 / secs),
                swap_out_sec: Some(c.pswpout.saturating_sub(p.pswpout) as f64 / secs),
                pgmajfault_sec: Some(c.pgmajfault.saturating_sub(p.pgmajfault) as f64 / secs),
                pgpgin_sec: Some(c.pgpgin.saturating_sub(p.pgpgin) as f64 / secs),
                pgpgout_sec: Some(c.pgpgout.saturating_sub(p.pgpgout) as f64 / secs),
            }
        }
        _ => VmstatRates::default(),
    }
}

/// Build memory and swap metrics from an optional [`MemInfo`], defaulting to zero.
pub fn build_mem_swap_metrics(
    mem_info: Option<&collectors::memory::MemInfo>,
    oom_kills_delta: Option<u64>,
    vmstat_rates: &VmstatRates,
) -> (MemMetrics, SwapMetrics) {
    mem_info.map_or(
        (
            MemMetrics {
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
                    oom_kills_delta,
                    buffers: info.buffers,
                    cached: info.cached,
                    dirty: info.dirty,
                    writeback: info.writeback,
                    shmem: info.shmem,
                    slab_reclaimable: info.slab_reclaimable,
                    slab_unreclaim: info.slab_unreclaim,
                    committed_as: info.committed_as,
                    commit_limit: info.commit_limit,
                    hw_corrupted: info.hw_corrupted,
                    swap_in_sec: vmstat_rates.swap_in_sec,
                    swap_out_sec: vmstat_rates.swap_out_sec,
                    pgmajfault_sec: vmstat_rates.pgmajfault_sec,
                    pgpgin_sec: vmstat_rates.pgpgin_sec,
                    pgpgout_sec: vmstat_rates.pgpgout_sec,
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
use crate::collectors::inventory::{BlockDevice, NetInterface};

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
    cpu_logical: Option<u32>,
    cpu_physical: Option<u32>,
    mem_total_bytes: Option<u64>,
    swap_total_bytes: Option<u64>,
    virtualization: Option<String>,
    net_interfaces: Option<Vec<NetInterface>>,
    disks: Option<Vec<BlockDevice>>,
    boot_mode: Option<String>,
    public_ip: Option<String>,
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
        cpu_logical,
        cpu_physical,
        mem_total_bytes,
        swap_total_bytes,
        virtualization,
        net_interfaces,
        disks,
        boot_mode,
        public_ip,
    }
}

// --- Tier 2 conversion functions ---

use crate::collectors::tier2::disk_deep::DiskDeepScanInfo;
use crate::collectors::tier2::docker::DockerStatusInfo;
use crate::collectors::tier2::ports::ListeningPort;
use crate::collectors::tier2::security::SecurityPostureInfo;
use crate::collectors::tier2::software::SoftwareDiscoveryInfo;
use crate::collectors::tier2::systemd::SystemdServicesInfo;

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

/// Convert collector software discovery to payload software.
pub fn convert_software(info: SoftwareDiscoveryInfo) -> Tier2Software {
    Tier2Software {
        detected: info
            .detected
            .into_iter()
            .map(|s| Tier2DetectedSoftware {
                id: s.id,
                name: s.name,
                category: s.category,
                version: s.version,
                source: s.source,
                running: s.running,
                listening_ports: s.listening_ports,
            })
            .collect(),
        scan_duration_ms: info.scan_duration_ms,
        version_duration_ms: info.version_duration_ms,
    }
}

/// Build a [`Tier2Payload`] from collected tier 2 data.
#[allow(clippy::too_many_arguments)]
pub fn build_tier2_payload(
    probe_version: &str,
    host_id: &str,
    timestamp: u64,
    ports: Option<Tier2Ports>,
    systemd: Option<Tier2Systemd>,
    security: Option<Tier2Security>,
    docker: Option<Tier2Docker>,
    disk_deep: Option<Tier2DiskDeep>,
    software: Option<Tier2Software>,
    timezone: Option<String>,
    dns_resolvers: Option<Vec<String>>,
    dns_search: Option<Vec<String>>,
) -> Tier2Payload {
    Tier2Payload {
        probe_version: probe_version.to_string(),
        host_id: host_id.to_string(),
        timestamp,
        ports,
        systemd,
        security,
        docker,
        disk_deep,
        software,
        timezone,
        dns_resolvers,
        dns_search,
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
            Some(8),
            Some(4),
            Some(8_388_608_000),
            Some(2_147_483_648),
            Some("kvm".to_string()),
            Some(vec![]),
            Some(vec![]),
            Some("uefi".to_string()),
            Some("203.0.113.1".to_string()),
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
        assert_eq!(p.cpu_logical, Some(8));
        assert_eq!(p.cpu_physical, Some(4));
        assert_eq!(p.mem_total_bytes, Some(8_388_608_000));
        assert_eq!(p.swap_total_bytes, Some(2_147_483_648));
        assert_eq!(p.virtualization, Some("kvm".to_string()));
        assert!(p.net_interfaces.unwrap().is_empty());
        assert!(p.disks.unwrap().is_empty());
        assert_eq!(p.boot_mode, Some("uefi".to_string()));
        assert_eq!(p.public_ip, Some("203.0.113.1".to_string()));
    }

    #[test]
    fn build_identity_payload_empty_fields() {
        let p = build_identity_payload(
            "", "", "", "", "", "", "", 0, 0, None, None, None, None, None, None, None, None, None,
        );
        assert_eq!(p.host_id, "");
        assert_eq!(p.hostname, "");
        assert_eq!(p.uptime_seconds, 0);
        assert_eq!(p.boot_time, 0);
        assert_eq!(p.cpu_logical, None);
        assert_eq!(p.cpu_physical, None);
        assert_eq!(p.mem_total_bytes, None);
        assert_eq!(p.swap_total_bytes, None);
        assert_eq!(p.virtualization, None);
        assert_eq!(p.net_interfaces, None);
        assert_eq!(p.disks, None);
        assert_eq!(p.boot_mode, None);
        assert_eq!(p.public_ip, None);
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
        };
        let (mem, swap) = build_mem_swap_metrics(Some(&info), Some(5), &VmstatRates::default());
        assert_eq!(mem.total_bytes, 4_000_000);
        assert_eq!(mem.available_bytes, 2_000_000);
        assert_eq!(mem.oom_kills_delta, Some(5));
        assert_eq!(swap.total_bytes, 1_000_000);
        assert_eq!(swap.used_bytes, 500_000);
    }

    #[test]
    fn build_mem_swap_metrics_with_none() {
        let (mem, swap) = build_mem_swap_metrics(None, None, &VmstatRates::default());
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
            inodes_total: None,
            inodes_avail: None,
            inodes_used_pct: None,
        }];
        let net = vec![NetMetric {
            iface: "eth0".into(),
            rx_bytes_rate: 100.0,
            tx_bytes_rate: 200.0,
            rx_errors: 0,
            tx_errors: 0,
            rx_packets_rate: None,
            tx_packets_rate: None,
            rx_dropped: None,
            tx_dropped: None,
        }];
        let p = build_metrics_payload(
            "0.2.0",
            "host-1",
            1_700_000_000,
            30,
            4,
            (12.5, 1.2, 0.0),
            (0.5, 0.3, 0.2),
            (None, None, None, None, None, None, None),
            (None, None),
            mem,
            swap,
            disk,
            net,
            86400,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
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
            (None, None, None, None, None, None, None),
            (None, None),
            mem,
            swap,
            vec![],
            vec![],
            0,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
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
            inodes_total: None,
            inodes_avail: None,
            inodes_used_pct: None,
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
            rx_packets_rate: 0.0,
            tx_packets_rate: 0.0,
            rx_dropped_delta: 0,
            tx_dropped_delta: 0,
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
            Some("UTC".to_string()),
            Some(vec!["1.1.1.1".to_string()]),
            Some(vec![]),
        );
        assert_eq!(payload.probe_version, "0.2.0");
        assert_eq!(payload.host_id, "host-1");
        assert_eq!(payload.timestamp, 1_700_000_000);
        assert!(payload.ports.is_some());
        assert!(payload.software.is_none());
        assert_eq!(payload.timezone, Some("UTC".to_string()));
        assert_eq!(payload.dns_resolvers, Some(vec!["1.1.1.1".to_string()]));
        assert_eq!(payload.dns_search, Some(vec![]));
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

    #[test]
    fn convert_psi_maps_all_fields() {
        use collectors::psi::{PsiData, PsiLine, PsiResource};

        let data = PsiData {
            cpu: PsiResource {
                some: PsiLine {
                    avg10: 2.40,
                    avg60: 2.13,
                    avg300: 1.40,
                    ..Default::default()
                },
                full: PsiLine::default(),
            },
            memory: PsiResource {
                some: PsiLine {
                    avg10: 1.0,
                    avg60: 0.5,
                    avg300: 0.3,
                    ..Default::default()
                },
                full: PsiLine {
                    avg10: 0.1,
                    avg60: 0.05,
                    avg300: 0.01,
                    ..Default::default()
                },
            },
            io: PsiResource {
                some: PsiLine {
                    avg10: 0.50,
                    avg60: 0.01,
                    avg300: 0.0,
                    ..Default::default()
                },
                full: PsiLine {
                    avg10: 0.30,
                    avg60: 0.0,
                    avg300: 0.0,
                    ..Default::default()
                },
            },
        };

        let psi = convert_psi(&data, None);
        assert!((psi.cpu_some_avg10 - 2.40).abs() < f64::EPSILON);
        assert!((psi.cpu_some_avg60 - 2.13).abs() < f64::EPSILON);
        assert!((psi.cpu_some_avg300 - 1.40).abs() < f64::EPSILON);
        assert!((psi.mem_some_avg10 - 1.0).abs() < f64::EPSILON);
        assert!((psi.mem_full_avg10 - 0.1).abs() < f64::EPSILON);
        assert!((psi.io_some_avg10 - 0.50).abs() < f64::EPSILON);
        assert!((psi.io_full_avg10 - 0.30).abs() < f64::EPSILON);
    }

    #[test]
    fn build_metrics_payload_with_psi() {
        let mem = MemMetrics {
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
        };
        let swap = SwapMetrics {
            total_bytes: 0,
            used_bytes: 0,
            used_pct: 0.0,
        };
        let psi = Some(PsiMetrics {
            cpu_some_avg10: 5.0,
            cpu_some_avg60: 3.0,
            cpu_some_avg300: 1.0,
            mem_some_avg10: 0.0,
            mem_some_avg60: 0.0,
            mem_some_avg300: 0.0,
            mem_full_avg10: 0.0,
            mem_full_avg60: 0.0,
            mem_full_avg300: 0.0,
            io_some_avg10: 0.0,
            io_some_avg60: 0.0,
            io_some_avg300: 0.0,
            io_full_avg10: 0.0,
            io_full_avg60: 0.0,
            io_full_avg300: 0.0,
            cpu_some_total_delta: None,
            mem_some_total_delta: None,
            mem_full_total_delta: None,
            io_some_total_delta: None,
            io_full_total_delta: None,
        });
        let p = build_metrics_payload(
            "0.3.0",
            "h",
            0,
            30,
            1,
            (0.0, 0.0, 0.0),
            (0.0, 0.0, 0.0),
            (None, None, None, None, None, None, None),
            (None, None),
            mem,
            swap,
            vec![],
            vec![],
            0,
            psi,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(p.psi.is_some());
        assert!((p.psi.unwrap().cpu_some_avg10 - 5.0).abs() < f64::EPSILON);
    }

    #[test]
    fn compute_oom_delta_normal() {
        assert_eq!(compute_oom_delta(Some(5), Some(8)), Some(3));
    }

    #[test]
    fn compute_oom_delta_no_change() {
        assert_eq!(compute_oom_delta(Some(5), Some(5)), Some(0));
    }

    #[test]
    fn compute_oom_delta_missing_prev() {
        assert!(compute_oom_delta(None, Some(3)).is_none());
    }

    #[test]
    fn compute_oom_delta_missing_curr() {
        assert!(compute_oom_delta(Some(3), None).is_none());
    }

    #[test]
    fn compute_oom_delta_both_none() {
        assert!(compute_oom_delta(None, None).is_none());
    }

    #[test]
    fn compute_oom_delta_counter_reset() {
        // Counter reset: curr < prev → saturating_sub returns 0
        assert_eq!(compute_oom_delta(Some(10), Some(3)), Some(0));
    }

    #[test]
    fn compute_cpu_ext_normal() {
        let prev = CpuJiffies {
            ctxt: 1_000_000,
            processes: 10000,
            procs_running: 1,
            procs_blocked: 0,
            ..Default::default()
        };
        let curr = CpuJiffies {
            ctxt: 1_030_000,
            processes: 10300,
            procs_running: 3,
            procs_blocked: 1,
            ..Default::default()
        };
        let (ctxt, forks, running, blocked, intr, softirq_net_rx, softirq_block) =
            compute_cpu_ext(Some(&prev), Some(&curr), Duration::from_secs(30));
        // ctxt delta = 30000 / 30s = 1000/s
        assert!((ctxt.unwrap() - 1000.0).abs() < f64::EPSILON);
        // processes delta = 300 / 30s = 10/s
        assert!((forks.unwrap() - 10.0).abs() < f64::EPSILON);
        assert_eq!(running, Some(3));
        assert_eq!(blocked, Some(1));
        // New fields: no intr/softirq data in fixtures → 0-delta / 0s = 0.0
        assert!(intr.is_some());
        assert!(softirq_net_rx.is_some());
        assert!(softirq_block.is_some());
    }

    #[test]
    fn compute_cpu_ext_missing_prev() {
        let curr = CpuJiffies {
            ctxt: 1000,
            ..Default::default()
        };
        let (ctxt, forks, running, blocked, intr, softirq_net_rx, softirq_block) =
            compute_cpu_ext(None, Some(&curr), Duration::from_secs(30));
        assert!(ctxt.is_none());
        assert!(forks.is_none());
        assert!(running.is_none());
        assert!(blocked.is_none());
        assert!(intr.is_none());
        assert!(softirq_net_rx.is_none());
        assert!(softirq_block.is_none());
    }

    #[test]
    fn compute_cpu_ext_both_none() {
        let (ctxt, forks, running, blocked, intr, softirq_net_rx, softirq_block) =
            compute_cpu_ext(None, None, Duration::from_secs(30));
        assert!(ctxt.is_none());
        assert!(forks.is_none());
        assert!(running.is_none());
        assert!(blocked.is_none());
        assert!(intr.is_none());
        assert!(softirq_net_rx.is_none());
        assert!(softirq_block.is_none());
    }

    #[test]
    fn compute_cpu_ext_zero_elapsed() {
        let prev = CpuJiffies {
            ctxt: 1000,
            processes: 100,
            ..Default::default()
        };
        let curr = CpuJiffies {
            ctxt: 2000,
            processes: 200,
            procs_running: 2,
            procs_blocked: 0,
            ..Default::default()
        };
        let (ctxt, forks, running, blocked, intr, softirq_net_rx, softirq_block) =
            compute_cpu_ext(Some(&prev), Some(&curr), Duration::from_secs(0));
        // Zero elapsed → rates are None, gauges still populated
        assert!(ctxt.is_none());
        assert!(forks.is_none());
        assert_eq!(running, Some(2));
        assert_eq!(blocked, Some(0));
        assert!(intr.is_none());
        assert!(softirq_net_rx.is_none());
        assert!(softirq_block.is_none());
    }

    #[test]
    fn compute_disk_io_delta_both_none() {
        assert!(compute_disk_io_delta(None, None, Duration::from_secs(30)).is_none());
    }

    #[test]
    fn compute_disk_io_delta_missing_prev() {
        use collectors::disk_io::DiskIoCounters;
        let curr = vec![DiskIoCounters {
            device: "sda".into(),
            ..Default::default()
        }];
        assert!(compute_disk_io_delta(None, Some(&curr), Duration::from_secs(30)).is_none());
    }

    #[test]
    fn compute_disk_io_delta_normal() {
        use collectors::disk_io::DiskIoCounters;
        let prev = vec![DiskIoCounters {
            device: "sda".into(),
            reads_completed: 1000,
            sectors_read: 20000,
            writes_completed: 5000,
            sectors_written: 100000,
            io_ms: 5000,
            ..Default::default()
        }];
        let curr = vec![DiskIoCounters {
            device: "sda".into(),
            reads_completed: 1300,
            sectors_read: 26000,
            writes_completed: 5600,
            sectors_written: 112000,
            io_ms: 8000,
            ..Default::default()
        }];
        let result =
            compute_disk_io_delta(Some(&prev), Some(&curr), Duration::from_secs(30)).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].device, "sda");
        // reads delta = 300, write delta = 600 over 30s
        assert!((result[0].read_iops - 10.0).abs() < f64::EPSILON);
        assert!((result[0].write_iops - 20.0).abs() < f64::EPSILON);
        // sectors read delta = 6000 × 512 / 30 = 102400
        assert!((result[0].read_bytes_sec - 102400.0).abs() < 0.1);
        // sectors written delta = 12000 × 512 / 30 = 204800
        assert!((result[0].write_bytes_sec - 204800.0).abs() < 0.1);
        // io_ms delta = 3000ms over 30000ms = 10%
        assert!((result[0].io_util_pct - 10.0).abs() < 0.1);
    }

    #[test]
    fn compute_disk_io_delta_new_device_ignored() {
        use collectors::disk_io::DiskIoCounters;
        let prev = vec![DiskIoCounters {
            device: "sda".into(),
            ..Default::default()
        }];
        let curr = vec![
            DiskIoCounters {
                device: "sda".into(),
                reads_completed: 100,
                ..Default::default()
            },
            DiskIoCounters {
                device: "sdb".into(),
                reads_completed: 50,
                ..Default::default()
            },
        ];
        let result =
            compute_disk_io_delta(Some(&prev), Some(&curr), Duration::from_secs(30)).unwrap();
        // sdb not in prev → not in result
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].device, "sda");
    }

    #[test]
    fn compute_disk_io_delta_util_capped_at_100() {
        use collectors::disk_io::DiskIoCounters;
        let prev = vec![DiskIoCounters {
            device: "sda".into(),
            io_ms: 0,
            ..Default::default()
        }];
        let curr = vec![DiskIoCounters {
            device: "sda".into(),
            io_ms: 60000, // 60s of I/O in 30s = 200% → should cap at 100%
            ..Default::default()
        }];
        let result =
            compute_disk_io_delta(Some(&prev), Some(&curr), Duration::from_secs(30)).unwrap();
        assert!((result[0].io_util_pct - 100.0).abs() < f64::EPSILON);
    }
}
