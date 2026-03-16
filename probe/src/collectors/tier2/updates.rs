use crate::command::{self, CommandError};

/// A package update entry.
#[derive(Debug, Clone)]
pub struct PackageUpdate {
    pub name: String,
    pub current_version: String,
    pub new_version: String,
    pub is_security: bool,
}

/// Result of collecting package update information.
#[derive(Debug, Clone)]
pub struct PackageUpdatesInfo {
    pub total_count: u32,
    pub security_count: u32,
    pub list: Vec<PackageUpdate>,
    pub reboot_required: bool,
    pub cache_age_seconds: Option<u64>,
}

/// Parse `apt list --upgradable` output into a list of packages.
///
/// Example output:
/// ```text
/// Listing...
/// libssl3/jammy-security 3.0.2-0ubuntu1.15 amd64 [upgradable from: 3.0.2-0ubuntu1.14]
/// curl/jammy-updates 7.81.0-1ubuntu1.16 amd64 [upgradable from: 7.81.0-1ubuntu1.15]
/// ```
pub fn parse_apt_upgradable(output: &str) -> Vec<PackageUpdate> {
    let mut updates = Vec::new();

    for line in output.lines() {
        // Skip the "Listing..." header and empty lines
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("Listing") {
            continue;
        }

        // Format: name/source version arch [upgradable from: old_version]
        let Some((name_source, rest)) = trimmed.split_once('/') else {
            continue;
        };
        let name = name_source.to_string();

        let source = rest.split_whitespace().next().unwrap_or("");
        let is_security = is_security_update(source);

        // Extract new version (second field after /)
        let parts: Vec<&str> = rest.split_whitespace().collect();
        let new_version = parts.get(1).unwrap_or(&"").to_string();

        // Extract old version from "[upgradable from: x.y.z]"
        let current_version = rest.find("from: ").map_or_else(String::new, |from_idx| {
            let start = from_idx + 6;
            let end = rest[start..].find(']').map_or(rest.len(), |i| start + i);
            rest[start..end].to_string()
        });

        updates.push(PackageUpdate {
            name,
            current_version,
            new_version,
            is_security,
        });
    }

    updates
}

/// Check if a source string indicates a security update.
pub fn is_security_update(source: &str) -> bool {
    source.to_lowercase().contains("security")
}

/// Compute cache age in seconds from mtime and current time.
pub const fn compute_cache_age(mtime: u64, now: u64) -> u64 {
    now.saturating_sub(mtime)
}

/// Check if reboot is required by testing existence of the flag file.
pub fn check_reboot_required_at(path: &std::path::Path) -> bool {
    path.exists()
}

/// Read the mtime of a path and return it as Unix seconds.
pub fn read_cache_mtime_from(path: &std::path::Path) -> Option<u64> {
    let metadata = std::fs::metadata(path).ok()?;
    let modified = metadata.modified().ok()?;
    let duration = modified.duration_since(std::time::UNIX_EPOCH).ok()?;
    Some(duration.as_secs())
}

/// Collect package update information from the system.
///
/// Returns `None` if `apt` is not available.
#[cfg_attr(coverage_nightly, coverage(off))]
pub async fn collect_package_updates() -> Option<PackageUpdatesInfo> {
    if !command::command_exists("apt") {
        return None;
    }

    let output = command::run_command_default("apt", &["list", "--upgradable"]).await;

    let list_output = match output {
        Ok(s) => s,
        Err(CommandError::NotFound) => return None,
        Err(e) => {
            tracing::warn!(error = %e, "failed to run apt list --upgradable");
            return None;
        }
    };

    let updates = parse_apt_upgradable(&list_output);
    #[allow(clippy::cast_possible_truncation)]
    let total_count = updates.len() as u32;
    #[allow(clippy::cast_possible_truncation)]
    let security_count = updates.iter().filter(|u| u.is_security).count() as u32;

    let reboot_required =
        check_reboot_required_at(std::path::Path::new("/var/run/reboot-required"));

    let cache_age_seconds =
        read_cache_mtime_from(std::path::Path::new("/var/lib/apt/lists")).map(|mtime| {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            compute_cache_age(mtime, now)
        });

    Some(PackageUpdatesInfo {
        total_count,
        security_count,
        list: updates,
        reboot_required,
        cache_age_seconds,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const APT_OUTPUT: &str = "\
Listing... Done
libssl3/jammy-security 3.0.2-0ubuntu1.15 amd64 [upgradable from: 3.0.2-0ubuntu1.14]
curl/jammy-updates 7.81.0-1ubuntu1.16 amd64 [upgradable from: 7.81.0-1ubuntu1.15]
nginx/jammy-security 1.18.0-6ubuntu14.4 amd64 [upgradable from: 1.18.0-6ubuntu14.3]
";

    #[test]
    fn parse_apt_upgradable_normal() {
        let updates = parse_apt_upgradable(APT_OUTPUT);
        assert_eq!(updates.len(), 3);

        assert_eq!(updates[0].name, "libssl3");
        assert_eq!(updates[0].new_version, "3.0.2-0ubuntu1.15");
        assert_eq!(updates[0].current_version, "3.0.2-0ubuntu1.14");
        assert!(updates[0].is_security);

        assert_eq!(updates[1].name, "curl");
        assert!(!updates[1].is_security);

        assert_eq!(updates[2].name, "nginx");
        assert!(updates[2].is_security);
    }

    #[test]
    fn parse_apt_upgradable_empty() {
        let updates = parse_apt_upgradable("Listing... Done\n");
        assert!(updates.is_empty());
    }

    #[test]
    fn parse_apt_upgradable_no_listing_header() {
        let output =
            "curl/jammy-updates 7.81.0-1ubuntu1.16 amd64 [upgradable from: 7.81.0-1ubuntu1.15]\n";
        let updates = parse_apt_upgradable(output);
        assert_eq!(updates.len(), 1);
        assert_eq!(updates[0].name, "curl");
    }

    #[test]
    fn is_security_update_true() {
        assert!(is_security_update("jammy-security"));
        assert!(is_security_update("focal-Security"));
        assert!(is_security_update("noble-security,noble-updates"));
    }

    #[test]
    fn is_security_update_false() {
        assert!(!is_security_update("jammy-updates"));
        assert!(!is_security_update("focal-backports"));
    }

    #[test]
    fn compute_cache_age_normal() {
        assert_eq!(compute_cache_age(1000, 2000), 1000);
    }

    #[test]
    fn compute_cache_age_future_mtime() {
        // Saturating sub should return 0
        assert_eq!(compute_cache_age(2000, 1000), 0);
    }

    #[test]
    fn check_reboot_required_nonexistent() {
        assert!(!check_reboot_required_at(std::path::Path::new(
            "/nonexistent_file_xyz"
        )));
    }

    #[test]
    fn read_cache_mtime_nonexistent() {
        assert!(read_cache_mtime_from(std::path::Path::new("/nonexistent_dir_xyz")).is_none());
    }

    #[test]
    fn parse_apt_upgradable_line_without_slash() {
        // Lines without '/' should be skipped
        let output = "Listing... Done\nsome-garbage-line-no-slash\n";
        let updates = parse_apt_upgradable(output);
        assert!(updates.is_empty());
    }

    #[test]
    fn read_cache_mtime_from_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("test-file");
        std::fs::write(&file, "data").unwrap();
        let mtime = read_cache_mtime_from(&file);
        assert!(mtime.is_some());
        assert!(mtime.unwrap() > 0);
    }

    #[test]
    fn check_reboot_required_existing() {
        let dir = tempfile::tempdir().unwrap();
        let flag = dir.path().join("reboot-required");
        std::fs::write(&flag, "").unwrap();
        assert!(check_reboot_required_at(&flag));
    }
}
