use std::collections::HashMap;

/// Raw counters read from `/sys/class/net/{iface}/statistics/`.
#[derive(Debug, Clone, Default)]
pub struct NetCounters {
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub rx_errors: u64,
    pub tx_errors: u64,
}

/// Computed network metrics for a single interface.
#[derive(Debug)]
pub struct NetInfo {
    pub iface: String,
    pub rx_bytes_rate: f64,
    pub tx_bytes_rate: f64,
    pub rx_errors: u64,
    pub tx_errors: u64,
}

/// List network interfaces from `/sys/class/net/`, excluding configured ones.
///
/// In production, reads the directory listing. For tests, use `filter_interfaces`.
pub fn list_interfaces(
    sysfs_path: &str,
    exclude: &[String],
) -> std::io::Result<Vec<String>> {
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
    interval_secs: u64,
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
                    interval_secs,
                ),
                tx_bytes_rate: compute_rate(
                    prev_counters.tx_bytes,
                    curr_counters.tx_bytes,
                    interval_secs,
                ),
                rx_errors: compute_delta(prev_counters.rx_errors, curr_counters.rx_errors),
                tx_errors: compute_delta(prev_counters.tx_errors, curr_counters.tx_errors),
            });
        }
    }
    results.sort_by(|a, b| a.iface.cmp(&b.iface));
    results
}

/// Filter interface names, excluding configured ones.
pub fn filter_interfaces(interfaces: &[&str], exclude: &[String]) -> Vec<String> {
    interfaces
        .iter()
        .filter(|iface| !exclude.iter().any(|e| e == *iface))
        .map(|s| s.to_string())
        .collect()
}

#[cfg(test)]
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
            },
        );

        let metrics = compute_net_metrics(&prev, &curr, 30);
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

        let metrics = compute_net_metrics(&prev, &curr, 30);
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

        let metrics = compute_net_metrics(&prev, &curr, 30);
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
            },
        );

        let metrics = compute_net_metrics(&prev, &curr, 10);
        assert_eq!(metrics.len(), 1);
        // rx_bytes delta = 500 + (u64::MAX - (u64::MAX - 500)) = 1000
        assert!((metrics[0].rx_bytes_rate - 100.0).abs() < f64::EPSILON);
        // rx_errors delta = 2 + (u64::MAX - (u64::MAX - 2)) = 4
        assert_eq!(metrics[0].rx_errors, 4);
    }
}
