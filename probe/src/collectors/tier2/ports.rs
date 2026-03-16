use std::collections::HashMap;
use std::path::Path;

/// A single TCP entry parsed from /proc/net/tcp or /proc/net/tcp6.
#[derive(Debug, Clone)]
pub struct TcpEntry {
    pub local_addr: String,
    pub local_port: u16,
    pub state: u8,
    pub inode: u64,
    #[allow(dead_code)]
    pub is_ipv6: bool,
}

/// A listening port with optional process information.
#[derive(Debug, Clone)]
pub struct ListeningPort {
    pub port: u16,
    pub bind: String,
    pub protocol: String, // "tcp" or "tcp6"
    pub pid: Option<u32>,
    pub process: Option<String>,
}

/// Decode a little-endian hex IPv4 address to dotted-decimal notation.
///
/// `/proc/net/tcp` stores IPv4 addresses as 8-char hex in little-endian byte order.
pub fn decode_ipv4_hex(hex: &str) -> Option<String> {
    if hex.len() != 8 {
        return None;
    }
    let val = u32::from_str_radix(hex, 16).ok()?;
    Some(format!(
        "{}.{}.{}.{}",
        val & 0xFF,
        (val >> 8) & 0xFF,
        (val >> 16) & 0xFF,
        (val >> 24) & 0xFF,
    ))
}

/// Decode a little-endian hex IPv6 address to colon notation.
///
/// `/proc/net/tcp6` stores IPv6 addresses as 32-char hex where each 8-char word
/// is stored in little-endian byte order.
pub fn decode_ipv6_hex(hex: &str) -> Option<String> {
    if hex.len() != 32 {
        return None;
    }

    // IPv6 in /proc/net/tcp6 is stored as 4 groups of 8 hex chars (32-bit words),
    // each in little-endian byte order
    let mut parts = Vec::with_capacity(8);
    for i in 0..4 {
        let word_hex = &hex[i * 8..(i + 1) * 8];
        let word = u32::from_str_radix(word_hex, 16).ok()?;
        // Convert from little-endian
        let be = word.swap_bytes();
        parts.push(format!("{:04x}", (be >> 16) & 0xFFFF));
        parts.push(format!("{:04x}", be & 0xFFFF));
    }

    let full = parts.join(":");
    // Simplify all-zeros to "::"
    if full == "0000:0000:0000:0000:0000:0000:0000:0000" {
        return Some("::".to_string());
    }
    // Simplify ::ffff:x.x.x.x (IPv4-mapped)
    if let Some(last) = full.strip_prefix("0000:0000:0000:0000:0000:ffff:") {
        // last is like "7f00:0001", convert to IPv4
        let parts: Vec<&str> = last.split(':').collect();
        if parts.len() == 2
            && let (Ok(hi), Ok(lo)) = (
                u16::from_str_radix(parts[0], 16),
                u16::from_str_radix(parts[1], 16),
            )
        {
            return Some(format!(
                "::ffff:{}.{}.{}.{}",
                (hi >> 8) & 0xFF,
                hi & 0xFF,
                (lo >> 8) & 0xFF,
                lo & 0xFF,
            ));
        }
    }
    // Simplify ::1
    if full == "0000:0000:0000:0000:0000:0000:0000:0001" {
        return Some("::1".to_string());
    }
    Some(full)
}

/// Parse a single line from `/proc/net/tcp` or `/proc/net/tcp6`.
fn parse_tcp_line(line: &str, is_ipv6: bool) -> Option<TcpEntry> {
    let fields: Vec<&str> = line.split_whitespace().collect();
    if fields.len() < 10 {
        return None;
    }

    // fields[1] = local_address:port (hex)
    let local_parts: Vec<&str> = fields[1].split(':').collect();
    if local_parts.len() != 2 {
        return None;
    }

    let local_addr = if is_ipv6 {
        decode_ipv6_hex(local_parts[0])?
    } else {
        decode_ipv4_hex(local_parts[0])?
    };
    let local_port = u16::from_str_radix(local_parts[1], 16).ok()?;

    // fields[3] = state (hex)
    let state = u8::from_str_radix(fields[3], 16).ok()?;

    // fields[9] = inode
    let inode = fields[9].parse::<u64>().ok()?;

    Some(TcpEntry {
        local_addr,
        local_port,
        state,
        inode,
        is_ipv6,
    })
}

/// Parse the contents of `/proc/net/tcp`.
pub fn parse_proc_net_tcp(content: &str) -> Vec<TcpEntry> {
    content
        .lines()
        .skip(1) // skip header
        .filter_map(|line| parse_tcp_line(line, false))
        .collect()
}

/// Parse the contents of `/proc/net/tcp6`.
pub fn parse_proc_net_tcp6(content: &str) -> Vec<TcpEntry> {
    content
        .lines()
        .skip(1) // skip header
        .filter_map(|line| parse_tcp_line(line, true))
        .collect()
}

/// Filter entries to only those in LISTEN state (0x0A).
pub fn filter_listening(entries: &[TcpEntry]) -> Vec<&TcpEntry> {
    entries.iter().filter(|e| e.state == 0x0A).collect()
}

/// Parse a socket inode from a readlink result like "socket:[12345]".
pub fn parse_socket_inode(link_target: &str) -> Option<u64> {
    let s = link_target.strip_prefix("socket:[")?;
    let s = s.strip_suffix(']')?;
    s.parse().ok()
}

/// Read the process name from `/proc/{pid}/comm`.
pub fn read_process_name(proc_path: &Path, pid: u32) -> String {
    let comm_path = proc_path.join(format!("{pid}")).join("comm");
    std::fs::read_to_string(comm_path)
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

/// Build a map from socket inode → (pid, `process_name`) by scanning `/proc/{pid}/fd/`.
///
/// This is best-effort: some processes may not be readable due to permissions.
pub fn build_inode_pid_map(proc_path: &Path) -> HashMap<u64, (u32, String)> {
    let mut map = HashMap::new();

    let Ok(entries) = std::fs::read_dir(proc_path) else {
        return map;
    };

    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        let Ok(pid): Result<u32, _> = name_str.parse() else {
            continue;
        };

        let fd_dir = proc_path.join(name_str.to_string()).join("fd");
        let Ok(fd_entries) = std::fs::read_dir(&fd_dir) else {
            continue;
        };

        for fd_entry in fd_entries.flatten() {
            let Ok(link) = std::fs::read_link(fd_entry.path()) else {
                continue;
            };
            let link_str = link.to_string_lossy();
            if let Some(inode) = parse_socket_inode(&link_str) {
                map.entry(inode).or_insert_with(|| {
                    let process_name = read_process_name(proc_path, pid);
                    (pid, process_name)
                });
            }
        }
    }

    map
}

/// Read listening ports from parameterized paths (for testing).
pub fn read_listening_ports_from(
    tcp_path: &Path,
    tcp6_path: &Path,
    proc_path: &Path,
) -> Vec<ListeningPort> {
    let mut result = Vec::new();

    // Build inode → (pid, process) map
    let inode_map = build_inode_pid_map(proc_path);

    // Parse tcp
    if let Ok(content) = std::fs::read_to_string(tcp_path) {
        let entries = parse_proc_net_tcp(&content);
        for entry in filter_listening(&entries) {
            let (pid, process) = inode_map
                .get(&entry.inode)
                .map_or((None, None), |(p, n)| (Some(*p), Some(n.clone())));

            result.push(ListeningPort {
                port: entry.local_port,
                bind: entry.local_addr.clone(),
                protocol: "tcp".to_string(),
                pid,
                process,
            });
        }
    }

    // Parse tcp6
    if let Ok(content) = std::fs::read_to_string(tcp6_path) {
        let entries = parse_proc_net_tcp6(&content);
        for entry in filter_listening(&entries) {
            let (pid, process) = inode_map
                .get(&entry.inode)
                .map_or((None, None), |(p, n)| (Some(*p), Some(n.clone())));

            result.push(ListeningPort {
                port: entry.local_port,
                bind: entry.local_addr.clone(),
                protocol: "tcp6".to_string(),
                pid,
                process,
            });
        }
    }

    result
}

/// Read listening ports from production paths.
pub fn read_listening_ports() -> Vec<ListeningPort> {
    read_listening_ports_from(
        Path::new("/proc/net/tcp"),
        Path::new("/proc/net/tcp6"),
        Path::new("/proc"),
    )
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    const PROC_NET_TCP: &str = "\
  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 0100007F:0035 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12345 1 0000000000000000 100 0 0 10 0
   1: 00000000:0016 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 23456 1 0000000000000000 100 0 0 10 0
   2: 0100007F:0050 0100007F:C000 01 00000000:00000000 00:00000000 00000000     0        0 34567 1 0000000000000000 100 0 0 10 0
";

    const PROC_NET_TCP6: &str = "\
  sl  local_address                         remote_address                        st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000000000000000000000000000:0050 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 44444 1 0000000000000000 100 0 0 10 0
   1: 00000000000000000000000001000000:0035 00000000000000000000000000000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 55555 1 0000000000000000 100 0 0 10 0
";

    #[test]
    fn decode_ipv4_hex_loopback() {
        assert_eq!(decode_ipv4_hex("0100007F"), Some("127.0.0.1".to_string()));
    }

    #[test]
    fn decode_ipv4_hex_any() {
        assert_eq!(decode_ipv4_hex("00000000"), Some("0.0.0.0".to_string()));
    }

    #[test]
    fn decode_ipv4_hex_real_ip() {
        // 192.168.1.100 in little-endian hex: 6401A8C0
        assert_eq!(
            decode_ipv4_hex("6401A8C0"),
            Some("192.168.1.100".to_string())
        );
    }

    #[test]
    fn decode_ipv4_hex_invalid_len() {
        assert_eq!(decode_ipv4_hex("0100"), None);
        assert_eq!(decode_ipv4_hex("0100007F00"), None);
    }

    #[test]
    fn decode_ipv6_hex_any() {
        assert_eq!(
            decode_ipv6_hex("00000000000000000000000000000000"),
            Some("::".to_string())
        );
    }

    #[test]
    fn decode_ipv6_hex_loopback() {
        assert_eq!(
            decode_ipv6_hex("00000000000000000000000001000000"),
            Some("::1".to_string())
        );
    }

    #[test]
    fn decode_ipv6_hex_invalid_len() {
        assert_eq!(decode_ipv6_hex("0000"), None);
    }

    #[test]
    fn parse_proc_net_tcp_entries() {
        let entries = parse_proc_net_tcp(PROC_NET_TCP);
        assert_eq!(entries.len(), 3);

        // First entry: 127.0.0.1:53 LISTEN
        assert_eq!(entries[0].local_addr, "127.0.0.1");
        assert_eq!(entries[0].local_port, 53);
        assert_eq!(entries[0].state, 0x0A);
        assert_eq!(entries[0].inode, 12345);

        // Second entry: 0.0.0.0:22 LISTEN
        assert_eq!(entries[1].local_addr, "0.0.0.0");
        assert_eq!(entries[1].local_port, 22);
        assert_eq!(entries[1].state, 0x0A);
        assert_eq!(entries[1].inode, 23456);

        // Third entry: ESTABLISHED (state 01)
        assert_eq!(entries[2].state, 0x01);
    }

    #[test]
    fn parse_proc_net_tcp6_entries() {
        let entries = parse_proc_net_tcp6(PROC_NET_TCP6);
        assert_eq!(entries.len(), 2);

        // First: :::80 LISTEN
        assert_eq!(entries[0].local_addr, "::");
        assert_eq!(entries[0].local_port, 80);
        assert_eq!(entries[0].state, 0x0A);

        // Second: ::1:53 LISTEN
        assert_eq!(entries[1].local_addr, "::1");
        assert_eq!(entries[1].local_port, 53);
    }

    #[test]
    fn filter_listening_only() {
        let entries = parse_proc_net_tcp(PROC_NET_TCP);
        let listening = filter_listening(&entries);
        assert_eq!(listening.len(), 2);
        assert!(listening.iter().all(|e| e.state == 0x0A));
    }

    #[test]
    fn parse_socket_inode_valid() {
        assert_eq!(parse_socket_inode("socket:[12345]"), Some(12345));
        assert_eq!(parse_socket_inode("socket:[0]"), Some(0));
    }

    #[test]
    fn parse_socket_inode_invalid() {
        assert_eq!(parse_socket_inode("pipe:[12345]"), None);
        assert_eq!(parse_socket_inode("socket:12345]"), None);
        assert_eq!(parse_socket_inode("socket:[abc]"), None);
        assert_eq!(parse_socket_inode(""), None);
    }

    #[test]
    fn empty_proc_net_tcp() {
        let content = "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n";
        let entries = parse_proc_net_tcp(content);
        assert!(entries.is_empty());
    }

    #[test]
    fn filter_listening_empty() {
        let entries: Vec<TcpEntry> = vec![];
        let listening = filter_listening(&entries);
        assert!(listening.is_empty());
    }

    #[test]
    fn filter_listening_no_listen_state() {
        let entries = vec![TcpEntry {
            local_addr: "0.0.0.0".to_string(),
            local_port: 80,
            state: 0x01, // ESTABLISHED
            inode: 1,
            is_ipv6: false,
        }];
        let listening = filter_listening(&entries);
        assert!(listening.is_empty());
    }

    #[test]
    fn build_inode_pid_map_nonexistent_dir() {
        let map = build_inode_pid_map(Path::new("/nonexistent_dir_xyz"));
        assert!(map.is_empty());
    }

    // --- decode_ipv6_hex edge cases ---

    #[test]
    fn decode_ipv6_hex_ipv4_mapped() {
        // ::ffff:127.0.0.1
        // The code checks for "0000:0000:0000:0000:0000:ffff:" prefix after BE conversion.
        // Each 32-bit word is stored in little-endian in /proc/net/tcp6.
        // Words 0-3: all zeros (8 hex chars each)
        // Word 4: needs to produce 0000:ffff after swap_bytes
        //   BE = 0x0000ffff → LE bytes: ff ff 00 00 → hex: FFFF0000
        // Word 5: 127.0.0.1 → 7f00:0001 → BE = 0x7f000001 → LE: 0100007F
        assert_eq!(
            decode_ipv6_hex("0000000000000000FFFF00000100007F"),
            Some("::ffff:127.0.0.1".to_string())
        );
    }

    #[test]
    fn decode_ipv6_hex_regular_address() {
        // A non-special IPv6 address — should return the full colon notation
        // fe80::1 = fe80:0000:0000:0000:0000:0000:0000:0001
        // In /proc/net/tcp6 each 32-bit word is little-endian:
        // Word 0: fe80:0000 → bytes 00 00 80 FE → LE hex: FE800000
        // But we need the LE representation. Let's pick a simpler address.
        // 2001:0db8:0000:0000:0000:0000:0000:0001
        // Word 0: 2001:0db8 → big-endian 0x20010db8 → le bytes b8 0d 01 20 → LE hex: B80D0120
        // Word 1: 0000:0000 → 00000000
        // Word 2: 0000:0000 → 00000000
        // Word 3: 0000:0001 → big-endian 0x00000001 → le bytes 01 00 00 00 → LE hex: 01000000
        let result = decode_ipv6_hex("B80D012000000000000000000100000");
        // 31 chars → invalid length
        assert_eq!(result, None);

        // Correct 32-char version:
        let result = decode_ipv6_hex("B80D01200000000000000000010000000");
        // 33 chars → invalid
        assert_eq!(result, None);

        // Actual valid non-special address: use fd00::1
        // fd00:0000:0000:0000:0000:0000:0000:0001
        // Word 0: fd00:0000 → BE 0xfd000000 → LE bytes: 00 00 00 fd → hex 000000FD
        // Word 1: 0000:0000 → 00000000
        // Word 2: 0000:0000 → 00000000
        // Word 3: 0000:0001 → BE 0x00000001 → LE bytes: 01 00 00 00 → 01000000
        let result = decode_ipv6_hex("000000FD000000000000000001000000");
        assert_eq!(
            result,
            Some("fd00:0000:0000:0000:0000:0000:0000:0001".to_string())
        );
    }

    // --- parse_tcp_line edge cases ---

    #[test]
    fn parse_tcp_line_too_few_fields() {
        assert!(parse_tcp_line("   0: 0100007F:0035 00000000:0000", false).is_none());
    }

    #[test]
    fn parse_tcp_line_bad_address_format() {
        // address without colon separator
        let line = "   0: 0100007F0035 00000000:0000 0A 00000000:00000000 00:00000000 00000000     0        0 12345 1 0000000000000000 100 0 0 10 0";
        assert!(parse_tcp_line(line, false).is_none());
    }

    // --- read_process_name ---

    #[test]
    fn read_process_name_from_tempdir() {
        let dir = tempfile::tempdir().unwrap();
        let pid_dir = dir.path().join("1234");
        std::fs::create_dir_all(&pid_dir).unwrap();
        std::fs::write(pid_dir.join("comm"), "sshd\n").unwrap();
        assert_eq!(read_process_name(dir.path(), 1234), "sshd");
    }

    #[test]
    fn read_process_name_missing() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_process_name(dir.path(), 9999), "");
    }

    // --- build_inode_pid_map with symlinks ---

    #[cfg(unix)]
    #[test]
    fn build_inode_pid_map_with_symlinks() {
        let dir = tempfile::tempdir().unwrap();
        let pid_dir = dir.path().join("42");
        let fd_dir = pid_dir.join("fd");
        std::fs::create_dir_all(&fd_dir).unwrap();
        std::fs::write(pid_dir.join("comm"), "nginx\n").unwrap();

        // Create symlinks that look like socket:[inode]
        std::os::unix::fs::symlink("socket:[99999]", fd_dir.join("3")).unwrap();
        std::os::unix::fs::symlink("/dev/null", fd_dir.join("0")).unwrap(); // non-socket

        let map = build_inode_pid_map(dir.path());
        assert_eq!(map.len(), 1);
        let (pid, name) = map.get(&99999).unwrap();
        assert_eq!(*pid, 42);
        assert_eq!(name, "nginx");
    }

    // --- read_listening_ports_from with tempdir ---

    #[cfg(unix)]
    #[test]
    fn read_listening_ports_from_tempdir() {
        let dir = tempfile::tempdir().unwrap();

        // Write mock /proc/net/tcp
        let tcp_path = dir.path().join("tcp");
        std::fs::write(&tcp_path, PROC_NET_TCP).unwrap();

        // Write mock /proc/net/tcp6
        let tcp6_path = dir.path().join("tcp6");
        std::fs::write(&tcp6_path, PROC_NET_TCP6).unwrap();

        // Create a mock proc dir with a pid that owns inode 12345
        let proc_dir = dir.path().join("proc");
        let pid_dir = proc_dir.join("100");
        let fd_dir = pid_dir.join("fd");
        std::fs::create_dir_all(&fd_dir).unwrap();
        std::fs::write(pid_dir.join("comm"), "dnsmasq\n").unwrap();
        std::os::unix::fs::symlink("socket:[12345]", fd_dir.join("4")).unwrap();

        let ports = read_listening_ports_from(&tcp_path, &tcp6_path, &proc_dir);

        // Should have 2 tcp LISTEN + 2 tcp6 LISTEN = 4
        assert_eq!(ports.len(), 4);

        // First port: 127.0.0.1:53 tcp with pid 100
        let dns = ports
            .iter()
            .find(|p| p.port == 53 && p.protocol == "tcp")
            .unwrap();
        assert_eq!(dns.bind, "127.0.0.1");
        assert_eq!(dns.pid, Some(100));
        assert_eq!(dns.process, Some("dnsmasq".into()));

        // 0.0.0.0:22 should have no pid (inode 23456 not in our map)
        let ssh = ports.iter().find(|p| p.port == 22).unwrap();
        assert_eq!(ssh.pid, None);
    }
}
