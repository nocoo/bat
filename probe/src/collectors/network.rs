use std::collections::HashMap;
use std::time::Duration;

/// Raw counters read from `/sys/class/net/{iface}/statistics/`.
#[derive(Debug, Clone, Default)]
pub struct NetCounters {
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub rx_errors: u64,
    pub tx_errors: u64,
    // Signal expansion: packet and dropped counters
    pub rx_packets: u64,
    pub tx_packets: u64,
    pub rx_dropped: u64,
    pub tx_dropped: u64,
}

/// Computed network metrics for a single interface.
#[derive(Debug)]
#[allow(dead_code)] // Signal expansion fields used in later commits
pub struct NetInfo {
    pub iface: String,
    pub rx_bytes_rate: f64,
    pub tx_bytes_rate: f64,
    pub rx_errors: u64,
    pub tx_errors: u64,
    // Signal expansion
    pub rx_packets_rate: f64,
    pub tx_packets_rate: f64,
    pub rx_dropped_delta: u64,
    pub tx_dropped_delta: u64,
}

/// List network interfaces from `/sys/class/net/`, excluding configured ones.
///
/// In production, reads the directory listing. For tests, use `filter_interfaces`.
pub fn list_interfaces(sysfs_path: &str, exclude: &[String]) -> std::io::Result<Vec<String>> {
    let mut interfaces = Vec::new();
    for entry in std::fs::read_dir(sysfs_path)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !exclude.iter().any(|e| e == &name) {
            interfaces.push(name);
        }
    }
    interfaces.sort();
    Ok(interfaces)
}

/// Read raw counters for a single interface from sysfs.
pub fn read_counters(sysfs_path: &str, iface: &str) -> std::io::Result<NetCounters> {
    let base = format!("{sysfs_path}/{iface}/statistics");
    Ok(NetCounters {
        rx_bytes: read_sysfs_u64(&format!("{base}/rx_bytes"))?,
        tx_bytes: read_sysfs_u64(&format!("{base}/tx_bytes"))?,
        rx_errors: read_sysfs_u64(&format!("{base}/rx_errors"))?,
        tx_errors: read_sysfs_u64(&format!("{base}/tx_errors"))?,
        rx_packets: read_sysfs_u64(&format!("{base}/rx_packets")).unwrap_or(0),
        tx_packets: read_sysfs_u64(&format!("{base}/tx_packets")).unwrap_or(0),
        rx_dropped: read_sysfs_u64(&format!("{base}/rx_dropped")).unwrap_or(0),
        tx_dropped: read_sysfs_u64(&format!("{base}/tx_dropped")).unwrap_or(0),
    })
}

/// Read a single u64 value from a sysfs file.
fn read_sysfs_u64(path: &str) -> std::io::Result<u64> {
    let content = std::fs::read_to_string(path)?;
    content
        .trim()
        .parse()
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
}

/// Compute network metrics from previous and current counter snapshots.
pub fn compute_net_metrics(
    prev: &HashMap<String, NetCounters>,
    curr: &HashMap<String, NetCounters>,
    elapsed: Duration,
) -> Vec<NetInfo> {
    use crate::rate::{compute_delta, compute_rate};

    let mut results = Vec::new();
    for (iface, curr_counters) in curr {
        if let Some(prev_counters) = prev.get(iface) {
            results.push(NetInfo {
                iface: iface.clone(),
                rx_bytes_rate: compute_rate(
                    prev_counters.rx_bytes,
                    curr_counters.rx_bytes,
                    elapsed,
                ),
                tx_bytes_rate: compute_rate(
                    prev_counters.tx_bytes,
                    curr_counters.tx_bytes,
                    elapsed,
                ),
                rx_errors: compute_delta(prev_counters.rx_errors, curr_counters.rx_errors),
                tx_errors: compute_delta(prev_counters.tx_errors, curr_counters.tx_errors),
                rx_packets_rate: compute_rate(
                    prev_counters.rx_packets,
                    curr_counters.rx_packets,
                    elapsed,
                ),
                tx_packets_rate: compute_rate(
                    prev_counters.tx_packets,
                    curr_counters.tx_packets,
                    elapsed,
                ),
                rx_dropped_delta: compute_delta(prev_counters.rx_dropped, curr_counters.rx_dropped),
                tx_dropped_delta: compute_delta(prev_counters.tx_dropped, curr_counters.tx_dropped),
            });
        }
    }
    results.sort_by(|a, b| a.iface.cmp(&b.iface));
    results
}

/// Filter interface names, excluding configured ones.
#[cfg(test)]
pub fn filter_interfaces(interfaces: &[&str], exclude: &[String]) -> Vec<String> {
    interfaces
        .iter()
        .filter(|iface| !exclude.iter().any(|e| e == *iface))
        .map(std::string::ToString::to_string)
        .collect()
}

// ── Live reader (requires Linux /sys) ───────────────────────────────

const SYSFS_NET: &str = "/sys/class/net";

/// Read counters for all non-excluded interfaces from a sysfs path (parameterized for testing).
pub fn read_all_counters_from(
    sysfs_path: &str,
    exclude: &[String],
) -> Result<HashMap<String, NetCounters>, String> {
    let interfaces =
        list_interfaces(sysfs_path, exclude).map_err(|e| format!("list interfaces: {e}"))?;
    let mut map = HashMap::new();
    for iface in &interfaces {
        match read_counters(sysfs_path, iface) {
            Ok(c) => {
                map.insert(iface.clone(), c);
            }
            Err(e) => {
                tracing::warn!(iface, error = %e, "skipping interface");
            }
        }
    }
    Ok(map)
}

/// Read counters for all non-excluded interfaces from sysfs.
pub fn read_all_counters(exclude: &[String]) -> Result<HashMap<String, NetCounters>, String> {
    read_all_counters_from(SYSFS_NET, exclude)
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    #[test]
    fn filter_excludes_configured() {
        let ifaces = vec!["eth0", "lo", "docker0", "enp0s3"];
        let exclude = vec!["lo".to_string(), "docker0".to_string()];
        let filtered = filter_interfaces(&ifaces, &exclude);

        assert_eq!(filtered, vec!["eth0", "enp0s3"]);
    }

    #[test]
    fn filter_no_excludes() {
        let ifaces = vec!["eth0", "lo"];
        let filtered = filter_interfaces(&ifaces, &[]);
        assert_eq!(filtered, vec!["eth0", "lo"]);
    }

    #[test]
    fn filter_all_excluded() {
        let ifaces = vec!["lo"];
        let exclude = vec!["lo".to_string()];
        let filtered = filter_interfaces(&ifaces, &exclude);
        assert!(filtered.is_empty());
    }

    #[test]
    fn compute_metrics_normal() {
        let mut prev = HashMap::new();
        prev.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 1000,
                tx_bytes: 2000,
                rx_errors: 5,
                tx_errors: 3,
                ..Default::default()
            },
        );

        let mut curr = HashMap::new();
        curr.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 4000,
                tx_bytes: 5000,
                rx_errors: 7,
                tx_errors: 3,
                ..Default::default()
            },
        );

        let metrics = compute_net_metrics(&prev, &curr, Duration::from_secs(30));
        assert_eq!(metrics.len(), 1);
        assert_eq!(metrics[0].iface, "eth0");
        assert!((metrics[0].rx_bytes_rate - 100.0).abs() < f64::EPSILON); // 3000/30
        assert!((metrics[0].tx_bytes_rate - 100.0).abs() < f64::EPSILON); // 3000/30
        assert_eq!(metrics[0].rx_errors, 2);
        assert_eq!(metrics[0].tx_errors, 0);
    }

    #[test]
    fn compute_metrics_new_interface_ignored() {
        // Interface exists in curr but not prev → should be skipped (no baseline)
        let prev = HashMap::new();
        let mut curr = HashMap::new();
        curr.insert("eth0".to_string(), NetCounters::default());

        let metrics = compute_net_metrics(&prev, &curr, Duration::from_secs(30));
        assert!(metrics.is_empty());
    }

    #[test]
    fn compute_metrics_multiple_interfaces() {
        let mut prev = HashMap::new();
        prev.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 100,
                tx_bytes: 200,
                ..Default::default()
            },
        );
        prev.insert(
            "wlan0".to_string(),
            NetCounters {
                rx_bytes: 50,
                tx_bytes: 100,
                ..Default::default()
            },
        );

        let mut curr = HashMap::new();
        curr.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 400,
                tx_bytes: 500,
                ..Default::default()
            },
        );
        curr.insert(
            "wlan0".to_string(),
            NetCounters {
                rx_bytes: 350,
                tx_bytes: 400,
                ..Default::default()
            },
        );

        let metrics = compute_net_metrics(&prev, &curr, Duration::from_secs(30));
        assert_eq!(metrics.len(), 2);
        // Sorted by iface name
        assert_eq!(metrics[0].iface, "eth0");
        assert_eq!(metrics[1].iface, "wlan0");
    }

    #[test]
    fn compute_metrics_with_counter_wrap() {
        let mut prev = HashMap::new();
        prev.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: u64::MAX - 499,
                tx_bytes: 0,
                rx_errors: u64::MAX - 1,
                tx_errors: 0,
                ..Default::default()
            },
        );

        let mut curr = HashMap::new();
        curr.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 500,
                tx_bytes: 3000,
                rx_errors: 2,
                tx_errors: 0,
                ..Default::default()
            },
        );

        let metrics = compute_net_metrics(&prev, &curr, Duration::from_secs(10));
        assert_eq!(metrics.len(), 1);
        // rx_bytes delta = 500 + (u64::MAX - (u64::MAX - 500)) = 1000
        assert!((metrics[0].rx_bytes_rate - 100.0).abs() < f64::EPSILON);
        // rx_errors delta = 2 + (u64::MAX - (u64::MAX - 2)) = 4
        assert_eq!(metrics[0].rx_errors, 4);
    }

    #[test]
    fn list_interfaces_with_tempdir() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("eth0")).unwrap();
        std::fs::create_dir(dir.path().join("lo")).unwrap();
        std::fs::create_dir(dir.path().join("wlan0")).unwrap();

        let exclude = vec!["lo".to_string()];
        let ifaces = list_interfaces(dir.path().to_str().unwrap(), &exclude).unwrap();
        assert!(ifaces.contains(&"eth0".to_string()));
        assert!(ifaces.contains(&"wlan0".to_string()));
        assert!(!ifaces.contains(&"lo".to_string()));
    }

    #[test]
    fn read_counters_from_tempdir() {
        let dir = tempfile::tempdir().unwrap();
        let stats = dir.path().join("eth0/statistics");
        std::fs::create_dir_all(&stats).unwrap();
        std::fs::write(stats.join("rx_bytes"), "12345\n").unwrap();
        std::fs::write(stats.join("tx_bytes"), "67890\n").unwrap();
        std::fs::write(stats.join("rx_errors"), "1\n").unwrap();
        std::fs::write(stats.join("tx_errors"), "0\n").unwrap();
        std::fs::write(stats.join("rx_packets"), "500\n").unwrap();
        std::fs::write(stats.join("tx_packets"), "300\n").unwrap();
        std::fs::write(stats.join("rx_dropped"), "2\n").unwrap();
        std::fs::write(stats.join("tx_dropped"), "0\n").unwrap();

        let c = read_counters(dir.path().to_str().unwrap(), "eth0").unwrap();
        assert_eq!(c.rx_bytes, 12345);
        assert_eq!(c.tx_bytes, 67890);
        assert_eq!(c.rx_errors, 1);
        assert_eq!(c.tx_errors, 0);
        assert_eq!(c.rx_packets, 500);
        assert_eq!(c.tx_packets, 300);
        assert_eq!(c.rx_dropped, 2);
        assert_eq!(c.tx_dropped, 0);
    }

    #[test]
    fn read_sysfs_u64_non_numeric_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let stats = dir.path().join("eth0/statistics");
        std::fs::create_dir_all(&stats).unwrap();
        std::fs::write(stats.join("rx_bytes"), "not_a_number\n").unwrap();
        std::fs::write(stats.join("tx_bytes"), "0\n").unwrap();
        std::fs::write(stats.join("rx_errors"), "0\n").unwrap();
        std::fs::write(stats.join("tx_errors"), "0\n").unwrap();

        let result = read_counters(dir.path().to_str().unwrap(), "eth0");
        assert!(result.is_err());
    }

    #[test]
    fn read_counters_missing_file_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        let stats = dir.path().join("eth0/statistics");
        std::fs::create_dir_all(&stats).unwrap();
        // Only create some files, leave rx_bytes missing
        std::fs::write(stats.join("tx_bytes"), "0\n").unwrap();

        let result = read_counters(dir.path().to_str().unwrap(), "eth0");
        assert!(result.is_err());
    }

    #[test]
    fn compute_net_metrics_empty_input() {
        let prev = HashMap::new();
        let curr = HashMap::new();
        let metrics = compute_net_metrics(&prev, &curr, Duration::from_secs(30));
        assert!(metrics.is_empty());
    }

    #[test]
    fn compute_net_metrics_zero_interval() {
        let mut prev = HashMap::new();
        prev.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 100,
                tx_bytes: 200,
                ..Default::default()
            },
        );
        let mut curr = HashMap::new();
        curr.insert(
            "eth0".to_string(),
            NetCounters {
                rx_bytes: 400,
                tx_bytes: 500,
                ..Default::default()
            },
        );
        let metrics = compute_net_metrics(&prev, &curr, Duration::ZERO);
        assert_eq!(metrics.len(), 1);
        // rate should be 0 when interval is 0
        assert_eq!(metrics[0].rx_bytes_rate, 0.0);
        assert_eq!(metrics[0].tx_bytes_rate, 0.0);
    }

    #[test]
    fn read_all_counters_from_tempdir() {
        let dir = tempfile::tempdir().unwrap();
        let eth0_stats = dir.path().join("eth0/statistics");
        std::fs::create_dir_all(&eth0_stats).unwrap();
        std::fs::write(eth0_stats.join("rx_bytes"), "1000\n").unwrap();
        std::fs::write(eth0_stats.join("tx_bytes"), "2000\n").unwrap();
        std::fs::write(eth0_stats.join("rx_errors"), "0\n").unwrap();
        std::fs::write(eth0_stats.join("tx_errors"), "0\n").unwrap();

        let counters = read_all_counters_from(dir.path().to_str().unwrap(), &[]).unwrap();
        assert_eq!(counters.len(), 1);
        assert_eq!(counters["eth0"].rx_bytes, 1000);
        assert_eq!(counters["eth0"].tx_bytes, 2000);
    }

    #[test]
    fn read_all_counters_from_corrupted_interface() {
        let dir = tempfile::tempdir().unwrap();
        // eth0: valid counters
        let eth0_stats = dir.path().join("eth0/statistics");
        std::fs::create_dir_all(&eth0_stats).unwrap();
        std::fs::write(eth0_stats.join("rx_bytes"), "1000\n").unwrap();
        std::fs::write(eth0_stats.join("tx_bytes"), "2000\n").unwrap();
        std::fs::write(eth0_stats.join("rx_errors"), "0\n").unwrap();
        std::fs::write(eth0_stats.join("tx_errors"), "0\n").unwrap();
        // broken0: missing statistics files (triggers warn branch)
        std::fs::create_dir_all(dir.path().join("broken0/statistics")).unwrap();

        let counters = read_all_counters_from(dir.path().to_str().unwrap(), &[]).unwrap();
        // broken0 skipped, only eth0 collected
        assert_eq!(counters.len(), 1);
        assert!(counters.contains_key("eth0"));
    }

    #[test]
    fn read_all_counters_from_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let counters = read_all_counters_from(dir.path().to_str().unwrap(), &[]).unwrap();
        assert!(counters.is_empty());
    }
}
