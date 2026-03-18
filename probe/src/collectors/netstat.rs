//! Extended TCP statistics from `/proc/net/netstat`.
//!
//! Same two-line format as `/proc/net/snmp` — parses the `TcpExt:` section.

/// Parsed counters from the `TcpExt:` section of `/proc/net/netstat`.
#[derive(Debug, Clone, Default)]
pub struct NetstatCounters {
    pub listen_overflows: u64,
    pub listen_drops: u64,
    pub tcp_timeouts: u64,
    pub tcp_syn_retrans: u64,
    pub tcp_fast_retrans: u64,
    pub tcp_ofo_queue: u64,
    pub tcp_abort_on_memory: u64,
    pub syncookies_sent: u64,
}

/// Parse `/proc/net/netstat` content.
///
/// Extracts `TcpExt:` section fields.
pub fn parse_netstat(content: &str) -> Option<NetstatCounters> {
    let lines: Vec<&str> = content.lines().collect();
    let mut counters = NetstatCounters::default();
    let mut found = false;

    let mut i = 0;
    while i + 1 < lines.len() {
        let header = lines[i];
        let values = lines[i + 1];

        if header.starts_with("TcpExt:") && values.starts_with("TcpExt:") {
            let header_fields: Vec<&str> = header.split_whitespace().collect();
            let value_fields: Vec<&str> = values.split_whitespace().collect();

            for (name, val_str) in header_fields
                .iter()
                .skip(1)
                .zip(value_fields.iter().skip(1))
            {
                if let Ok(val) = val_str.parse::<u64>() {
                    match *name {
                        "ListenOverflows" => counters.listen_overflows = val,
                        "ListenDrops" => counters.listen_drops = val,
                        "TCPTimeouts" => counters.tcp_timeouts = val,
                        "TCPSynRetrans" => counters.tcp_syn_retrans = val,
                        "TCPFastRetrans" => counters.tcp_fast_retrans = val,
                        "TCPOFOQueue" => counters.tcp_ofo_queue = val,
                        "TCPAbortOnMemory" => counters.tcp_abort_on_memory = val,
                        "SyncookiesSent" => counters.syncookies_sent = val,
                        _ => {}
                    }
                }
            }
            found = true;
            i += 2;
        } else {
            i += 1;
        }
    }

    if found { Some(counters) } else { None }
}

/// Read netstat counters from a parameterized path (for testing).
pub fn read_netstat_from(path: &str) -> Option<NetstatCounters> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_netstat(&content)
}

/// Read netstat counters from `/proc/net/netstat`.
#[cfg_attr(coverage_nightly, coverage(off))]
#[allow(dead_code)]
pub fn read_netstat() -> Option<NetstatCounters> {
    read_netstat_from("/proc/net/netstat")
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROC_NET_NETSTAT: &str = "\
TcpExt: SyncookiesSent SyncookiesRecv SyncookiesFailed EmbryonicRsts PruneCalled RcvPruned OfsPruned OutOfWindowIcmps LockDroppedIcmps ArpFilter TW TWRecycled TWKilled PAWSActive PAWSEstab DelayedACKs DelayedACKLocked DelayedACKLost ListenOverflows ListenDrops TCPHPHits TCPPureAcks TCPHPAcks TCPRenoRecovery TCPSackRecovery TCPSACKReneging TCPSACKReorder TCPRenoReorder TCPTSReorder TCPFullUndo TCPPartialUndo TCPDSACKUndo TCPLossUndo TCPLostRetransmit TCPRenoFailures TCPSackFailures TCPLossFailures TCPFastRetrans TCPSlowStartRetrans TCPTimeouts TCPLossProbes TCPLossProbeRecovery TCPRenoRecoveryFail TCPSackRecoveryFail TCPRcvCollapsed TCPBacklogCoalesce TCPAbortOnData TCPAbortOnClose TCPAbortOnMemory TCPAbortOnTimeout TCPAbortOnLinger TCPAbortFailed TCPMemoryPressures TCPMemoryPressuresChrono TCPSACKDiscard TCPDSACKIgnoredOld TCPDSACKIgnoredNoUndo TCPSpuriousRTOs TCPMD5NotFound TCPMD5Unexpected TCPMD5Failure TCPSackShifted TCPSackMerged TCPSackShiftFallback TCPBacklogDrop TCPMinTTLDrop TCPDeferAcceptDrop IPReversePathFilter TCPTimeWaitOverflow TCPReqQFullDoCookies TCPReqQFullDrop TCPRetransFail TCPRcvCoalesce TCPOFOQueue TCPOFOMerge TCPChallengeACK TCPSYNChallenge TCPFastOpenActive TCPFastOpenActiveFail TCPFastOpenPassive TCPFastOpenPassiveFail TCPFastOpenListenOverflow TCPFastOpenCookieReqd TCPFastOpenBlackhole TCPSpuriousRtxHostQueues TCPAutoCorking TCPFromZeroWindowAdv TCPToZeroWindowAdv TCPWantZeroWindowAdv TCPSynRetrans TCPOrigDataSent TCPHystartTrainDetect TCPHystartTrainCwnd TCPHystartDelayDetect TCPHystartDelayCwnd TCPACKSkippedSynRecv TCPACKSkippedPAWS TCPACKSkippedSeq TCPACKSkippedFinWait2 TCPACKSkippedTimeWait TCPACKSkippedChallenge TCPWinProbe TCPKeepAlive TCPMTUPFail TCPMTUPSuccess TCPDelivered TCPDeliveredCE TCPAckCompressed TCPZeroWindowDrop TCPRcvQDrop TCPWqueueTooBig TCPFastOpenPassiveAltKey
TcpExt: 5 0 0 0 0 0 0 0 0 0 100 0 0 0 0 500 0 10 42 38 1000 2000 3000 0 10 0 0 0 0 0 0 0 50 0 0 0 0 15 0 200 100 50 0 0 0 500 100 50 3 20 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 5000 99 5 0 0 0 0 0 0 0 0 0 10000 0 0 0 77 50000 0 0 0 0 0 0 0 0 0 0 0 1000 0 0 60000 0 0 0 0 0 0
IpExt: InNoRoutes InTruncatedPkts InMcastPkts OutMcastPkts InBcastPkts OutBcastPkts InOctets OutOctets InMcastOctets OutMcastOctets InBcastOctets OutBcastOctets InCsumErrors InNoECTPkts InECT1Pkts InECT0Pkts InCEPkts ReasmOverlaps
IpExt: 0 0 100 200 300 0 99999999 88888888 1000 2000 3000 0 0 123456 0 0 0 0
";

    #[test]
    fn parse_netstat_full() {
        let counters = parse_netstat(PROC_NET_NETSTAT).unwrap();
        assert_eq!(counters.listen_overflows, 42);
        assert_eq!(counters.listen_drops, 38);
        assert_eq!(counters.tcp_timeouts, 200);
        assert_eq!(counters.tcp_syn_retrans, 50000);
        assert_eq!(counters.tcp_fast_retrans, 15);
        assert_eq!(counters.tcp_ofo_queue, 99);
        assert_eq!(counters.tcp_abort_on_memory, 3);
        assert_eq!(counters.syncookies_sent, 5);
    }

    #[test]
    fn parse_netstat_missing_tcpext() {
        let content = "\
IpExt: InNoRoutes InTruncatedPkts
IpExt: 0 0
";
        assert!(parse_netstat(content).is_none());
    }

    #[test]
    fn parse_netstat_partial_fields() {
        // TcpExt with only a few fields
        let content = "\
TcpExt: ListenDrops TCPTimeouts
TcpExt: 10 20
";
        let counters = parse_netstat(content).unwrap();
        assert_eq!(counters.listen_drops, 10);
        assert_eq!(counters.tcp_timeouts, 20);
        assert_eq!(counters.listen_overflows, 0); // missing → default 0
    }

    #[test]
    fn parse_netstat_empty() {
        assert!(parse_netstat("").is_none());
    }

    #[test]
    fn read_netstat_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("netstat");
        std::fs::write(&path, PROC_NET_NETSTAT).unwrap();
        let counters = read_netstat_from(path.to_str().unwrap()).unwrap();
        assert_eq!(counters.listen_overflows, 42);
    }

    #[test]
    fn read_netstat_from_missing_file() {
        assert!(read_netstat_from("/nonexistent/netstat").is_none());
    }
}
