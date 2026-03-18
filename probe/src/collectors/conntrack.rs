//! Conntrack state from `/proc/sys/net/netfilter/`.
//!
//! Reads `nf_conntrack_count` and `nf_conntrack_max` sysctl files.
//! Returns `None` if netfilter is not loaded (files don't exist).

/// Connection tracking state.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct ConntrackState {
    pub count: u64,
    pub max: u64,
}

/// Read conntrack state from a parameterized directory (for testing).
///
/// Expects `{dir}/nf_conntrack_count` and `{dir}/nf_conntrack_max` files.
/// Returns `None` if either file is missing (netfilter not loaded).
pub fn read_conntrack_from(dir: &str) -> Option<ConntrackState> {
    let count_str = std::fs::read_to_string(format!("{dir}/nf_conntrack_count")).ok()?;
    let max_str = std::fs::read_to_string(format!("{dir}/nf_conntrack_max")).ok()?;

    let count: u64 = count_str.trim().parse().ok()?;
    let max: u64 = max_str.trim().parse().ok()?;

    Some(ConntrackState { count, max })
}

/// Read conntrack state from `/proc/sys/net/netfilter/`.
#[cfg_attr(coverage_nightly, coverage(off))]
#[allow(dead_code)]
pub fn read_conntrack() -> Option<ConntrackState> {
    read_conntrack_from("/proc/sys/net/netfilter")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_conntrack_from_tempdir() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path();
        std::fs::write(dir_path.join("nf_conntrack_count"), "1234\n").unwrap();
        std::fs::write(dir_path.join("nf_conntrack_max"), "65536\n").unwrap();

        let state = read_conntrack_from(dir_path.to_str().unwrap()).unwrap();
        assert_eq!(state.count, 1234);
        assert_eq!(state.max, 65536);
    }

    #[test]
    fn read_conntrack_from_missing_count() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("nf_conntrack_max"), "65536\n").unwrap();
        // count file missing → None
        assert!(read_conntrack_from(dir.path().to_str().unwrap()).is_none());
    }

    #[test]
    fn read_conntrack_from_missing_max() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("nf_conntrack_count"), "100\n").unwrap();
        // max file missing → None
        assert!(read_conntrack_from(dir.path().to_str().unwrap()).is_none());
    }

    #[test]
    fn read_conntrack_from_both_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read_conntrack_from(dir.path().to_str().unwrap()).is_none());
    }

    #[test]
    fn read_conntrack_from_non_numeric() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("nf_conntrack_count"), "not_a_number\n").unwrap();
        std::fs::write(dir.path().join("nf_conntrack_max"), "65536\n").unwrap();
        assert!(read_conntrack_from(dir.path().to_str().unwrap()).is_none());
    }

    #[test]
    fn read_conntrack_from_missing_dir() {
        assert!(read_conntrack_from("/nonexistent/path").is_none());
    }
}
