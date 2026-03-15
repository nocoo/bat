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
/// Extracts MemTotal, MemAvailable, SwapTotal, SwapFree.
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

/// Read and parse `/proc/meminfo`.
pub fn read_meminfo() -> Result<MemInfo, String> {
    let content = std::fs::read_to_string("/proc/meminfo")
        .map_err(|e| format!("read /proc/meminfo: {e}"))?;
    parse_meminfo(&content).ok_or_else(|| "failed to parse /proc/meminfo".to_string())
}

#[cfg(test)]
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

        assert_eq!(info.mem_total, 1946360 * 1024);
        assert_eq!(info.mem_available, 562176 * 1024);

        // used_pct = (1946360 - 562176) / 1946360 * 100 = 71.11...
        assert!((info.mem_used_pct - 71.11).abs() < 0.01);

        assert_eq!(info.swap_total, 1638380 * 1024);
        assert_eq!(info.swap_free, 1606640 * 1024);
        assert_eq!(info.swap_used, (1638380 - 1606640) * 1024);

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
}
