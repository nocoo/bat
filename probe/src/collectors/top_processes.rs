//! Per-process metrics from `/proc/[pid]/{stat,cmdline,io}`.
//!
//! Two-phase collection strategy:
//! - Phase 1: scan ALL `/proc/[pid]/stat` (single read per PID)
//! - Phase 2: enrich Top N with `/proc/[pid]/cmdline` + `/proc/[pid]/io`

use std::collections::HashMap;

/// Maximum number of processes to return in the snapshot.
const TOP_N: usize = 50;

/// Maximum cmdline length in bytes before truncation.
const MAX_CMDLINE_BYTES: usize = 200;

// ── Parsed structures ────────────────────────────────────────────────

/// Minimal fields from `/proc/[pid]/stat`, parsed with comm-aware strategy (§2.2).
#[derive(Debug, Clone)]
pub struct ProcStat {
    pub pid: u32,
    pub comm: String,
    pub state: char,
    pub ppid: u32,
    pub utime: u64,
    pub stime: u64,
    pub num_threads: u32,
    pub starttime: u64,
    pub vsize: u64,
    pub rss: i64,
    pub majflt: u64,
    pub processor: i32,
}

/// Cumulative I/O counters from `/proc/[pid]/io`.
#[derive(Debug, Clone, Default)]
pub struct ProcIo {
    pub read_bytes: u64,
    pub write_bytes: u64,
}

/// Previous-cycle state stored per PID for delta calculation.
#[derive(Debug, Clone)]
pub struct PrevProcStat {
    pub cpu_ticks: u64,
    pub starttime: u64,
    pub majflt: u64,
    pub read_bytes: u64,
    pub write_bytes: u64,
}

/// Fully enriched per-process snapshot (output of two-phase collection).
#[derive(Debug, Clone)]
pub struct ProcessSnapshot {
    pub pid: u32,
    pub name: String,
    pub cmd: String,
    pub state: String,
    pub ppid: u32,
    pub user: String,
    pub cpu_pct: Option<f64>,
    pub mem_rss: u64,
    pub mem_pct: f64,
    pub mem_virt: u64,
    pub num_threads: u32,
    pub uptime_secs: u64,
    pub majflt_rate: Option<f64>,
    pub io_read_rate: Option<f64>,
    pub io_write_rate: Option<f64>,
    pub processor: i32,
}

// ── Parsers (pure functions, no I/O) ─────────────────────────────────

/// Parse `/proc/[pid]/stat` content using comm-aware algorithm.
///
/// The `comm` field (#2) is wrapped in `(...)` and may contain spaces,
/// parentheses, or any character. We find the FIRST `(` and LAST `)` to
/// correctly delimit comm, then split the remainder by whitespace.
#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
pub fn parse_proc_stat(content: &str) -> Option<ProcStat> {
    let comm_start = content.find('(')?;
    let comm_end = content.rfind(')')?;
    if comm_end <= comm_start {
        return None;
    }

    let pid: u32 = content[..comm_start].trim().parse().ok()?;
    let comm = &content[comm_start + 1..comm_end];

    // After ") " come fields #3 onwards
    let rest = content.get(comm_end + 2..)?;
    let fields: Vec<&str> = rest.split_whitespace().collect();

    // We need at least field index 36 (processor = stat field #39, index 36)
    if fields.len() < 37 {
        return None;
    }

    // Field mapping: fields[N] = stat field #(N+3)
    // state=#3 → [0], ppid=#4 → [1], majflt=#12 → [9], utime=#14 → [11],
    // stime=#15 → [12], num_threads=#20 → [17], starttime=#22 → [19],
    // vsize=#23 → [20], rss=#24 → [21], processor=#39 → [36]
    Some(ProcStat {
        pid,
        comm: comm.to_string(),
        state: fields[0].chars().next().unwrap_or('?'),
        ppid: fields[1].parse().unwrap_or(0),
        majflt: fields[9].parse().unwrap_or(0),
        utime: fields[11].parse().unwrap_or(0),
        stime: fields[12].parse().unwrap_or(0),
        num_threads: fields[17].parse().unwrap_or(0),
        starttime: fields[19].parse().unwrap_or(0),
        vsize: fields[20].parse().unwrap_or(0),
        rss: fields[21].parse().unwrap_or(0),
        processor: fields[36].parse().unwrap_or(-1),
    })
}

/// Parse `/proc/[pid]/cmdline`: NUL-separated args → space-joined, truncated.
pub fn parse_cmdline(content: &[u8]) -> String {
    if content.is_empty() {
        return String::new();
    }

    // Truncate to MAX_CMDLINE_BYTES, then replace \0 with space
    let len = content.len().min(MAX_CMDLINE_BYTES);
    let truncated = &content[..len];

    let mut s = String::with_capacity(len);
    for &b in truncated {
        if b == 0 {
            s.push(' ');
        } else {
            s.push(b as char);
        }
    }

    // Trim trailing space (last arg ends with \0)
    s.trim_end().to_string()
}

/// Parse `/proc/[pid]/io` key-value content.
pub fn parse_proc_io(content: &str) -> Option<ProcIo> {
    let mut io = ProcIo::default();
    let mut found = 0u8;

    for line in content.lines() {
        if let Some(val) = line.strip_prefix("read_bytes: ") {
            io.read_bytes = val.trim().parse().unwrap_or(0);
            found |= 1;
        } else if let Some(val) = line.strip_prefix("write_bytes: ") {
            io.write_bytes = val.trim().parse().unwrap_or(0);
            found |= 2;
        }
        if found == 3 {
            break;
        }
    }

    if found > 0 { Some(io) } else { None }
}

/// Parse `/etc/passwd` into a UID → username map.
pub fn parse_passwd(content: &str) -> HashMap<u32, String> {
    let mut map = HashMap::new();
    for line in content.lines() {
        // format: name:x:uid:gid:...
        let parts: Vec<&str> = line.splitn(4, ':').collect();
        if parts.len() >= 3
            && let Ok(uid) = parts[2].parse::<u32>()
        {
            map.insert(uid, parts[0].to_string());
        }
    }
    map
}

/// Get the system page size at runtime via `sysconf(_SC_PAGESIZE)`.
///
/// NOT hardcoded to 4096 — aarch64 may use 16KiB or 64KiB pages.
#[allow(clippy::cast_sign_loss)]
pub fn get_page_size() -> u64 {
    // SAFETY: sysconf is always safe to call with a valid constant
    let ps = unsafe { libc::sysconf(libc::_SC_PAGESIZE) };
    if ps > 0 { ps as u64 } else { 4096 }
}

/// Resolve a UID to a username using the cached passwd map.
/// Falls back to `uid:<N>` if not found.
pub fn resolve_username(uid: u32, passwd_map: &HashMap<u32, String>) -> String {
    passwd_map
        .get(&uid)
        .cloned()
        .unwrap_or_else(|| format!("uid:{uid}"))
}

/// Get the UID of a `/proc/[pid]` directory via stat(2).
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn get_proc_uid(pid: u32) -> Option<u32> {
    let path = format!("/proc/{pid}");
    let meta = std::fs::metadata(&path).ok()?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        Some(meta.uid())
    }
    #[cfg(not(unix))]
    {
        let _ = meta;
        None
    }
}

// ── Two-phase collection ─────────────────────────────────────────────

/// Compute per-process CPU% given previous and current tick sums,
/// plus system-wide total jiffies delta and CPU count.
///
/// Returns `None` if this is the first cycle (no prev data) or if the
/// PID was reused (starttime mismatch → delta reset).
pub fn compute_process_cpu_pct(
    prev_ticks: u64,
    curr_ticks: u64,
    total_jiffies_delta: u64,
    cpu_count: u32,
) -> f64 {
    if total_jiffies_delta == 0 {
        return 0.0;
    }
    let proc_delta = curr_ticks.saturating_sub(prev_ticks);
    proc_delta as f64 / total_jiffies_delta as f64 * f64::from(cpu_count) * 100.0
}

/// Build the full process snapshot from two-phase data.
///
/// - `stat`: parsed `/proc/[pid]/stat`
/// - `cmd`: parsed cmdline (may be empty for zombies)
/// - `io`: parsed `/proc/[pid]/io` (None if no permission)
/// - `prev`: previous cycle state (None on first cycle or PID reuse)
/// - `total_jiffies_delta`: system-wide CPU ticks delta
/// - `elapsed_secs`: wall-clock seconds between samples
/// - `cpu_count`: number of logical CPUs
/// - `page_size`: system page size in bytes
/// - `mem_total`: total system memory in bytes
/// - `boot_time_secs`: system boot time as unix timestamp
/// - `now_secs`: current unix timestamp
/// - `uid`: process owner UID
/// - `passwd_map`: UID → username cache
#[allow(clippy::too_many_arguments)]
pub fn build_snapshot(
    stat: &ProcStat,
    cmd: &str,
    io: Option<&ProcIo>,
    prev: Option<&PrevProcStat>,
    total_jiffies_delta: u64,
    elapsed_secs: f64,
    cpu_count: u32,
    page_size: u64,
    mem_total: u64,
    boot_time_secs: u64,
    now_secs: u64,
    uid: u32,
    passwd_map: &HashMap<u32, String>,
) -> ProcessSnapshot {
    let curr_ticks = stat.utime + stat.stime;

    // CPU% — None on first cycle or PID reuse
    let cpu_pct = prev
        .map(|p| compute_process_cpu_pct(p.cpu_ticks, curr_ticks, total_jiffies_delta, cpu_count));

    // RSS in bytes
    let mem_rss = if stat.rss > 0 {
        stat.rss as u64 * page_size
    } else {
        0
    };
    let mem_pct = if mem_total > 0 {
        mem_rss as f64 / mem_total as f64 * 100.0
    } else {
        0.0
    };

    // Major fault rate (delta / elapsed)
    let majflt_rate = prev.and_then(|p| {
        if elapsed_secs > 0.0 {
            Some(stat.majflt.saturating_sub(p.majflt) as f64 / elapsed_secs)
        } else {
            None
        }
    });

    // I/O rates (delta / elapsed)
    let (io_read_rate, io_write_rate) = match (io, prev) {
        (Some(curr_io), Some(p)) if elapsed_secs > 0.0 => (
            Some(curr_io.read_bytes.saturating_sub(p.read_bytes) as f64 / elapsed_secs),
            Some(curr_io.write_bytes.saturating_sub(p.write_bytes) as f64 / elapsed_secs),
        ),
        _ => (None, None),
    };

    // Process uptime: starttime is in clock ticks since boot
    let clk_tck = unsafe { libc::sysconf(libc::_SC_CLK_TCK) };
    let clk_tck = if clk_tck > 0 { clk_tck as u64 } else { 100 };
    let proc_start_secs = boot_time_secs + stat.starttime / clk_tck;
    let uptime_secs = now_secs.saturating_sub(proc_start_secs);

    // Command line: use cmdline if available, fall back to comm
    let effective_cmd = if cmd.is_empty() {
        stat.comm.clone()
    } else {
        cmd.to_string()
    };

    ProcessSnapshot {
        pid: stat.pid,
        name: stat.comm.clone(),
        cmd: effective_cmd,
        state: stat.state.to_string(),
        ppid: stat.ppid,
        user: resolve_username(uid, passwd_map),
        cpu_pct,
        mem_rss,
        mem_pct,
        mem_virt: stat.vsize,
        num_threads: stat.num_threads,
        uptime_secs,
        majflt_rate,
        io_read_rate,
        io_write_rate,
        processor: stat.processor,
    }
}

/// Extract prev-state from current cycle data for storage.
pub fn extract_prev_state(stat: &ProcStat, io: Option<&ProcIo>) -> PrevProcStat {
    PrevProcStat {
        cpu_ticks: stat.utime + stat.stime,
        starttime: stat.starttime,
        majflt: stat.majflt,
        read_bytes: io.map_or(0, |i| i.read_bytes),
        write_bytes: io.map_or(0, |i| i.write_bytes),
    }
}

// ── Live readers (require Linux /proc) ───────────────────────────────

/// Read and parse `/proc/[pid]/stat`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_proc_stat(pid: u32) -> Option<ProcStat> {
    let content = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    parse_proc_stat(&content)
}

/// Read `/proc/[pid]/cmdline` as raw bytes.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_cmdline(pid: u32) -> String {
    let bytes = std::fs::read(format!("/proc/{pid}/cmdline")).unwrap_or_default();
    parse_cmdline(&bytes)
}

/// Read and parse `/proc/[pid]/io` (may fail without permission).
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_proc_io(pid: u32) -> Option<ProcIo> {
    let content = std::fs::read_to_string(format!("/proc/{pid}/io")).ok()?;
    parse_proc_io(&content)
}

/// Read and parse `/etc/passwd` for UID → username mapping.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_passwd_map() -> HashMap<u32, String> {
    std::fs::read_to_string("/etc/passwd")
        .ok()
        .map(|c| parse_passwd(&c))
        .unwrap_or_default()
}

/// List all numeric PID directories under `/proc/`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn list_pids() -> Vec<u32> {
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return vec![];
    };
    entries
        .filter_map(Result::ok)
        .filter_map(|e| e.file_name().to_str()?.parse::<u32>().ok())
        .collect()
}

/// Run two-phase collection and return sorted `ProcessSnapshot` list.
///
/// This is the main entry point called from `collect_metrics()`.
#[cfg_attr(coverage_nightly, coverage(off))]
#[allow(clippy::too_many_arguments)]
pub fn collect_top_processes(
    prev_states: &mut HashMap<u32, PrevProcStat>,
    total_jiffies_delta: u64,
    elapsed_secs: f64,
    cpu_count: u32,
    mem_total: u64,
    boot_time_secs: u64,
    now_secs: u64,
    passwd_map: &HashMap<u32, String>,
) -> Vec<ProcessSnapshot> {
    let page_size = get_page_size();
    let pids = list_pids();

    // Phase 1: read stat for ALL pids, compute CPU% delta
    let mut phase1: Vec<(ProcStat, Option<f64>)> = Vec::with_capacity(pids.len());

    for pid in &pids {
        let Some(stat) = read_proc_stat(*pid) else {
            continue;
        };

        let curr_ticks = stat.utime + stat.stime;
        let cpu_pct = prev_states.get(pid).and_then(|prev| {
            // PID reuse detection: starttime must match
            if prev.starttime != stat.starttime {
                return None;
            }
            Some(compute_process_cpu_pct(
                prev.cpu_ticks,
                curr_ticks,
                total_jiffies_delta,
                cpu_count,
            ))
        });

        phase1.push((stat, cpu_pct));
    }

    // Sort by CPU% descending (None = 0 for sorting)
    phase1.sort_by(|a, b| {
        let a_cpu = a.1.unwrap_or(0.0);
        let b_cpu = b.1.unwrap_or(0.0);
        b_cpu
            .partial_cmp(&a_cpu)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Build prev_states for ALL scanned PIDs (cpu_ticks baseline only, no IO read).
    // This ensures processes not in top N still accumulate a delta baseline, so they
    // can be ranked correctly if they spike on the next cycle.
    let mut new_prev_states: HashMap<u32, PrevProcStat> = HashMap::with_capacity(phase1.len());
    for (stat, _) in &phase1 {
        new_prev_states.insert(
            stat.pid,
            PrevProcStat {
                cpu_ticks: stat.utime + stat.stime,
                starttime: stat.starttime,
                majflt: stat.majflt,
                read_bytes: 0,
                write_bytes: 0,
            },
        );
    }

    // Take top N for Phase 2 enrichment
    phase1.truncate(TOP_N);

    // Phase 2: enrich top N with cmdline + io
    let mut snapshots = Vec::with_capacity(phase1.len());

    for (stat, _) in &phase1 {
        let cmd = read_cmdline(stat.pid);
        let io = read_proc_io(stat.pid);
        let uid = get_proc_uid(stat.pid).unwrap_or(u32::MAX);

        let prev = prev_states.get(&stat.pid).and_then(|p| {
            if p.starttime == stat.starttime {
                Some(p)
            } else {
                None
            }
        });

        let snapshot = build_snapshot(
            stat,
            &cmd,
            io.as_ref(),
            prev,
            total_jiffies_delta,
            elapsed_secs,
            cpu_count,
            page_size,
            mem_total,
            boot_time_secs,
            now_secs,
            uid,
            passwd_map,
        );

        // Overwrite the cpu-only baseline with full IO data for top N
        new_prev_states.insert(stat.pid, extract_prev_state(stat, io.as_ref()));
        snapshots.push(snapshot);
    }

    *prev_states = new_prev_states;

    snapshots
}

// ── Tests ────────────────────────────────────────────────────────────

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    // Real /proc/[pid]/stat samples from Linux systems
    const STAT_SIMPLE: &str = "1234 (nginx) S 1230 1234 1234 0 -1 4194304 500 0 10 0 1000 500 0 0 20 0 4 0 100 536870912 65536 18446744073709551615 0 0 0 0 0 0 0 0 0 0 0 0 17 2 0 0 0 0 0 0 0 0 0 0 0 0 0";

    // comm with space — the critical edge case
    const STAT_SPACE_IN_COMM: &str = "5678 (Web Content) S 5670 5678 5678 0 -1 4194304 1200 0 20 0 2000 800 0 0 20 0 8 0 200 1073741824 131072 18446744073709551615 0 0 0 0 0 0 0 0 0 0 0 0 17 1 0 0 0 0 0 0 0 0 0 0 0 0 0";

    // comm with parentheses — even trickier
    const STAT_PAREN_IN_COMM: &str = "9999 (kworker/0:1-events) I 2 0 0 0 -1 69238880 0 0 0 0 50 30 0 0 20 0 1 0 300 0 0 18446744073709551615 0 0 0 0 0 0 0 2147483647 0 0 0 0 17 0 0 0 0 0 0 0 0 0 0 0 0 0 0";

    // Minimal valid stat (exactly 37 fields after ')')
    const STAT_MINIMAL: &str = "1 (init) S 0 1 1 0 -1 4194304 0 0 0 0 100 50 0 0 20 0 1 0 1 0 0 18446744073709551615 0 0 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0 0 0 0 0 0 0 0 0";

    #[test]
    fn parse_proc_stat_simple() {
        let stat = parse_proc_stat(STAT_SIMPLE).unwrap();
        assert_eq!(stat.pid, 1234);
        assert_eq!(stat.comm, "nginx");
        assert_eq!(stat.state, 'S');
        assert_eq!(stat.ppid, 1230);
        assert_eq!(stat.utime, 1000);
        assert_eq!(stat.stime, 500);
        assert_eq!(stat.num_threads, 4);
        assert_eq!(stat.starttime, 100);
        assert_eq!(stat.vsize, 536_870_912);
        assert_eq!(stat.rss, 65536);
        assert_eq!(stat.majflt, 10);
        assert_eq!(stat.processor, 2);
    }

    #[test]
    fn parse_proc_stat_space_in_comm() {
        let stat = parse_proc_stat(STAT_SPACE_IN_COMM).unwrap();
        assert_eq!(stat.pid, 5678);
        assert_eq!(stat.comm, "Web Content");
        assert_eq!(stat.state, 'S');
        assert_eq!(stat.ppid, 5670);
        assert_eq!(stat.utime, 2000);
        assert_eq!(stat.stime, 800);
        assert_eq!(stat.num_threads, 8);
    }

    #[test]
    fn parse_proc_stat_paren_in_comm() {
        let stat = parse_proc_stat(STAT_PAREN_IN_COMM).unwrap();
        assert_eq!(stat.pid, 9999);
        assert_eq!(stat.comm, "kworker/0:1-events");
        assert_eq!(stat.state, 'I');
        assert_eq!(stat.ppid, 2);
        assert_eq!(stat.utime, 50);
        assert_eq!(stat.stime, 30);
        assert_eq!(stat.num_threads, 1);
    }

    #[test]
    fn parse_proc_stat_minimal() {
        let stat = parse_proc_stat(STAT_MINIMAL).unwrap();
        assert_eq!(stat.pid, 1);
        assert_eq!(stat.comm, "init");
        assert_eq!(stat.state, 'S');
        assert_eq!(stat.ppid, 0);
    }

    #[test]
    fn parse_proc_stat_empty() {
        assert!(parse_proc_stat("").is_none());
    }

    #[test]
    fn parse_proc_stat_no_parens() {
        assert!(parse_proc_stat("1234 nginx S 0").is_none());
    }

    #[test]
    fn parse_proc_stat_too_few_fields() {
        // Only a handful of fields after ')'
        assert!(parse_proc_stat("1 (x) S 0 1").is_none());
    }

    #[test]
    fn parse_proc_stat_inverted_parens() {
        // ')' before '(' — should return None
        assert!(parse_proc_stat("1 )bad( S 0").is_none());
    }

    #[test]
    fn parse_cmdline_normal() {
        let bytes = b"/usr/sbin/nginx\0-g\0daemon off;\0";
        assert_eq!(parse_cmdline(bytes), "/usr/sbin/nginx -g daemon off;");
    }

    #[test]
    fn parse_cmdline_empty() {
        assert_eq!(parse_cmdline(b""), "");
    }

    #[test]
    fn parse_cmdline_truncation() {
        let long = vec![b'A'; 300];
        let result = parse_cmdline(&long);
        assert_eq!(result.len(), MAX_CMDLINE_BYTES);
    }

    #[test]
    fn parse_cmdline_with_trailing_nul() {
        let bytes = b"python3\0script.py\0";
        assert_eq!(parse_cmdline(bytes), "python3 script.py");
    }

    #[test]
    fn parse_proc_io_normal() {
        let content = "\
rchar: 12345678
wchar: 87654321
syscr: 100
syscw: 200
read_bytes: 4096000
write_bytes: 8192000
cancelled_write_bytes: 0
";
        let io = parse_proc_io(content).unwrap();
        assert_eq!(io.read_bytes, 4_096_000);
        assert_eq!(io.write_bytes, 8_192_000);
    }

    #[test]
    fn parse_proc_io_partial() {
        let content = "read_bytes: 1000\n";
        let io = parse_proc_io(content).unwrap();
        assert_eq!(io.read_bytes, 1000);
        assert_eq!(io.write_bytes, 0);
    }

    #[test]
    fn parse_proc_io_empty() {
        assert!(parse_proc_io("").is_none());
    }

    #[test]
    fn parse_passwd_normal() {
        let content = "\
root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
bat:x:1001:1001:bat user:/home/bat:/bin/bash
";
        let map = parse_passwd(content);
        assert_eq!(map.get(&0), Some(&"root".to_string()));
        assert_eq!(map.get(&33), Some(&"www-data".to_string()));
        assert_eq!(map.get(&1001), Some(&"bat".to_string()));
        assert_eq!(map.get(&9999), None);
    }

    #[test]
    fn parse_passwd_empty() {
        let map = parse_passwd("");
        assert!(map.is_empty());
    }

    #[test]
    fn resolve_username_found() {
        let mut map = HashMap::new();
        map.insert(1001, "bat".to_string());
        assert_eq!(resolve_username(1001, &map), "bat");
    }

    #[test]
    fn resolve_username_fallback() {
        let map = HashMap::new();
        assert_eq!(resolve_username(9999, &map), "uid:9999");
    }

    #[test]
    fn get_page_size_positive() {
        let ps = get_page_size();
        assert!(ps > 0);
        // Must be a power of 2
        assert_eq!(ps & (ps - 1), 0);
    }

    #[test]
    fn compute_cpu_pct_normal() {
        // 100 ticks out of 10000 total, 4 CPUs → 100/10000 * 4 * 100 = 4.0%
        let pct = compute_process_cpu_pct(900, 1000, 10000, 4);
        assert!((pct - 4.0).abs() < 0.001);
    }

    #[test]
    fn compute_cpu_pct_zero_delta() {
        assert_eq!(compute_process_cpu_pct(100, 200, 0, 1), 0.0);
    }

    #[test]
    fn compute_cpu_pct_saturating() {
        // curr < prev (shouldn't happen but be safe)
        let pct = compute_process_cpu_pct(1000, 500, 10000, 1);
        assert_eq!(pct, 0.0);
    }

    #[test]
    fn extract_prev_state_with_io() {
        let stat = parse_proc_stat(STAT_SIMPLE).unwrap();
        let io = ProcIo {
            read_bytes: 100,
            write_bytes: 200,
        };
        let prev = extract_prev_state(&stat, Some(&io));
        assert_eq!(prev.cpu_ticks, stat.utime + stat.stime);
        assert_eq!(prev.starttime, stat.starttime);
        assert_eq!(prev.majflt, stat.majflt);
        assert_eq!(prev.read_bytes, 100);
        assert_eq!(prev.write_bytes, 200);
    }

    #[test]
    fn extract_prev_state_without_io() {
        let stat = parse_proc_stat(STAT_SIMPLE).unwrap();
        let prev = extract_prev_state(&stat, None);
        assert_eq!(prev.read_bytes, 0);
        assert_eq!(prev.write_bytes, 0);
    }

    #[test]
    fn build_snapshot_first_cycle() {
        let stat = parse_proc_stat(STAT_SIMPLE).unwrap();
        let mut passwd_map = HashMap::new();
        passwd_map.insert(33, "www-data".to_string());

        let snap = build_snapshot(
            &stat,
            "nginx: worker process",
            None, // no io
            None, // first cycle, no prev
            10000,
            30.0,
            4,
            4096,
            16_000_000_000, // 16GB
            1_700_000_000,  // boot time
            1_700_001_000,  // now
            33,             // uid
            &passwd_map,
        );

        assert_eq!(snap.pid, 1234);
        assert_eq!(snap.name, "nginx");
        assert_eq!(snap.cmd, "nginx: worker process");
        assert_eq!(snap.state, "S");
        assert_eq!(snap.ppid, 1230);
        assert_eq!(snap.user, "www-data");
        assert!(snap.cpu_pct.is_none()); // first cycle
        assert!(snap.majflt_rate.is_none()); // first cycle
        assert!(snap.io_read_rate.is_none()); // no io
        assert!(snap.io_write_rate.is_none());
        assert_eq!(snap.num_threads, 4);
        assert_eq!(snap.processor, 2);
        // RSS = 65536 pages * 4096 = 268435456 bytes
        assert_eq!(snap.mem_rss, 65536 * 4096);
    }

    #[test]
    fn build_snapshot_with_prev() {
        let stat = parse_proc_stat(STAT_SIMPLE).unwrap();
        let io = ProcIo {
            read_bytes: 8192,
            write_bytes: 16384,
        };
        let prev = PrevProcStat {
            cpu_ticks: 1400, // stat has utime=1000 + stime=500 = 1500
            starttime: 100,  // matches stat
            majflt: 5,       // stat has 10
            read_bytes: 4096,
            write_bytes: 8192,
        };
        let passwd_map = HashMap::new();

        let snap = build_snapshot(
            &stat,
            "",
            Some(&io),
            Some(&prev),
            10000,
            30.0,
            2,
            4096,
            16_000_000_000,
            1_700_000_000,
            1_700_001_000,
            9999,
            &passwd_map,
        );

        // CPU%: (1500-1400)/10000 * 2 * 100 = 2.0
        assert!((snap.cpu_pct.unwrap() - 2.0).abs() < 0.001);
        // majflt_rate: (10-5)/30 = 0.1667
        assert!((snap.majflt_rate.unwrap() - 0.1667).abs() < 0.001);
        // io_read_rate: (8192-4096)/30 = 136.53
        assert!((snap.io_read_rate.unwrap() - 136.533).abs() < 0.1);
        // io_write_rate: (16384-8192)/30 = 273.07
        assert!((snap.io_write_rate.unwrap() - 273.067).abs() < 0.1);
        // cmd falls back to comm since empty cmdline
        assert_eq!(snap.cmd, "nginx");
        // uid not in map → fallback
        assert_eq!(snap.user, "uid:9999");
    }

    #[test]
    fn build_snapshot_zombie_no_cmdline() {
        let stat = parse_proc_stat(STAT_SIMPLE).unwrap();
        let passwd_map = HashMap::new();

        let snap = build_snapshot(
            &stat,
            "", // empty cmdline (zombie)
            None,
            None,
            10000,
            30.0,
            1,
            4096,
            16_000_000_000,
            1_700_000_000,
            1_700_001_000,
            0,
            &passwd_map,
        );

        // Should fall back to comm
        assert_eq!(snap.cmd, "nginx");
    }

    #[test]
    fn build_snapshot_mem_pct_calculation() {
        let stat = parse_proc_stat(STAT_SIMPLE).unwrap();
        let passwd_map = HashMap::new();

        let snap = build_snapshot(
            &stat,
            "nginx",
            None,
            None,
            10000,
            30.0,
            1,
            4096,
            1_073_741_824, // 1GB total mem
            1_700_000_000,
            1_700_001_000,
            0,
            &passwd_map,
        );

        // RSS = 65536 * 4096 = 268435456 bytes
        // mem_pct = 268435456 / 1073741824 * 100 = 25.0
        assert!((snap.mem_pct - 25.0).abs() < 0.001);
    }

    #[test]
    fn build_snapshot_zero_mem_total() {
        let stat = parse_proc_stat(STAT_SIMPLE).unwrap();
        let passwd_map = HashMap::new();

        let snap = build_snapshot(
            &stat,
            "test",
            None,
            None,
            10000,
            30.0,
            1,
            4096,
            0, // zero mem_total
            1_700_000_000,
            1_700_001_000,
            0,
            &passwd_map,
        );

        assert_eq!(snap.mem_pct, 0.0);
    }

    #[test]
    fn build_snapshot_negative_rss() {
        // Some kernel versions can report negative rss
        let content = "1 (test) S 0 1 1 0 -1 4194304 0 0 0 0 100 50 0 0 20 0 1 0 1 0 -100 18446744073709551615 0 0 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0 0 0 0 0 0 0 0 0";
        let stat = parse_proc_stat(content).unwrap();
        let passwd_map = HashMap::new();

        let snap = build_snapshot(
            &stat,
            "",
            None,
            None,
            10000,
            30.0,
            1,
            4096,
            16_000_000_000,
            1_700_000_000,
            1_700_001_000,
            0,
            &passwd_map,
        );

        assert_eq!(snap.mem_rss, 0);
        assert_eq!(snap.mem_pct, 0.0);
    }

    #[test]
    fn build_snapshot_zero_elapsed() {
        let stat = parse_proc_stat(STAT_SIMPLE).unwrap();
        let prev = PrevProcStat {
            cpu_ticks: 1400,
            starttime: 100,
            majflt: 5,
            read_bytes: 0,
            write_bytes: 0,
        };
        let passwd_map = HashMap::new();

        let snap = build_snapshot(
            &stat,
            "",
            None,
            Some(&prev),
            10000,
            0.0, // zero elapsed
            1,
            4096,
            16_000_000_000,
            1_700_000_000,
            1_700_001_000,
            0,
            &passwd_map,
        );

        assert!(snap.majflt_rate.is_none()); // can't compute rate with zero elapsed
    }
}
