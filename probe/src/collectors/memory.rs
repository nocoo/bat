/// Parsed memory values from `/proc/meminfo`, converted to bytes.
#[derive(Debug)]
pub struct MemInfo {
    pub mem_total: u64,
    pub mem_available: u64,
    pub mem_used_pct: f64,
    pub swap_total: u64,
    #[allow(dead_code)]
    pub swap_free: u64,
    pub swap_used: u64,
    pub swap_used_pct: f64,
    // Signal expansion: additional meminfo fields (bytes, None if kernel doesn't expose)
    pub buffers: Option<u64>,
    pub cached: Option<u64>,
    pub dirty: Option<u64>,
    pub writeback: Option<u64>,
    pub shmem: Option<u64>,
    pub slab_reclaimable: Option<u64>,
    pub slab_unreclaim: Option<u64>,
    pub committed_as: Option<u64>,
    pub commit_limit: Option<u64>,
    pub hw_corrupted: Option<u64>,
}

/// Parse `/proc/meminfo` content.
///
/// Extracts `MemTotal`, `MemAvailable`, `SwapTotal`, `SwapFree`, plus
/// extended fields for signal expansion.
/// Values in `/proc/meminfo` are in kB — multiply by 1024 for bytes.
pub fn parse_meminfo(content: &str) -> Option<MemInfo> {
    let mut mem_total: Option<u64> = None;
    let mut mem_available: Option<u64> = None;
    let mut swap_total: Option<u64> = None;
    let mut swap_free: Option<u64> = None;
    let mut buffers: Option<u64> = None;
    let mut cached: Option<u64> = None;
    let mut dirty: Option<u64> = None;
    let mut writeback: Option<u64> = None;
    let mut shmem: Option<u64> = None;
    let mut slab_reclaimable: Option<u64> = None;
    let mut slab_unreclaim: Option<u64> = None;
    let mut committed_as: Option<u64> = None;
    let mut commit_limit: Option<u64> = None;
    let mut hw_corrupted: Option<u64> = None;

    for line in content.lines() {
        if let Some(val) = parse_meminfo_line(line, "MemTotal:") {
            mem_total = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "MemAvailable:") {
            mem_available = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "SwapTotal:") {
            swap_total = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "SwapFree:") {
            swap_free = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "Buffers:") {
            buffers = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "Cached:") {
            cached = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "Dirty:") {
            dirty = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "Writeback:") {
            writeback = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "Shmem:") {
            shmem = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "SReclaimable:") {
            slab_reclaimable = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "SUnreclaim:") {
            slab_unreclaim = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "Committed_AS:") {
            committed_as = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "CommitLimit:") {
            commit_limit = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "HardwareCorrupted:") {
            hw_corrupted = Some(val);
        }
    }

    let mem_total = mem_total? * 1024;
    let mem_available = mem_available? * 1024;
    let swap_total = swap_total? * 1024;
    let swap_free = swap_free? * 1024;

    let mem_used_pct = if mem_total > 0 {
        (mem_total - mem_available) as f64 / mem_total as f64 * 100.0
    } else {
        0.0
    };

    let swap_used = swap_total.saturating_sub(swap_free);
    let swap_used_pct = if swap_total > 0 {
        swap_used as f64 / swap_total as f64 * 100.0
    } else {
        0.0
    };

    Some(MemInfo {
        mem_total,
        mem_available,
        mem_used_pct,
        swap_total,
        swap_free,
        swap_used,
        swap_used_pct,
        buffers: buffers.map(|v| v * 1024),
        cached: cached.map(|v| v * 1024),
        dirty: dirty.map(|v| v * 1024),
        writeback: writeback.map(|v| v * 1024),
        shmem: shmem.map(|v| v * 1024),
        slab_reclaimable: slab_reclaimable.map(|v| v * 1024),
        slab_unreclaim: slab_unreclaim.map(|v| v * 1024),
        committed_as: committed_as.map(|v| v * 1024),
        commit_limit: commit_limit.map(|v| v * 1024),
        hw_corrupted: hw_corrupted.map(|v| v * 1024),
    })
}

/// Parse a single meminfo line like `MemTotal:   1946360 kB` → 1946360.
fn parse_meminfo_line(line: &str, key: &str) -> Option<u64> {
    let rest = line.strip_prefix(key)?;
    rest.split_whitespace().next()?.parse().ok()
}

// ── Live reader (requires Linux /proc) ──────────────────────────────

/// Read and parse meminfo from a file (parameterized path for testing).
pub fn read_meminfo_from(path: &str) -> Result<MemInfo, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    parse_meminfo(&content).ok_or_else(|| format!("failed to parse {path}"))
}

/// Read and parse `/proc/meminfo`.
pub fn read_meminfo() -> Result<MemInfo, String> {
    read_meminfo_from("/proc/meminfo")
}

/// Parsed counters from `/proc/vmstat`.
#[derive(Debug, Clone, Default)]
pub struct VmstatCounters {
    /// `None` on pre-4.13 kernels where the `oom_kill` line is absent.
    pub oom_kill: Option<u64>,
    pub pswpin: u64,
    pub pswpout: u64,
    pub pgmajfault: u64,
    pub pgpgin: u64,
    pub pgpgout: u64,
}

/// Parse the `oom_kill` counter from `/proc/vmstat` content.
///
/// Looks for the line `oom_kill <N>` and returns the cumulative count.
/// Returns `None` if the line is not found (pre-4.13 kernels).
#[cfg(test)]
pub fn parse_vmstat_oom_kill(content: &str) -> Option<u64> {
    parse_vmstat(content).and_then(|v| v.oom_kill)
}

/// Parse multiple counters from `/proc/vmstat` content.
///
/// Returns `Some` if at least one recognized field was found.
/// `oom_kill` is `None` on pre-4.13 kernels where the line is absent;
/// the remaining counters are still populated from the file.
pub fn parse_vmstat(content: &str) -> Option<VmstatCounters> {
    let mut counters = VmstatCounters::default();
    let mut found_any = false;

    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("oom_kill ") {
            counters.oom_kill = Some(rest.trim().parse().unwrap_or(0));
            found_any = true;
        } else if let Some(rest) = line.strip_prefix("pswpin ") {
            counters.pswpin = rest.trim().parse().unwrap_or(0);
            found_any = true;
        } else if let Some(rest) = line.strip_prefix("pswpout ") {
            counters.pswpout = rest.trim().parse().unwrap_or(0);
            found_any = true;
        } else if let Some(rest) = line.strip_prefix("pgmajfault ") {
            counters.pgmajfault = rest.trim().parse().unwrap_or(0);
            found_any = true;
        } else if let Some(rest) = line.strip_prefix("pgpgin ") {
            counters.pgpgin = rest.trim().parse().unwrap_or(0);
            found_any = true;
        } else if let Some(rest) = line.strip_prefix("pgpgout ") {
            counters.pgpgout = rest.trim().parse().unwrap_or(0);
            found_any = true;
        }
    }

    if found_any { Some(counters) } else { None }
}

/// Read OOM kill counter from a parameterized path (for testing).
#[cfg(test)]
pub fn read_oom_kill_from(path: &str) -> Option<u64> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_vmstat_oom_kill(&content)
}

/// Read vmstat counters from a parameterized path (for testing).
pub fn read_vmstat_from(path: &str) -> Option<VmstatCounters> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_vmstat(&content)
}

/// Read vmstat counters from `/proc/vmstat`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_vmstat() -> Option<VmstatCounters> {
    read_vmstat_from("/proc/vmstat")
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    const PROC_MEMINFO: &str = "\
MemTotal:        1946360 kB
MemFree:          123456 kB
MemAvailable:     562176 kB
Buffers:           98304 kB
Cached:           456789 kB
SwapCached:            0 kB
SwapTotal:       1638380 kB
SwapFree:        1606640 kB
Dirty:              1024 kB
Writeback:             0 kB
Shmem:             32768 kB
SReclaimable:      65536 kB
SUnreclaim:        16384 kB
Committed_AS:    1234567 kB
CommitLimit:     2000000 kB
HardwareCorrupted:     0 kB
";

    const PROC_MEMINFO_NO_SWAP: &str = "\
MemTotal:        1946360 kB
MemFree:          123456 kB
MemAvailable:     562176 kB
SwapTotal:             0 kB
SwapFree:              0 kB
";

    #[test]
    fn parse_meminfo_normal() {
        let info = parse_meminfo(PROC_MEMINFO).unwrap();

        assert_eq!(info.mem_total, 1_946_360 * 1024);
        assert_eq!(info.mem_available, 562_176 * 1024);

        // used_pct = (1946360 - 562176) / 1946360 * 100 = 71.11...
        assert!((info.mem_used_pct - 71.11).abs() < 0.01);

        assert_eq!(info.swap_total, 1_638_380 * 1024);
        assert_eq!(info.swap_free, 1_606_640 * 1024);
        assert_eq!(info.swap_used, (1_638_380 - 1_606_640) * 1024);

        // swap_used_pct = (1638380 - 1606640) / 1638380 * 100 = 1.937...
        assert!((info.swap_used_pct - 1.937).abs() < 0.01);

        // Extended fields
        assert_eq!(info.buffers, Some(98_304 * 1024));
        assert_eq!(info.cached, Some(456_789 * 1024));
        assert_eq!(info.dirty, Some(1024 * 1024));
        assert_eq!(info.writeback, Some(0));
        assert_eq!(info.shmem, Some(32_768 * 1024));
        assert_eq!(info.slab_reclaimable, Some(65_536 * 1024));
        assert_eq!(info.slab_unreclaim, Some(16_384 * 1024));
        assert_eq!(info.committed_as, Some(1_234_567 * 1024));
        assert_eq!(info.commit_limit, Some(2_000_000 * 1024));
        assert_eq!(info.hw_corrupted, Some(0));
    }

    #[test]
    fn parse_meminfo_no_swap() {
        let info = parse_meminfo(PROC_MEMINFO_NO_SWAP).unwrap();

        assert_eq!(info.swap_total, 0);
        assert_eq!(info.swap_free, 0);
        assert_eq!(info.swap_used, 0);
        assert_eq!(info.swap_used_pct, 0.0);
    }

    #[test]
    fn parse_meminfo_missing_field() {
        let incomplete = "MemTotal:  1946360 kB\n";
        assert!(parse_meminfo(incomplete).is_none());
    }

    #[test]
    fn parse_meminfo_minimal_no_extended() {
        // Old kernel: only core fields, no extended
        let content = "\
MemTotal:        1000 kB
MemAvailable:     500 kB
SwapTotal:        200 kB
SwapFree:         100 kB
";
        let info = parse_meminfo(content).unwrap();
        assert_eq!(info.mem_total, 1000 * 1024);
        assert_eq!(info.buffers, None);
        assert_eq!(info.cached, None);
        assert_eq!(info.dirty, None);
        assert_eq!(info.writeback, None);
        assert_eq!(info.shmem, None);
        assert_eq!(info.slab_reclaimable, None);
        assert_eq!(info.slab_unreclaim, None);
        assert_eq!(info.committed_as, None);
        assert_eq!(info.commit_limit, None);
        assert_eq!(info.hw_corrupted, None);
    }

    #[test]
    fn parse_meminfo_used_pct_computed_correctly() {
        let content = "\
MemTotal:        1000 kB
MemAvailable:     250 kB
SwapTotal:        500 kB
SwapFree:         500 kB
";
        let info = parse_meminfo(content).unwrap();
        assert!((info.mem_used_pct - 75.0).abs() < f64::EPSILON);
        assert_eq!(info.swap_used, 0);
        assert_eq!(info.swap_used_pct, 0.0);
    }

    #[test]
    fn parse_meminfo_zero_total_no_divide_by_zero() {
        let content = "\
MemTotal:        0 kB
MemAvailable:    0 kB
SwapTotal:       0 kB
SwapFree:        0 kB
";
        let info = parse_meminfo(content).unwrap();
        assert_eq!(info.mem_total, 0);
        assert_eq!(info.mem_used_pct, 0.0);
        assert_eq!(info.swap_used_pct, 0.0);
    }

    #[test]
    fn parse_meminfo_fields_out_of_order() {
        let content = "\
SwapFree:        200 kB
MemAvailable:    500 kB
SwapTotal:       1000 kB
MemTotal:        2000 kB
";
        let info = parse_meminfo(content).unwrap();
        assert_eq!(info.mem_total, 2000 * 1024);
        assert_eq!(info.mem_available, 500 * 1024);
        assert_eq!(info.swap_total, 1000 * 1024);
        assert_eq!(info.swap_free, 200 * 1024);
    }

    #[test]
    fn parse_meminfo_malformed_line_ignored() {
        // Malformed line mixed in; required fields still present
        let content = "\
MemTotal:        1000 kB
MemAvailable:    500 kB
Malformed line without colon
SwapTotal:       0 kB
SwapFree:        0 kB
";
        let info = parse_meminfo(content).unwrap();
        assert_eq!(info.mem_total, 1000 * 1024);
    }

    #[test]
    fn read_meminfo_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("meminfo");
        std::fs::write(&path, PROC_MEMINFO).unwrap();
        let info = read_meminfo_from(path.to_str().unwrap()).unwrap();
        assert_eq!(info.mem_total, 1_946_360 * 1024);
        assert_eq!(info.mem_available, 562_176 * 1024);
    }

    #[test]
    fn read_meminfo_from_missing_file() {
        let result = read_meminfo_from("/nonexistent/path/meminfo");
        assert!(result.is_err());
    }

    const PROC_VMSTAT: &str = "\
nr_free_pages 12345
nr_zone_inactive_anon 678
pswpin 500
pswpout 800
pgpgin 1234567
pgpgout 2345678
pgmajfault 42
oom_kill 3
";

    const PROC_VMSTAT_NO_OOM: &str = "\
nr_free_pages 12345
pswpin 100
pswpout 200
pgpgin 1234567
pgpgout 2345678
pgmajfault 10
";

    #[test]
    fn parse_vmstat_oom_kill_normal() {
        assert_eq!(parse_vmstat_oom_kill(PROC_VMSTAT), Some(3));
    }

    #[test]
    fn parse_vmstat_oom_kill_zero() {
        let content = "oom_kill 0\n";
        assert_eq!(parse_vmstat_oom_kill(content), Some(0));
    }

    #[test]
    fn parse_vmstat_oom_kill_missing() {
        assert!(parse_vmstat_oom_kill(PROC_VMSTAT_NO_OOM).is_none());
    }

    #[test]
    fn parse_vmstat_oom_kill_empty() {
        assert!(parse_vmstat_oom_kill("").is_none());
    }

    #[test]
    fn parse_vmstat_full_counters() {
        let counters = parse_vmstat(PROC_VMSTAT).unwrap();
        assert_eq!(counters.oom_kill, Some(3));
        assert_eq!(counters.pswpin, 500);
        assert_eq!(counters.pswpout, 800);
        assert_eq!(counters.pgpgin, 1_234_567);
        assert_eq!(counters.pgpgout, 2_345_678);
        assert_eq!(counters.pgmajfault, 42);
    }

    #[test]
    fn parse_vmstat_no_oom_still_returns_counters() {
        // Pre-4.13 kernel: no oom_kill line, but other counters are present
        let counters = parse_vmstat(PROC_VMSTAT_NO_OOM).unwrap();
        assert_eq!(counters.oom_kill, None);
        assert_eq!(counters.pswpin, 100);
        assert_eq!(counters.pswpout, 200);
        assert_eq!(counters.pgpgin, 1_234_567);
        assert_eq!(counters.pgpgout, 2_345_678);
        assert_eq!(counters.pgmajfault, 10);
    }

    #[test]
    fn parse_vmstat_empty_returns_none() {
        assert!(parse_vmstat("").is_none());
    }

    #[test]
    fn parse_vmstat_partial_fields() {
        // Only oom_kill present, other fields stay at 0
        let content = "oom_kill 7\npswpin 100\n";
        let counters = parse_vmstat(content).unwrap();
        assert_eq!(counters.oom_kill, Some(7));
        assert_eq!(counters.pswpin, 100);
        assert_eq!(counters.pswpout, 0);
        assert_eq!(counters.pgmajfault, 0);
    }

    #[test]
    fn read_oom_kill_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vmstat");
        std::fs::write(&path, PROC_VMSTAT).unwrap();
        assert_eq!(read_oom_kill_from(path.to_str().unwrap()), Some(3));
    }

    #[test]
    fn read_oom_kill_from_missing_file() {
        assert!(read_oom_kill_from("/nonexistent/vmstat").is_none());
    }

    #[test]
    fn read_vmstat_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("vmstat");
        std::fs::write(&path, PROC_VMSTAT).unwrap();
        let counters = read_vmstat_from(path.to_str().unwrap()).unwrap();
        assert_eq!(counters.oom_kill, Some(3));
        assert_eq!(counters.pswpin, 500);
    }

    #[test]
    fn read_vmstat_from_missing_file() {
        assert!(read_vmstat_from("/nonexistent/vmstat").is_none());
    }
}
