//! SNMP protocol counters from `/proc/net/snmp`.
//!
//! Parses the two-line format where a header row lists field names
//! and the next row with the same prefix lists corresponding values.

/// Parsed counters from `/proc/net/snmp`.
#[derive(Debug, Clone, Default)]
pub struct SnmpCounters {
    // TCP section
    pub retrans_segs: u64,
    pub active_opens: u64,
    pub passive_opens: u64,
    pub attempt_fails: u64,
    pub estab_resets: u64,
    pub in_errs: u64,
    pub out_rsts: u64,
    // UDP section
    pub udp_rcvbuf_errors: u64,
    pub udp_sndbuf_errors: u64,
    pub udp_in_errors: u64,
}

/// Parse `/proc/net/snmp` content.
///
/// Format is two-line pairs: header row then values row, sharing a prefix.
/// ```text
/// Tcp: RtoAlgorithm RtoMin RtoMax ... RetransSegs
/// Tcp: 1 200 120000 ... 12345
/// Udp: InDatagrams NoPorts InErrors OutDatagrams RcvbufErrors SndbufErrors ...
/// Udp: 999 0 5 1000 2 1 ...
/// ```
pub fn parse_snmp(content: &str) -> Option<SnmpCounters> {
    let lines: Vec<&str> = content.lines().collect();
    let mut counters = SnmpCounters::default();
    let mut found_tcp = false;

    let mut i = 0;
    while i + 1 < lines.len() {
        let header = lines[i];
        let values = lines[i + 1];

        if header.starts_with("Tcp:") && values.starts_with("Tcp:") {
            parse_two_line_section(header, values, &mut |name, val| match name {
                "RetransSegs" => counters.retrans_segs = val,
                "ActiveOpens" => counters.active_opens = val,
                "PassiveOpens" => counters.passive_opens = val,
                "AttemptFails" => counters.attempt_fails = val,
                "EstabResets" => counters.estab_resets = val,
                "InErrs" => counters.in_errs = val,
                "OutRsts" => counters.out_rsts = val,
                _ => {}
            });
            found_tcp = true;
            i += 2;
        } else if header.starts_with("Udp:") && values.starts_with("Udp:") {
            parse_two_line_section(header, values, &mut |name, val| match name {
                "RcvbufErrors" => counters.udp_rcvbuf_errors = val,
                "SndbufErrors" => counters.udp_sndbuf_errors = val,
                "InErrors" => counters.udp_in_errors = val,
                _ => {}
            });
            i += 2;
        } else {
            i += 1;
        }
    }

    if found_tcp { Some(counters) } else { None }
}

/// Parse a two-line section (header + values) from /proc/net/snmp or /proc/net/netstat.
fn parse_two_line_section(header: &str, values: &str, callback: &mut dyn FnMut(&str, u64)) {
    let header_fields: Vec<&str> = header.split_whitespace().collect();
    let value_fields: Vec<&str> = values.split_whitespace().collect();

    // Skip prefix (e.g. "Tcp:") — both rows start with same prefix
    for (name, val_str) in header_fields
        .iter()
        .skip(1)
        .zip(value_fields.iter().skip(1))
    {
        if let Ok(val) = val_str.parse::<u64>() {
            callback(name, val);
        }
    }
}

/// Read SNMP counters from a parameterized path (for testing).
pub fn read_snmp_from(path: &str) -> Option<SnmpCounters> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_snmp(&content)
}

/// Read SNMP counters from `/proc/net/snmp`.
#[cfg_attr(coverage_nightly, coverage(off))]
#[allow(dead_code)]
pub fn read_snmp() -> Option<SnmpCounters> {
    read_snmp_from("/proc/net/snmp")
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    const PROC_NET_SNMP: &str = "\
Ip: Forwarding DefaultTTL InReceives InHdrErrors InAddrErrors ForwDatagrams InUnknownProtos InDiscards InDelivers OutRequests OutDiscards OutNoRoutes ReasmTimeout ReasmReqds ReasmOKs ReasmFails FragOKs FragFails FragCreates
Ip: 1 64 123456 0 0 0 0 0 123456 98765 0 0 0 0 0 0 0 0 0
Tcp: RtoAlgorithm RtoMin RtoMax MaxConn ActiveOpens PassiveOpens AttemptFails EstabResets CurrEstab InSegs OutSegs RetransSegs InErrs OutRsts InCsumErrors
Tcp: 1 200 120000 -1 500 300 10 5 42 99999 88888 1234 7 99 0
Udp: InDatagrams NoPorts InErrors OutDatagrams RcvbufErrors SndbufErrors InCsumErrors IgnoredMulti MemErrors
Udp: 5000 0 3 6000 2 1 0 0 0
UdpLite: InDatagrams NoPorts InErrors OutDatagrams RcvbufErrors SndbufErrors InCsumErrors IgnoredMulti MemErrors
UdpLite: 0 0 0 0 0 0 0 0 0
";

    #[test]
    fn parse_snmp_full() {
        let counters = parse_snmp(PROC_NET_SNMP).unwrap();
        assert_eq!(counters.retrans_segs, 1234);
        assert_eq!(counters.active_opens, 500);
        assert_eq!(counters.passive_opens, 300);
        assert_eq!(counters.attempt_fails, 10);
        assert_eq!(counters.estab_resets, 5);
        assert_eq!(counters.in_errs, 7);
        assert_eq!(counters.out_rsts, 99);
        assert_eq!(counters.udp_rcvbuf_errors, 2);
        assert_eq!(counters.udp_sndbuf_errors, 1);
        assert_eq!(counters.udp_in_errors, 3);
    }

    #[test]
    fn parse_snmp_missing_tcp_section() {
        let content = "\
Udp: InDatagrams NoPorts InErrors OutDatagrams
Udp: 100 0 0 100
";
        assert!(parse_snmp(content).is_none());
    }

    #[test]
    fn parse_snmp_tcp_only() {
        let content = "\
Tcp: RtoAlgorithm RtoMin RtoMax MaxConn ActiveOpens PassiveOpens AttemptFails EstabResets CurrEstab InSegs OutSegs RetransSegs InErrs OutRsts InCsumErrors
Tcp: 1 200 120000 -1 10 20 1 2 5 999 888 42 0 3 0
";
        let counters = parse_snmp(content).unwrap();
        assert_eq!(counters.retrans_segs, 42);
        assert_eq!(counters.active_opens, 10);
        // UDP fields stay at default 0
        assert_eq!(counters.udp_rcvbuf_errors, 0);
    }

    #[test]
    fn parse_snmp_empty() {
        assert!(parse_snmp("").is_none());
    }

    #[test]
    fn parse_snmp_mismatched_prefix() {
        // Header says Tcp but values say Udp — skip
        let content = "\
Tcp: ActiveOpens RetransSegs
Udp: 10 20
";
        assert!(parse_snmp(content).is_none());
    }

    #[test]
    fn read_snmp_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("snmp");
        std::fs::write(&path, PROC_NET_SNMP).unwrap();
        let counters = read_snmp_from(path.to_str().unwrap()).unwrap();
        assert_eq!(counters.retrans_segs, 1234);
    }

    #[test]
    fn read_snmp_from_missing_file() {
        assert!(read_snmp_from("/nonexistent/snmp").is_none());
    }
}
