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
}

/// Parse `/proc/meminfo` content.
///
/// Extracts `MemTotal`, `MemAvailable`, `SwapTotal`, `SwapFree`.
/// Values in `/proc/meminfo` are in kB — multiply by 1024 for bytes.
pub fn parse_meminfo(content: &str) -> Option<MemInfo> {
    let mut mem_total: Option<u64> = None;
    let mut mem_available: Option<u64> = None;
    let mut swap_total: Option<u64> = None;
    let mut swap_free: Option<u64> = None;

    for line in content.lines() {
        if let Some(val) = parse_meminfo_line(line, "MemTotal:") {
            mem_total = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "MemAvailable:") {
            mem_available = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "SwapTotal:") {
            swap_total = Some(val);
        } else if let Some(val) = parse_meminfo_line(line, "SwapFree:") {
            swap_free = Some(val);
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

/// Parse the `oom_kill` counter from `/proc/vmstat` content.
///
/// Looks for the line `oom_kill <N>` and returns the cumulative count.
/// Returns `None` if the line is not found (pre-4.13 kernels).
pub fn parse_vmstat_oom_kill(content: &str) -> Option<u64> {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("oom_kill ") {
            return rest.trim().parse().ok();
        }
    }
    None
}

/// Read OOM kill counter from a parameterized path (for testing).
pub fn read_oom_kill_from(path: &str) -> Option<u64> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_vmstat_oom_kill(&content)
}

/// Read OOM kill counter from `/proc/vmstat`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_oom_kill() -> Option<u64> {
    read_oom_kill_from("/proc/vmstat")
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
pgpgin 1234567
pgpgout 2345678
oom_kill 3
";

    const PROC_VMSTAT_NO_OOM: &str = "\
nr_free_pages 12345
pgpgin 1234567
pgpgout 2345678
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
}
