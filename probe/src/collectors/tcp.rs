//! TCP connection state collector from `/proc/net/sockstat`.
//!
//! Reads system-wide TCP socket counts: established (inuse), `time_wait`,
//! orphan, and allocated sockets.

/// Parsed TCP state from `/proc/net/sockstat`.
#[derive(Debug)]
pub struct TcpState {
    pub established: u32,
    pub time_wait: u32,
    pub orphan: u32,
    pub allocated: u32,
}

/// Parse `/proc/net/sockstat` content.
///
/// Looks for the `TCP:` line and extracts `inuse`, `tw`, `orphan`, `alloc` values.
///
/// Example line:
/// ```text
/// TCP: inuse 6 orphan 0 tw 26 alloc 19 mem 10
/// ```
#[allow(clippy::cast_possible_truncation)]
pub fn parse_sockstat(content: &str) -> Option<TcpState> {
    for line in content.lines() {
        if !line.starts_with("TCP:") {
            continue;
        }

        let mut inuse: Option<u32> = None;
        let mut orphan: Option<u32> = None;
        let mut tw: Option<u32> = None;
        let mut alloc: Option<u32> = None;

        let parts: Vec<&str> = line.split_whitespace().collect();
        // Parse key-value pairs: "TCP: inuse 6 orphan 0 tw 26 alloc 19 mem 10"
        let mut i = 1; // skip "TCP:"
        while i + 1 < parts.len() {
            let key = parts[i];
            let val: u32 = parts[i + 1].parse().ok()?;
            match key {
                "inuse" => inuse = Some(val),
                "orphan" => orphan = Some(val),
                "tw" => tw = Some(val),
                "alloc" => alloc = Some(val),
                _ => {}
            }
            i += 2;
        }

        return Some(TcpState {
            established: inuse?,
            time_wait: tw?,
            orphan: orphan?,
            allocated: alloc?,
        });
    }
    None
}

/// Read TCP state from a parameterized path (for testing).
pub fn read_tcp_state_from(path: &str) -> Option<TcpState> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_sockstat(&content)
}

/// Read TCP state from `/proc/net/sockstat`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_tcp_state() -> Option<TcpState> {
    read_tcp_state_from("/proc/net/sockstat")
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROC_SOCKSTAT: &str = "\
sockets: used 179
TCP: inuse 6 orphan 0 tw 26 alloc 19 mem 10
UDP: inuse 4 mem 0
UDPLITE: inuse 0
RAW: inuse 0
FRAG: inuse 0 memory 0
";

    const PROC_SOCKSTAT_HIGH: &str = "\
sockets: used 1500
TCP: inuse 450 orphan 3 tw 892 alloc 1200 mem 512
UDP: inuse 10 mem 2
";

    #[test]
    fn parse_sockstat_normal() {
        let state = parse_sockstat(PROC_SOCKSTAT).unwrap();
        assert_eq!(state.established, 6);
        assert_eq!(state.time_wait, 26);
        assert_eq!(state.orphan, 0);
        assert_eq!(state.allocated, 19);
    }

    #[test]
    fn parse_sockstat_high_values() {
        let state = parse_sockstat(PROC_SOCKSTAT_HIGH).unwrap();
        assert_eq!(state.established, 450);
        assert_eq!(state.time_wait, 892);
        assert_eq!(state.orphan, 3);
        assert_eq!(state.allocated, 1200);
    }

    #[test]
    fn parse_sockstat_empty() {
        assert!(parse_sockstat("").is_none());
    }

    #[test]
    fn parse_sockstat_no_tcp_line() {
        let content = "sockets: used 100\nUDP: inuse 4 mem 0\n";
        assert!(parse_sockstat(content).is_none());
    }

    #[test]
    fn parse_sockstat_incomplete_tcp_line() {
        // Missing alloc field
        let content = "TCP: inuse 6 orphan 0 tw 26\n";
        assert!(parse_sockstat(content).is_none());
    }

    #[test]
    fn read_tcp_state_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sockstat");
        std::fs::write(&path, PROC_SOCKSTAT).unwrap();

        let state = read_tcp_state_from(path.to_str().unwrap()).unwrap();
        assert_eq!(state.established, 6);
        assert_eq!(state.time_wait, 26);
    }

    #[test]
    fn read_tcp_state_from_missing_file() {
        assert!(read_tcp_state_from("/nonexistent/sockstat").is_none());
    }
}
