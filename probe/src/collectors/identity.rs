/// Parse hostname from `/etc/hostname`.
pub fn parse_hostname(content: &str) -> String {
    content.trim().to_string()
}

/// Parse PRETTY_NAME from `/etc/os-release`.
///
/// Looks for `PRETTY_NAME="..."` or `PRETTY_NAME=...` line.
pub fn parse_os_release(content: &str) -> String {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("PRETTY_NAME=") {
            // Strip surrounding quotes if present
            let value = rest.trim_matches('"');
            return value.to_string();
        }
    }
    String::from("unknown")
}

/// Parse kernel version from `/proc/version`.
///
/// Expected format: `Linux version 5.15.0-91-generic (...)`
/// Extracts the token after "Linux version".
pub fn parse_kernel_version(content: &str) -> String {
    let fields: Vec<&str> = content.split_whitespace().collect();
    // Find "version" and take the next field
    for (i, field) in fields.iter().enumerate() {
        if *field == "version"
            && let Some(ver) = fields.get(i + 1)
        {
            return ver.to_string();
        }
    }
    String::from("unknown")
}

/// Parse uptime in seconds from `/proc/uptime`.
///
/// Format: `12345.67 98765.43` — first field is uptime in seconds.
#[allow(clippy::cast_possible_truncation)] // uptime seconds fits in u64
pub fn parse_uptime(content: &str) -> u64 {
    content
        .split_whitespace()
        .next()
        .and_then(|s| s.parse::<f64>().ok())
        .map_or(0, |f| f as u64)
}

/// Get system architecture via libc uname().
///
/// Returns the `machine` field (e.g., "x86_64", "aarch64").
pub fn get_arch() -> String {
    unsafe {
        let mut utsname: libc::utsname = std::mem::zeroed();
        if libc::uname(&raw mut utsname) == 0 {
            let machine = std::ffi::CStr::from_ptr(utsname.machine.as_ptr());
            machine.to_string_lossy().to_string()
        } else {
            String::from("unknown")
        }
    }
}

// ── Live readers (require Linux /proc, /etc) ────────────────────────

/// Read hostname from `/etc/hostname`.
pub fn read_hostname() -> Result<String, String> {
    let content =
        std::fs::read_to_string("/etc/hostname").map_err(|e| format!("read /etc/hostname: {e}"))?;
    Ok(parse_hostname(&content))
}

/// Read OS pretty name from `/etc/os-release`.
pub fn read_os_release() -> Result<String, String> {
    let content = std::fs::read_to_string("/etc/os-release")
        .map_err(|e| format!("read /etc/os-release: {e}"))?;
    Ok(parse_os_release(&content))
}

/// Read kernel version from `/proc/version`.
pub fn read_kernel_version() -> Result<String, String> {
    let content =
        std::fs::read_to_string("/proc/version").map_err(|e| format!("read /proc/version: {e}"))?;
    Ok(parse_kernel_version(&content))
}

/// Read uptime in seconds from `/proc/uptime`.
pub fn read_uptime() -> Result<u64, String> {
    let content =
        std::fs::read_to_string("/proc/uptime").map_err(|e| format!("read /proc/uptime: {e}"))?;
    Ok(parse_uptime(&content))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_hostname_normal() {
        assert_eq!(parse_hostname("myserver\n"), "myserver");
    }

    #[test]
    fn parse_hostname_no_newline() {
        assert_eq!(parse_hostname("myserver"), "myserver");
    }

    #[test]
    fn parse_hostname_whitespace() {
        assert_eq!(parse_hostname("  myserver  \n"), "myserver");
    }

    #[test]
    fn parse_os_release_quoted() {
        let content = r#"
NAME="Ubuntu"
VERSION="22.04.3 LTS (Jammy Jellyfish)"
PRETTY_NAME="Ubuntu 22.04.3 LTS"
ID=ubuntu
"#;
        assert_eq!(parse_os_release(content), "Ubuntu 22.04.3 LTS");
    }

    #[test]
    fn parse_os_release_unquoted() {
        let content = "PRETTY_NAME=Arch Linux\nID=arch\n";
        assert_eq!(parse_os_release(content), "Arch Linux");
    }

    #[test]
    fn parse_os_release_missing() {
        assert_eq!(parse_os_release("ID=ubuntu\n"), "unknown");
    }

    #[test]
    fn parse_os_release_debian() {
        let content = r#"PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"
NAME="Debian GNU/Linux"
VERSION_ID="12"
"#;
        assert_eq!(parse_os_release(content), "Debian GNU/Linux 12 (bookworm)");
    }

    #[test]
    fn parse_kernel_version_normal() {
        let content = "Linux version 5.15.0-91-generic (buildd@lcy02-amd64-045) (gcc (Ubuntu 11.4.0-1ubuntu1~22.04) 11.4.0, GNU ld (GNU Binutils for Ubuntu) 2.38) #101-Ubuntu SMP\n";
        assert_eq!(parse_kernel_version(content), "5.15.0-91-generic");
    }

    #[test]
    fn parse_kernel_version_short() {
        assert_eq!(
            parse_kernel_version("Linux version 6.1.0-rpi7-rpi-v8"),
            "6.1.0-rpi7-rpi-v8"
        );
    }

    #[test]
    fn parse_kernel_version_missing() {
        assert_eq!(parse_kernel_version("something else"), "unknown");
    }

    #[test]
    fn parse_uptime_normal() {
        assert_eq!(parse_uptime("86400.50 172800.00\n"), 86400);
    }

    #[test]
    fn parse_uptime_fractional() {
        assert_eq!(parse_uptime("12345.99 0.0\n"), 12345);
    }

    #[test]
    fn parse_uptime_empty() {
        assert_eq!(parse_uptime(""), 0);
    }

    #[test]
    fn parse_uptime_small() {
        assert_eq!(parse_uptime("0.01 0.00\n"), 0);
    }
}
