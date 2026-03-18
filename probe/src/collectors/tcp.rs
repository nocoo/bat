//! TCP connection state collector from `/proc/net/sockstat`.
//!
//! Reads system-wide TCP socket counts: established (inuse), `time_wait`,
//! orphan, and allocated sockets.

/// Parsed TCP state from `/proc/net/sockstat`.
#[derive(Debug)]
#[allow(dead_code)] // Signal expansion fields used in later commits
pub struct TcpState {
    pub established: u32,
    pub time_wait: u32,
    pub orphan: u32,
    pub allocated: u32,
    /// TCP memory pages in use (from `mem` field of TCP: line)
    pub mem_pages: Option<u32>,
}

/// Extra socket stats from `/proc/net/sockstat` beyond TCP.
#[derive(Debug)]
#[allow(dead_code)] // Signal expansion fields used in later commits
pub struct SockstatExtra {
    pub sockets_used: u32,
    pub udp_inuse: u32,
    pub udp_mem_pages: u32,
}

/// Parse `/proc/net/sockstat` content.
///
/// Returns TCP state and optional extra socket stats.
///
/// Example format:
/// ```text
/// sockets: used 179
/// TCP: inuse 6 orphan 0 tw 26 alloc 19 mem 10
/// UDP: inuse 4 mem 0
/// UDPLITE: inuse 0
/// RAW: inuse 0
/// FRAG: inuse 0 memory 0
/// ```
#[allow(clippy::cast_possible_truncation)]
pub fn parse_sockstat(content: &str) -> Option<(TcpState, Option<SockstatExtra>)> {
    let mut tcp_state: Option<TcpState> = None;
    let mut sockets_used: Option<u32> = None;
    let mut udp_inuse: Option<u32> = None;
    let mut udp_mem_pages: Option<u32> = None;

    for line in content.lines() {
        if line.starts_with("TCP:") {
            let mut inuse: Option<u32> = None;
            let mut orphan: Option<u32> = None;
            let mut tw: Option<u32> = None;
            let mut alloc: Option<u32> = None;
            let mut mem_pages: Option<u32> = None;

            let parts: Vec<&str> = line.split_whitespace().collect();
            let mut i = 1; // skip "TCP:"
            while i + 1 < parts.len() {
                let key = parts[i];
                let val: u32 = parts[i + 1].parse().ok()?;
                match key {
                    "inuse" => inuse = Some(val),
                    "orphan" => orphan = Some(val),
                    "tw" => tw = Some(val),
                    "alloc" => alloc = Some(val),
                    "mem" => mem_pages = Some(val),
                    _ => {}
                }
                i += 2;
            }

            tcp_state = Some(TcpState {
                established: inuse?,
                time_wait: tw?,
                orphan: orphan?,
                allocated: alloc?,
                mem_pages,
            });
        } else if line.starts_with("sockets:") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 && parts[1] == "used" {
                sockets_used = parts[2].parse().ok();
            }
        } else if line.starts_with("UDP:") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            let mut i = 1;
            while i + 1 < parts.len() {
                match parts[i] {
                    "inuse" => udp_inuse = parts[i + 1].parse().ok(),
                    "mem" => udp_mem_pages = parts[i + 1].parse().ok(),
                    _ => {}
                }
                i += 2;
            }
        }
    }

    let tcp = tcp_state?;
    let extra = match (sockets_used, udp_inuse, udp_mem_pages) {
        (Some(su), Some(ui), Some(um)) => Some(SockstatExtra {
            sockets_used: su,
            udp_inuse: ui,
            udp_mem_pages: um,
        }),
        _ => None,
    };

    Some((tcp, extra))
}

/// Read TCP state from a parameterized path (for testing).
#[allow(dead_code)]
pub fn read_tcp_state_from(path: &str) -> Option<TcpState> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_sockstat(&content).map(|(tcp, _)| tcp)
}

/// Read TCP state from `/proc/net/sockstat`.
#[cfg_attr(coverage_nightly, coverage(off))]
#[allow(dead_code)]
pub fn read_tcp_state() -> Option<TcpState> {
    read_tcp_state_from("/proc/net/sockstat")
}

/// Read full sockstat (TCP + extras) from a parameterized path (for testing).
pub fn read_sockstat_from(path: &str) -> Option<(TcpState, Option<SockstatExtra>)> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_sockstat(&content)
}

/// Read full sockstat from `/proc/net/sockstat`.
#[cfg_attr(coverage_nightly, coverage(off))]
#[allow(dead_code)]
pub fn read_sockstat() -> Option<(TcpState, Option<SockstatExtra>)> {
    read_sockstat_from("/proc/net/sockstat")
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
        let (state, extra) = parse_sockstat(PROC_SOCKSTAT).unwrap();
        assert_eq!(state.established, 6);
        assert_eq!(state.time_wait, 26);
        assert_eq!(state.orphan, 0);
        assert_eq!(state.allocated, 19);
        assert_eq!(state.mem_pages, Some(10));

        let extra = extra.unwrap();
        assert_eq!(extra.sockets_used, 179);
        assert_eq!(extra.udp_inuse, 4);
        assert_eq!(extra.udp_mem_pages, 0);
    }

    #[test]
    fn parse_sockstat_high_values() {
        let (state, _) = parse_sockstat(PROC_SOCKSTAT_HIGH).unwrap();
        assert_eq!(state.established, 450);
        assert_eq!(state.time_wait, 892);
        assert_eq!(state.orphan, 3);
        assert_eq!(state.allocated, 1200);
        assert_eq!(state.mem_pages, Some(512));
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
    fn parse_sockstat_tcp_only_no_extras() {
        // No sockets: or UDP: lines
        let content = "TCP: inuse 6 orphan 0 tw 26 alloc 19 mem 10\n";
        let (state, extra) = parse_sockstat(content).unwrap();
        assert_eq!(state.established, 6);
        assert_eq!(state.mem_pages, Some(10));
        assert!(extra.is_none());
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

    #[test]
    fn read_sockstat_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("sockstat");
        std::fs::write(&path, PROC_SOCKSTAT).unwrap();

        let (tcp, extra) = read_sockstat_from(path.to_str().unwrap()).unwrap();
        assert_eq!(tcp.established, 6);
        let extra = extra.unwrap();
        assert_eq!(extra.sockets_used, 179);
        assert_eq!(extra.udp_inuse, 4);
    }
}
