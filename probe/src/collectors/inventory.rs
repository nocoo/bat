//! Host inventory collectors: virtualization, network interfaces, block devices, boot mode.
//!
//! All collectors follow the parse/read pattern:
//! - `parse_*()` — pure function for testing
//! - `read_*_from()` — parameterized path for testing
//! - `read_*()` — hardcoded real path

use serde::Serialize;

// ── Virtualization detection ─────────────────────────────────────────

/// Known vendor → virtualization type mappings.
fn detect_virt_from_vendor(vendor: &str) -> &'static str {
    let v = vendor.trim();
    if v == "QEMU" {
        return "kvm";
    }
    if v == "Amazon EC2" {
        return "aws";
    }
    if v == "Microsoft Corporation" {
        return "hyperv";
    }
    if v == "Google" {
        return "gce";
    }
    if v == "DigitalOcean" {
        return "digitalocean";
    }
    if v == "Hetzner" {
        return "hetzner";
    }
    if v.starts_with("VMware") {
        return "vmware";
    }
    if v.starts_with("Xen") {
        return "xen";
    }
    if v == "innotek GmbH" {
        return "virtualbox";
    }
    ""
}

/// Detect virtualization type from DMI `sys_vendor`.
/// Falls back to checking `/proc/1/cgroup` for container indicators.
pub fn parse_virtualization(sys_vendor: Option<&str>, cgroup_content: Option<&str>) -> String {
    if let Some(vendor) = sys_vendor {
        let result = detect_virt_from_vendor(vendor);
        if !result.is_empty() {
            return result.to_string();
        }
    }

    // Fallback: container detection from cgroup
    if let Some(cgroup) = cgroup_content
        && (cgroup.contains("/docker/") || cgroup.contains("/lxc/"))
    {
        return "container".to_string();
    }

    // sys_vendor was readable but not a known VM vendor → bare metal
    if sys_vendor.is_some() {
        return "bare-metal".to_string();
    }

    // sys_vendor unreadable and no container indicators → unknown, send empty
    String::new()
}

/// Read virtualization type from sysfs/procfs.
pub fn read_virtualization_from(sys_vendor_path: &str, cgroup_path: &str) -> String {
    let vendor = std::fs::read_to_string(sys_vendor_path).ok();
    let cgroup = std::fs::read_to_string(cgroup_path).ok();
    parse_virtualization(vendor.as_deref(), cgroup.as_deref())
}

/// Read virtualization type from real system paths.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_virtualization() -> String {
    read_virtualization_from("/sys/class/dmi/id/sys_vendor", "/proc/1/cgroup")
}

// ── Network interfaces ───────────────────────────────────────────────

/// A network interface with identity information.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct NetInterface {
    pub iface: String,
    pub mac: String,
    pub ipv4: Vec<String>,
    pub ipv6: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub speed_mbps: Option<i32>,
}

/// Parse MAC address from sysfs content (e.g. `/sys/class/net/eth0/address`).
pub fn parse_mac(content: &str) -> String {
    content.trim().to_string()
}

/// Parse link speed from sysfs content (e.g. `/sys/class/net/eth0/speed`).
/// Returns None if unreadable or -1 (virtual interfaces report -1).
pub fn parse_speed(content: &str) -> Option<i32> {
    let val: i32 = content.trim().parse().ok()?;
    if val < 0 { None } else { Some(val) }
}

/// Read network interface identity from sysfs.
///
/// For each interface in `/sys/class/net/` (excluding `lo`):
/// - MAC from `{iface}/address`
/// - Speed from `{iface}/speed`
/// - IPv4/IPv6 from provided `ip_map` (pre-parsed from `getifaddrs` or `/proc/net/if_inet6`)
pub fn read_net_interfaces_from(
    sysfs_net_dir: &str,
    ip_map: &std::collections::HashMap<String, (Vec<String>, Vec<String>)>,
) -> Vec<NetInterface> {
    let mut interfaces = Vec::new();

    let Ok(entries) = std::fs::read_dir(sysfs_net_dir) else {
        return interfaces;
    };

    for entry in entries.flatten() {
        let iface = entry.file_name().to_string_lossy().to_string();

        // Skip loopback
        if iface == "lo" {
            continue;
        }

        let base = format!("{sysfs_net_dir}/{iface}");

        let mac = std::fs::read_to_string(format!("{base}/address"))
            .map(|c| parse_mac(&c))
            .unwrap_or_default();

        let speed_mbps = std::fs::read_to_string(format!("{base}/speed"))
            .ok()
            .and_then(|c| parse_speed(&c));

        let (ipv4, ipv6) = ip_map.get(&iface).cloned().unwrap_or_default();

        interfaces.push(NetInterface {
            iface,
            mac,
            ipv4,
            ipv6,
            speed_mbps,
        });
    }

    interfaces.sort_by(|a, b| a.iface.cmp(&b.iface));
    interfaces
}

/// Parse IPv4 and IPv6 addresses per interface from `/proc/net/fib_trie` and `/proc/net/if_inet6`.
///
/// This is a simpler alternative to `getifaddrs()` that doesn't require libc FFI.
/// Parses `/proc/net/if_inet6` for IPv6 and iterates sysfs operstate files to find
/// interfaces, then reads addresses from `/proc/net/fib_trie` or falls back to
/// reading from `/proc/net/fib_trie` output.
///
/// For simplicity, we parse addresses from dedicated proc files.
pub fn parse_if_inet6(content: &str) -> std::collections::HashMap<String, Vec<String>> {
    let mut map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();

    for line in content.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        // Format: hex_addr idx prefix_len scope flags iface_name
        if fields.len() >= 6 {
            let hex_addr = fields[0];
            let iface = fields[5];

            if let Some(addr) = hex_ipv6_to_string(hex_addr) {
                map.entry(iface.to_string()).or_default().push(addr);
            }
        }
    }

    map
}

/// Convert a 32-char hex IPv6 address to standard notation.
fn hex_ipv6_to_string(hex: &str) -> Option<String> {
    if hex.len() != 32 {
        return None;
    }

    let groups: Vec<String> = (0..8)
        .map(|i| {
            let start = i * 4;
            let group = &hex[start..start + 4];
            // Strip leading zeros but keep at least one digit
            let trimmed = group.trim_start_matches('0');
            if trimmed.is_empty() {
                "0".to_string()
            } else {
                trimmed.to_string()
            }
        })
        .collect();

    Some(groups.join(":"))
}

// ── Block devices ────────────────────────────────────────────────────

/// A block device with identity information.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
pub struct BlockDevice {
    pub device: String,
    pub size_bytes: u64,
    pub rotational: bool,
}

/// Parse block device size from sysfs `size` file content.
/// The file contains sector count; each sector is 512 bytes.
pub fn parse_block_size(content: &str) -> Option<u64> {
    let sectors: u64 = content.trim().parse().ok()?;
    Some(sectors * 512)
}

/// Parse rotational flag from sysfs content.
/// 0 = SSD/NVMe, 1 = HDD.
pub fn parse_rotational(content: &str) -> Option<bool> {
    match content.trim() {
        "0" => Some(false),
        "1" => Some(true),
        _ => None,
    }
}

/// Check if a block device name should be excluded.
fn is_excluded_device(name: &str) -> bool {
    name.starts_with("loop") || name.starts_with("ram") || name.starts_with("dm-")
}

/// Check if a device name is a partition (e.g., sda1, nvme0n1p1) rather than a whole device.
fn is_partition(name: &str) -> bool {
    // NVMe: nvme0n1p1 — partition has 'p' after 'n<digit>'
    if name.starts_with("nvme") {
        if let Some(pos) = name.rfind('p') {
            // Check that char before 'p' is a digit (part of nN)
            let before = &name[..pos];
            if before.ends_with(|c: char| c.is_ascii_digit())
                && name[pos + 1..].chars().all(|c| c.is_ascii_digit())
                && !name[pos + 1..].is_empty()
            {
                return true;
            }
        }
        return false;
    }

    // sd*, vd*, xvd*, hd*: partition has trailing digits
    if name.starts_with("sd")
        || name.starts_with("vd")
        || name.starts_with("xvd")
        || name.starts_with("hd")
    {
        // Device name ends with letter (sda), partition ends with digit (sda1)
        return name.ends_with(|c: char| c.is_ascii_digit());
    }

    false
}

/// Read block devices from sysfs `/sys/block/` directory.
pub fn read_block_devices_from(sysfs_block_dir: &str) -> Vec<BlockDevice> {
    let mut devices = Vec::new();

    let Ok(entries) = std::fs::read_dir(sysfs_block_dir) else {
        return devices;
    };

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();

        if is_excluded_device(&name) || is_partition(&name) {
            continue;
        }

        let base = format!("{sysfs_block_dir}/{name}");

        let size_bytes = std::fs::read_to_string(format!("{base}/size"))
            .ok()
            .and_then(|c| parse_block_size(&c))
            .unwrap_or(0);

        // Skip zero-size devices
        if size_bytes == 0 {
            continue;
        }

        let rotational = std::fs::read_to_string(format!("{base}/queue/rotational"))
            .ok()
            .and_then(|c| parse_rotational(&c))
            .unwrap_or(false);

        devices.push(BlockDevice {
            device: name,
            size_bytes,
            rotational,
        });
    }

    devices.sort_by(|a, b| a.device.cmp(&b.device));
    devices
}

/// Read block devices from real sysfs path.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_block_devices() -> Vec<BlockDevice> {
    read_block_devices_from("/sys/block")
}

// ── Boot mode ────────────────────────────────────────────────────────

/// Detect boot mode by checking for EFI firmware directory.
pub fn detect_boot_mode_from(efi_path: &str) -> String {
    if std::fs::metadata(efi_path).is_ok() {
        "uefi".to_string()
    } else {
        "bios".to_string()
    }
}

/// Detect boot mode from real system path.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn detect_boot_mode() -> String {
    detect_boot_mode_from("/sys/firmware/efi")
}

// ── Timezone (Tier 2: slow-drift) ────────────────────────────────────

/// Parse timezone from `/etc/timezone` content.
pub fn parse_timezone(content: &str) -> String {
    content.trim().to_string()
}

/// Extract timezone from a `/etc/localtime` symlink target.
/// The symlink typically points to `/usr/share/zoneinfo/America/New_York`.
pub fn parse_localtime_link(target: &str) -> String {
    target
        .find("zoneinfo/")
        .map_or_else(String::new, |pos| target[pos + 9..].to_string())
}

/// Read timezone with fallback: `/etc/timezone` → `readlink /etc/localtime`.
pub fn read_timezone_from(timezone_path: &str, localtime_path: &str) -> String {
    // Try /etc/timezone first
    if let Ok(content) = std::fs::read_to_string(timezone_path) {
        let tz = parse_timezone(&content);
        if !tz.is_empty() {
            return tz;
        }
    }

    // Fallback: readlink /etc/localtime
    if let Ok(target) = std::fs::read_link(localtime_path) {
        let tz = parse_localtime_link(&target.to_string_lossy());
        if !tz.is_empty() {
            return tz;
        }
    }

    String::new()
}

/// Read timezone from real system paths.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_timezone() -> String {
    read_timezone_from("/etc/timezone", "/etc/localtime")
}

// ── DNS configuration (Tier 2: slow-drift) ───────────────────────────

/// Parsed DNS configuration from `/etc/resolv.conf`.
#[derive(Debug, Default)]
pub struct DnsConfig {
    pub resolvers: Vec<String>,
    pub search: Vec<String>,
}

/// Parse `/etc/resolv.conf` for nameserver and search entries.
pub fn parse_resolv_conf(content: &str) -> DnsConfig {
    let mut config = DnsConfig::default();

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('#') || line.is_empty() {
            continue;
        }

        if let Some(rest) = line.strip_prefix("nameserver") {
            if let Some(addr) = rest.split_whitespace().next() {
                config.resolvers.push(addr.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("search") {
            config.search = rest.split_whitespace().map(String::from).collect();
        }
    }

    config
}

/// Read DNS configuration from a file (parameterized path for testing).
pub fn read_dns_config_from(path: &str) -> DnsConfig {
    std::fs::read_to_string(path)
        .map(|c| parse_resolv_conf(&c))
        .unwrap_or_default()
}

/// Read DNS configuration from `/etc/resolv.conf`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_dns_config() -> DnsConfig {
    read_dns_config_from("/etc/resolv.conf")
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Virtualization tests ─────────────────────────────────────────

    #[test]
    fn detect_virt_qemu() {
        assert_eq!(parse_virtualization(Some("QEMU\n"), None), "kvm");
    }

    #[test]
    fn detect_virt_aws() {
        assert_eq!(parse_virtualization(Some("Amazon EC2"), None), "aws");
    }

    #[test]
    fn detect_virt_hyperv() {
        assert_eq!(
            parse_virtualization(Some("Microsoft Corporation"), None),
            "hyperv"
        );
    }

    #[test]
    fn detect_virt_gce() {
        assert_eq!(parse_virtualization(Some("Google"), None), "gce");
    }

    #[test]
    fn detect_virt_digitalocean() {
        assert_eq!(
            parse_virtualization(Some("DigitalOcean"), None),
            "digitalocean"
        );
    }

    #[test]
    fn detect_virt_hetzner() {
        assert_eq!(parse_virtualization(Some("Hetzner"), None), "hetzner");
    }

    #[test]
    fn detect_virt_vmware() {
        assert_eq!(parse_virtualization(Some("VMware, Inc."), None), "vmware");
    }

    #[test]
    fn detect_virt_xen() {
        assert_eq!(parse_virtualization(Some("Xen"), None), "xen");
    }

    #[test]
    fn detect_virt_virtualbox() {
        assert_eq!(
            parse_virtualization(Some("innotek GmbH"), None),
            "virtualbox"
        );
    }

    #[test]
    fn detect_virt_bare_metal() {
        assert_eq!(parse_virtualization(Some("Dell Inc."), None), "bare-metal");
    }

    #[test]
    fn detect_virt_container_docker() {
        assert_eq!(
            parse_virtualization(None, Some("12:blkio:/docker/abc123\n")),
            "container"
        );
    }

    #[test]
    fn detect_virt_container_lxc() {
        assert_eq!(
            parse_virtualization(None, Some("12:blkio:/lxc/mycontainer\n")),
            "container"
        );
    }

    #[test]
    fn detect_virt_unknown() {
        assert_eq!(parse_virtualization(None, None), "");
    }

    #[test]
    fn detect_virt_no_container_no_dmi() {
        assert_eq!(parse_virtualization(None, Some("0::/init.scope\n")), "");
    }

    #[test]
    fn read_virtualization_from_tempdir() {
        let dir = tempfile::tempdir().unwrap();
        let vendor_path = dir.path().join("sys_vendor");
        std::fs::write(&vendor_path, "QEMU\n").unwrap();
        let cgroup_path = dir.path().join("cgroup");
        std::fs::write(&cgroup_path, "").unwrap();

        let result =
            read_virtualization_from(vendor_path.to_str().unwrap(), cgroup_path.to_str().unwrap());
        assert_eq!(result, "kvm");
    }

    // ── Network interface tests ──────────────────────────────────────

    #[test]
    fn parse_mac_normal() {
        assert_eq!(parse_mac("aa:bb:cc:dd:ee:ff\n"), "aa:bb:cc:dd:ee:ff");
    }

    #[test]
    fn parse_speed_normal() {
        assert_eq!(parse_speed("1000\n"), Some(1000));
    }

    #[test]
    fn parse_speed_virtual_iface() {
        assert_eq!(parse_speed("-1\n"), None);
    }

    #[test]
    fn parse_speed_invalid() {
        assert_eq!(parse_speed("unknown\n"), None);
    }

    #[test]
    fn parse_if_inet6_normal() {
        let content = "fe800000000000000000000000000001 02 40 20 80 eth0\n\
                        00000000000000000000000000000001 01 80 10 80 lo\n";
        let map = parse_if_inet6(content);
        assert_eq!(map.get("eth0").unwrap(), &["fe80:0:0:0:0:0:0:1"]);
        assert_eq!(map.get("lo").unwrap(), &["0:0:0:0:0:0:0:1"]);
    }

    #[test]
    fn parse_if_inet6_empty() {
        let map = parse_if_inet6("");
        assert!(map.is_empty());
    }

    #[test]
    fn hex_ipv6_to_string_valid() {
        assert_eq!(
            hex_ipv6_to_string("fe800000000000000000000000000001"),
            Some("fe80:0:0:0:0:0:0:1".to_string())
        );
    }

    #[test]
    fn hex_ipv6_to_string_invalid_length() {
        assert_eq!(hex_ipv6_to_string("fe80"), None);
    }

    #[test]
    fn read_net_interfaces_from_tempdir() {
        let dir = tempfile::tempdir().unwrap();
        let net_dir = dir.path().join("net");
        std::fs::create_dir(&net_dir).unwrap();

        // Create eth0
        let eth0 = net_dir.join("eth0");
        std::fs::create_dir(&eth0).unwrap();
        std::fs::write(eth0.join("address"), "aa:bb:cc:dd:ee:ff\n").unwrap();
        std::fs::write(eth0.join("speed"), "1000\n").unwrap();

        // Create lo (should be excluded)
        let lo = net_dir.join("lo");
        std::fs::create_dir(&lo).unwrap();
        std::fs::write(lo.join("address"), "00:00:00:00:00:00\n").unwrap();

        let mut ip_map = std::collections::HashMap::new();
        ip_map.insert(
            "eth0".to_string(),
            (vec!["10.0.1.5".to_string()], vec!["fe80::1".to_string()]),
        );

        let ifaces = read_net_interfaces_from(net_dir.to_str().unwrap(), &ip_map);
        assert_eq!(ifaces.len(), 1);
        assert_eq!(ifaces[0].iface, "eth0");
        assert_eq!(ifaces[0].mac, "aa:bb:cc:dd:ee:ff");
        assert_eq!(ifaces[0].speed_mbps, Some(1000));
        assert_eq!(ifaces[0].ipv4, vec!["10.0.1.5"]);
        assert_eq!(ifaces[0].ipv6, vec!["fe80::1"]);
    }

    #[test]
    fn read_net_interfaces_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let net_dir = dir.path().join("net");
        std::fs::create_dir(&net_dir).unwrap();

        let ip_map = std::collections::HashMap::new();
        let ifaces = read_net_interfaces_from(net_dir.to_str().unwrap(), &ip_map);
        assert!(ifaces.is_empty());
    }

    #[test]
    fn read_net_interfaces_missing_dir() {
        let ip_map = std::collections::HashMap::new();
        let ifaces = read_net_interfaces_from("/nonexistent/path", &ip_map);
        assert!(ifaces.is_empty());
    }

    // ── Block device tests ───────────────────────────────────────────

    #[test]
    fn parse_block_size_normal() {
        assert_eq!(parse_block_size("976773168\n"), Some(976773168 * 512));
    }

    #[test]
    fn parse_block_size_zero() {
        assert_eq!(parse_block_size("0\n"), Some(0));
    }

    #[test]
    fn parse_block_size_invalid() {
        assert_eq!(parse_block_size("not_a_number\n"), None);
    }

    #[test]
    fn parse_rotational_ssd() {
        assert_eq!(parse_rotational("0\n"), Some(false));
    }

    #[test]
    fn parse_rotational_hdd() {
        assert_eq!(parse_rotational("1\n"), Some(true));
    }

    #[test]
    fn parse_rotational_invalid() {
        assert_eq!(parse_rotational("x\n"), None);
    }

    #[test]
    fn is_excluded_device_loop() {
        assert!(is_excluded_device("loop0"));
        assert!(is_excluded_device("loop123"));
    }

    #[test]
    fn is_excluded_device_ram() {
        assert!(is_excluded_device("ram0"));
    }

    #[test]
    fn is_excluded_device_dm() {
        assert!(is_excluded_device("dm-0"));
    }

    #[test]
    fn is_excluded_device_sda() {
        assert!(!is_excluded_device("sda"));
    }

    #[test]
    fn is_partition_sd() {
        assert!(is_partition("sda1"));
        assert!(is_partition("sdb2"));
        assert!(!is_partition("sda"));
    }

    #[test]
    fn is_partition_nvme() {
        assert!(is_partition("nvme0n1p1"));
        assert!(is_partition("nvme0n1p2"));
        assert!(!is_partition("nvme0n1"));
    }

    #[test]
    fn is_partition_vd() {
        assert!(is_partition("vda1"));
        assert!(!is_partition("vda"));
    }

    #[test]
    fn read_block_devices_from_tempdir() {
        let dir = tempfile::tempdir().unwrap();
        let block_dir = dir.path().join("block");
        std::fs::create_dir(&block_dir).unwrap();

        // Create sda (SSD)
        let sda = block_dir.join("sda");
        std::fs::create_dir_all(sda.join("queue")).unwrap();
        std::fs::write(sda.join("size"), "976773168\n").unwrap();
        std::fs::write(sda.join("queue/rotational"), "0\n").unwrap();

        // Create loop0 (should be excluded)
        let loop0 = block_dir.join("loop0");
        std::fs::create_dir(&loop0).unwrap();
        std::fs::write(loop0.join("size"), "1000\n").unwrap();

        let devices = read_block_devices_from(block_dir.to_str().unwrap());
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].device, "sda");
        assert_eq!(devices[0].size_bytes, 976773168 * 512);
        assert!(!devices[0].rotational);
    }

    #[test]
    fn read_block_devices_skips_zero_size() {
        let dir = tempfile::tempdir().unwrap();
        let block_dir = dir.path().join("block");
        std::fs::create_dir(&block_dir).unwrap();

        let sda = block_dir.join("sda");
        std::fs::create_dir_all(sda.join("queue")).unwrap();
        std::fs::write(sda.join("size"), "0\n").unwrap();
        std::fs::write(sda.join("queue/rotational"), "0\n").unwrap();

        let devices = read_block_devices_from(block_dir.to_str().unwrap());
        assert!(devices.is_empty());
    }

    #[test]
    fn read_block_devices_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let block_dir = dir.path().join("block");
        std::fs::create_dir(&block_dir).unwrap();

        let devices = read_block_devices_from(block_dir.to_str().unwrap());
        assert!(devices.is_empty());
    }

    #[test]
    fn read_block_devices_missing_dir() {
        let devices = read_block_devices_from("/nonexistent/path");
        assert!(devices.is_empty());
    }

    // ── Boot mode tests ──────────────────────────────────────────────

    #[test]
    fn detect_boot_mode_uefi() {
        let dir = tempfile::tempdir().unwrap();
        let efi = dir.path().join("efi");
        std::fs::create_dir(&efi).unwrap();
        assert_eq!(detect_boot_mode_from(efi.to_str().unwrap()), "uefi");
    }

    #[test]
    fn detect_boot_mode_bios() {
        assert_eq!(detect_boot_mode_from("/nonexistent/efi"), "bios");
    }

    // ── Timezone tests ───────────────────────────────────────────────

    #[test]
    fn parse_timezone_normal() {
        assert_eq!(parse_timezone("America/New_York\n"), "America/New_York");
    }

    #[test]
    fn parse_timezone_utc() {
        assert_eq!(parse_timezone("UTC\n"), "UTC");
    }

    #[test]
    fn parse_timezone_empty() {
        assert_eq!(parse_timezone(""), "");
    }

    #[test]
    fn parse_localtime_link_normal() {
        assert_eq!(
            parse_localtime_link("/usr/share/zoneinfo/America/New_York"),
            "America/New_York"
        );
    }

    #[test]
    fn parse_localtime_link_utc() {
        assert_eq!(parse_localtime_link("/usr/share/zoneinfo/UTC"), "UTC");
    }

    #[test]
    fn parse_localtime_link_no_zoneinfo() {
        assert_eq!(parse_localtime_link("/some/other/path"), "");
    }

    #[test]
    fn read_timezone_from_file() {
        let dir = tempfile::tempdir().unwrap();
        let tz_path = dir.path().join("timezone");
        std::fs::write(&tz_path, "Europe/Berlin\n").unwrap();
        let lt_path = dir.path().join("localtime");

        assert_eq!(
            read_timezone_from(tz_path.to_str().unwrap(), lt_path.to_str().unwrap()),
            "Europe/Berlin"
        );
    }

    #[test]
    fn read_timezone_fallback_symlink() {
        let dir = tempfile::tempdir().unwrap();
        let tz_path = dir.path().join("timezone_missing");
        let lt_path = dir.path().join("localtime");
        // Create symlink to a zoneinfo-like path
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/usr/share/zoneinfo/Asia/Tokyo", &lt_path).unwrap();
            assert_eq!(
                read_timezone_from(tz_path.to_str().unwrap(), lt_path.to_str().unwrap()),
                "Asia/Tokyo"
            );
        }
    }

    #[test]
    fn read_timezone_both_missing() {
        assert_eq!(
            read_timezone_from("/nonexistent/timezone", "/nonexistent/localtime"),
            ""
        );
    }

    // ── DNS tests ────────────────────────────────────────────────────

    #[test]
    fn parse_resolv_conf_normal() {
        let content = "\
# Generated by NetworkManager
nameserver 1.1.1.1
nameserver 8.8.8.8
search example.com internal.corp
";
        let config = parse_resolv_conf(content);
        assert_eq!(config.resolvers, vec!["1.1.1.1", "8.8.8.8"]);
        assert_eq!(config.search, vec!["example.com", "internal.corp"]);
    }

    #[test]
    fn parse_resolv_conf_no_search() {
        let content = "nameserver 1.1.1.1\n";
        let config = parse_resolv_conf(content);
        assert_eq!(config.resolvers, vec!["1.1.1.1"]);
        assert!(config.search.is_empty());
    }

    #[test]
    fn parse_resolv_conf_empty() {
        let config = parse_resolv_conf("");
        assert!(config.resolvers.is_empty());
        assert!(config.search.is_empty());
    }

    #[test]
    fn parse_resolv_conf_comments_only() {
        let content = "# comment\n# another comment\n";
        let config = parse_resolv_conf(content);
        assert!(config.resolvers.is_empty());
    }

    #[test]
    fn read_dns_config_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("resolv.conf");
        std::fs::write(&path, "nameserver 8.8.4.4\nsearch test.local\n").unwrap();
        let config = read_dns_config_from(path.to_str().unwrap());
        assert_eq!(config.resolvers, vec!["8.8.4.4"]);
        assert_eq!(config.search, vec!["test.local"]);
    }

    #[test]
    fn read_dns_config_from_missing_file() {
        let config = read_dns_config_from("/nonexistent/resolv.conf");
        assert!(config.resolvers.is_empty());
        assert!(config.search.is_empty());
    }
}
