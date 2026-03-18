//! Disk I/O collector from `/proc/diskstats`.
//!
//! Reads per-device I/O counters and computes IOPS, throughput, and utilization
//! as deltas from the previous sample.

/// Raw counters from a single `/proc/diskstats` line.
#[derive(Debug, Clone, Default)]
#[allow(dead_code)] // Signal expansion fields used in later commits
pub struct DiskIoCounters {
    pub device: String,
    pub reads_completed: u64,
    pub sectors_read: u64,
    pub writes_completed: u64,
    pub sectors_written: u64,
    pub io_ms: u64, // weighted time spent doing I/O (ms)
    // Signal expansion: latency and queue depth
    pub read_ms: u64,        // time spent reading (ms), field 6 in diskstats
    pub write_ms: u64,       // time spent writing (ms), field 10 in diskstats
    pub io_in_progress: u64, // I/Os currently in flight, field 11 in diskstats
}

/// Parse `/proc/diskstats` content into per-device counters.
///
/// Filters out:
/// - Partitions (name ends with digit and has a parent device without trailing digit)
/// - Loop devices (`loop*`)
/// - RAM devices (`ram*`)
/// - Device mapper devices (`dm-*`) unless they have non-zero I/O
///
/// Format (fields are 1-indexed in kernel docs, but 0-indexed here after split):
/// ```text
///  8   0 sda 8261 2726 977710 3044 142388 55672 2598810 70786 0 11380 80985 ...
/// ```
/// Fields after device name (0-indexed):
/// - 0: reads completed
/// - 2: sectors read (× 512 = bytes)
/// - 4: writes completed
/// - 6: sectors written (× 512 = bytes)
/// - 9: `io_ms` (time spent doing I/O in ms, for utilization %)
pub fn parse_diskstats(content: &str) -> Vec<DiskIoCounters> {
    let mut devices = Vec::new();

    for line in content.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        // Need at least 14 fields: major minor name + 11 stat fields
        if fields.len() < 14 {
            continue;
        }

        let device_name = fields[2];

        // Skip loop, ram devices
        if device_name.starts_with("loop") || device_name.starts_with("ram") {
            continue;
        }

        // Skip partitions: name ends with digit AND a parent device exists
        // (e.g., sda1 is a partition of sda; nvme0n1p1 is a partition of nvme0n1)
        if is_partition(device_name) {
            continue;
        }

        let reads_completed: u64 = fields[3].parse().unwrap_or(0);
        let sectors_read: u64 = fields[5].parse().unwrap_or(0);
        let read_ms: u64 = fields[6].parse().unwrap_or(0);
        let writes_completed: u64 = fields[7].parse().unwrap_or(0);
        let sectors_written: u64 = fields[9].parse().unwrap_or(0);
        let write_ms: u64 = fields[10].parse().unwrap_or(0);
        let io_in_progress: u64 = fields[11].parse().unwrap_or(0);
        let io_ms: u64 = fields[12].parse().unwrap_or(0);

        // Skip dm-* devices with zero I/O
        if device_name.starts_with("dm-") && reads_completed == 0 && writes_completed == 0 {
            continue;
        }

        devices.push(DiskIoCounters {
            device: device_name.to_string(),
            reads_completed,
            sectors_read,
            writes_completed,
            sectors_written,
            io_ms,
            read_ms,
            write_ms,
            io_in_progress,
        });
    }

    devices
}

/// Check if a device name looks like a partition.
///
/// Heuristic: name ends with a digit AND either:
/// - Matches `sdXN` pattern (e.g., sda1, sdb2)
/// - Matches `nvmeXnYpZ` pattern (contains 'p' followed by digits at the end)
/// - Matches `vdXN` pattern (e.g., vda1)
/// - Matches `xvdXN` pattern (e.g., xvda1)
fn is_partition(name: &str) -> bool {
    // Must end with a digit to be a partition candidate
    if !name.ends_with(|c: char| c.is_ascii_digit()) {
        return false;
    }

    // NVMe: nvme0n1p1 → partition indicator is 'p' before trailing digits
    if name.starts_with("nvme") {
        // Find last 'p' — if digits follow it, it's a partition
        if let Some(p_pos) = name.rfind('p') {
            let after_p = &name[p_pos + 1..];
            return !after_p.is_empty() && after_p.chars().all(|c| c.is_ascii_digit());
        }
        return false;
    }

    // sd/vd/xvd: sda1, vda1, xvda1 → whole device is letters, partition adds digits
    if name.starts_with("sd") || name.starts_with("vd") || name.starts_with("xvd") {
        // Strip trailing digits; if letters remain and match a known prefix, it's a partition
        let base = name.trim_end_matches(|c: char| c.is_ascii_digit());
        return base.len() < name.len() && base.len() >= 3;
    }

    false
}

/// Read diskstats from a parameterized path (for testing).
pub fn read_diskstats_from(path: &str) -> Result<Vec<DiskIoCounters>, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    Ok(parse_diskstats(&content))
}

/// Read diskstats from `/proc/diskstats`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_diskstats() -> Result<Vec<DiskIoCounters>, String> {
    read_diskstats_from("/proc/diskstats")
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    const PROC_DISKSTATS: &str = "\
   8       0 sda 8261 2726 977710 3044 142388 55672 2598810 70786 0 11380 80985 0 0 0 0 0 0
   8       1 sda1 8200 2700 977000 3000 142000 55600 2598000 70000 0 11000 80000 0 0 0 0 0 0
 259       0 nvme0n1 1000 500 200000 1500 50000 10000 800000 30000 0 5000 35000 0 0 0 0 0 0
 259       1 nvme0n1p1 900 400 180000 1200 49000 9000 780000 29000 0 4500 33000 0 0 0 0 0 0
 259       2 nvme0n1p2 100 100 20000 300 1000 1000 20000 1000 0 500 2000 0 0 0 0 0 0
   7       0 loop0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
 253       0 dm-0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
 253       1 dm-1 100 0 2000 50 200 0 4000 100 0 100 150 0 0 0 0 0 0
 252       0 vda 5000 1000 400000 2000 30000 8000 600000 20000 0 4000 25000 0 0 0 0 0 0
 252       1 vda1 4900 900 390000 1800 29000 7500 590000 19000 0 3800 24000 0 0 0 0 0 0
";

    #[test]
    fn parse_diskstats_filters_partitions_and_loops() {
        let devices = parse_diskstats(PROC_DISKSTATS);
        let names: Vec<&str> = devices.iter().map(|d| d.device.as_str()).collect();

        // Should include whole devices only
        assert!(names.contains(&"sda"), "sda should be included");
        assert!(names.contains(&"nvme0n1"), "nvme0n1 should be included");
        assert!(names.contains(&"vda"), "vda should be included");
        assert!(names.contains(&"dm-1"), "dm-1 with I/O should be included");

        // Should exclude partitions, loops, zero-I/O dm
        assert!(
            !names.contains(&"sda1"),
            "sda1 partition should be excluded"
        );
        assert!(
            !names.contains(&"nvme0n1p1"),
            "nvme0n1p1 partition should be excluded"
        );
        assert!(
            !names.contains(&"nvme0n1p2"),
            "nvme0n1p2 partition should be excluded"
        );
        assert!(!names.contains(&"loop0"), "loop0 should be excluded");
        assert!(
            !names.contains(&"dm-0"),
            "dm-0 with zero I/O should be excluded"
        );
        assert!(
            !names.contains(&"vda1"),
            "vda1 partition should be excluded"
        );
    }

    #[test]
    fn parse_diskstats_correct_values() {
        let devices = parse_diskstats(PROC_DISKSTATS);
        let sda = devices.iter().find(|d| d.device == "sda").unwrap();

        assert_eq!(sda.reads_completed, 8261);
        assert_eq!(sda.sectors_read, 977710);
        assert_eq!(sda.writes_completed, 142388);
        assert_eq!(sda.sectors_written, 2_598_810);
        assert_eq!(sda.io_ms, 11380);
        // Signal expansion fields
        assert_eq!(sda.read_ms, 3044);
        assert_eq!(sda.write_ms, 70786);
        assert_eq!(sda.io_in_progress, 0);
    }

    #[test]
    fn parse_diskstats_empty() {
        let devices = parse_diskstats("");
        assert!(devices.is_empty());
    }

    #[test]
    fn parse_diskstats_short_line() {
        let devices = parse_diskstats("   8   0 sda 100 200\n");
        assert!(devices.is_empty());
    }

    #[test]
    fn is_partition_sda() {
        assert!(!is_partition("sda"));
        assert!(is_partition("sda1"));
        assert!(is_partition("sda12"));
    }

    #[test]
    fn is_partition_nvme() {
        assert!(!is_partition("nvme0n1"));
        assert!(is_partition("nvme0n1p1"));
        assert!(is_partition("nvme0n1p12"));
    }

    #[test]
    fn is_partition_vd() {
        assert!(!is_partition("vda"));
        assert!(is_partition("vda1"));
    }

    #[test]
    fn is_partition_xvd() {
        assert!(!is_partition("xvda"));
        assert!(is_partition("xvda1"));
    }

    #[test]
    fn is_partition_dm() {
        // dm-0, dm-1 are NOT partitions (they're device mapper devices)
        assert!(!is_partition("dm-0"));
        assert!(!is_partition("dm-1"));
    }

    #[test]
    fn read_diskstats_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("diskstats");
        std::fs::write(&path, PROC_DISKSTATS).unwrap();

        let devices = read_diskstats_from(path.to_str().unwrap()).unwrap();
        assert!(!devices.is_empty());
        assert!(devices.iter().any(|d| d.device == "sda"));
    }

    #[test]
    fn read_diskstats_from_missing_file() {
        let result = read_diskstats_from("/nonexistent/diskstats");
        assert!(result.is_err());
    }

    #[test]
    fn dm_with_io_included() {
        let content = "253  1 dm-1 100 0 2000 50 200 0 4000 100 0 100 150 0 0 0 0 0 0\n";
        let devices = parse_diskstats(content);
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].device, "dm-1");
    }

    #[test]
    fn dm_without_io_excluded() {
        let content = "253  0 dm-0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n";
        let devices = parse_diskstats(content);
        assert!(devices.is_empty());
    }
}
