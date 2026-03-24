//! Softnet statistics from `/proc/net/softnet_stat`.
//!
//! Each line is one CPU, with hex columns:
//! column 0 = processed, column 1 = dropped, column 2 = `time_squeeze`.
//! We sum across all CPUs for system-wide totals.

/// System-wide softnet counters (summed across all CPUs).
#[derive(Debug, Clone, Default)]
pub struct SoftnetCounters {
    pub processed: u64,
    pub dropped: u64,
    pub time_squeeze: u64,
}

/// Parse `/proc/net/softnet_stat` content.
///
/// Each line has at least 3 hex fields: `processed dropped time_squeeze ...`
/// Sum across all CPU lines for system-wide totals.
pub fn parse_softnet_stat(content: &str) -> Option<SoftnetCounters> {
    let mut counters = SoftnetCounters::default();
    let mut found = false;

    for line in content.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 3 {
            continue;
        }

        let processed = u64::from_str_radix(fields[0], 16).ok();
        let dropped = u64::from_str_radix(fields[1], 16).ok();
        let time_squeeze = u64::from_str_radix(fields[2], 16).ok();

        if let (Some(p), Some(d), Some(t)) = (processed, dropped, time_squeeze) {
            counters.processed += p;
            counters.dropped += d;
            counters.time_squeeze += t;
            found = true;
        }
    }

    if found { Some(counters) } else { None }
}

/// Read softnet stats from a parameterized path (for testing).
pub fn read_softnet_stat_from(path: &str) -> Option<SoftnetCounters> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_softnet_stat(&content)
}

/// Read softnet stats from `/proc/net/softnet_stat`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_softnet_stat() -> Option<SoftnetCounters> {
    read_softnet_stat_from("/proc/net/softnet_stat")
}

#[cfg(test)]
mod tests {
    use super::*;

    // 4-CPU system, hex format
    const PROC_SOFTNET_STAT: &str = "\
00000100 00000002 00000005 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000
00000200 00000000 00000003 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000
00000050 00000001 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000
000000a0 00000000 00000002 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000
";

    #[test]
    fn parse_softnet_stat_multi_cpu() {
        let counters = parse_softnet_stat(PROC_SOFTNET_STAT).unwrap();
        // 0x100 + 0x200 + 0x50 + 0xa0 = 256 + 512 + 80 + 160 = 1008
        assert_eq!(counters.processed, 1008);
        // 0x2 + 0x0 + 0x1 + 0x0 = 3
        assert_eq!(counters.dropped, 3);
        // 0x5 + 0x3 + 0x0 + 0x2 = 10
        assert_eq!(counters.time_squeeze, 10);
    }

    #[test]
    fn parse_softnet_stat_single_cpu() {
        let content = "000003e8 0000000a 00000014 00000000 00000000 00000000 00000000 00000000 00000000 00000000 00000000\n";
        let counters = parse_softnet_stat(content).unwrap();
        assert_eq!(counters.processed, 0x3e8); // 1000
        assert_eq!(counters.dropped, 10);
        assert_eq!(counters.time_squeeze, 20);
    }

    #[test]
    fn parse_softnet_stat_empty() {
        assert!(parse_softnet_stat("").is_none());
    }

    #[test]
    fn parse_softnet_stat_malformed_hex() {
        let content = "gggggggg 00000000 00000000\n";
        assert!(parse_softnet_stat(content).is_none());
    }

    #[test]
    fn parse_softnet_stat_short_line_skipped() {
        // Line with fewer than 3 fields
        let content = "00000100 00000002\n00000200 00000000 00000003\n";
        let counters = parse_softnet_stat(content).unwrap();
        // Only second line counted
        assert_eq!(counters.processed, 0x200);
        assert_eq!(counters.dropped, 0);
        assert_eq!(counters.time_squeeze, 3);
    }

    #[test]
    fn read_softnet_stat_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("softnet_stat");
        std::fs::write(&path, PROC_SOFTNET_STAT).unwrap();
        let counters = read_softnet_stat_from(path.to_str().unwrap()).unwrap();
        assert_eq!(counters.processed, 1008);
    }

    #[test]
    fn read_softnet_stat_from_missing_file() {
        assert!(read_softnet_stat_from("/nonexistent/softnet_stat").is_none());
    }
}
