/// Allowed real filesystem types for disk monitoring.
const REAL_FS_TYPES: &[&str] = &["ext4", "xfs", "btrfs", "overlay", "zfs", "f2fs"];

/// A parsed mount entry from `/proc/mounts`.
#[derive(Debug, Clone)]
pub struct MountEntry {
    #[allow(dead_code)]
    pub device: String,
    pub mount_point: String,
    #[allow(dead_code)]
    pub fs_type: String,
}

/// Parse `/proc/mounts` and filter to real filesystems,
/// excluding configured mount points and filesystem types.
pub fn parse_mounts(
    content: &str,
    exclude_mounts: &[String],
    exclude_fs_types: &[String],
) -> Vec<MountEntry> {
    content
        .lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() < 3 {
                return None;
            }

            let device = fields[0];
            let mount_point = fields[1];
            let fs_type = fields[2];

            // Keep only real filesystem types
            if !REAL_FS_TYPES.contains(&fs_type) {
                return None;
            }

            // Exclude configured fs types
            if exclude_fs_types.iter().any(|e| e == fs_type) {
                return None;
            }

            // Exclude configured mount points
            if exclude_mounts.iter().any(|e| e == mount_point) {
                return None;
            }

            Some(MountEntry {
                device: device.to_string(),
                mount_point: mount_point.to_string(),
                fs_type: fs_type.to_string(),
            })
        })
        .collect()
}

/// Collect disk metrics for a list of mount entries using `statvfs()`.
///
/// This function calls the real `statvfs` syscall and cannot be unit tested
/// with fixture data. Use `parse_mounts` for testable filtering logic.
pub fn collect_disk(mounts: &[MountEntry]) -> Vec<DiskInfo> {
    let mut results = Vec::new();

    for mount in mounts {
        let path = std::ffi::CString::new(mount.mount_point.as_bytes()).ok();
        let Some(path) = path else { continue };

        match nix::sys::statvfs::statvfs(&*path) {
            Ok(stat) => {
                let block_size = stat.block_size();
                let total = u64::from(stat.blocks()) * block_size;
                let avail = u64::from(stat.blocks_available()) * block_size;
                let used_pct = if total > 0 {
                    (total - avail) as f64 / total as f64 * 100.0
                } else {
                    0.0
                };

                results.push(DiskInfo {
                    mount: mount.mount_point.clone(),
                    total_bytes: total,
                    avail_bytes: avail,
                    used_pct,
                });
            }
            Err(_) => continue,
        }
    }

    results
}

/// Disk capacity info for a single mount point.
#[derive(Debug)]
pub struct DiskInfo {
    pub mount: String,
    pub total_bytes: u64,
    pub avail_bytes: u64,
    pub used_pct: f64,
}

// ── Live reader (requires Linux /proc) ──────────────────────────────

/// Read `/proc/mounts`, filter, and collect disk metrics via `statvfs`.
pub fn read_disk_metrics(
    exclude_mounts: &[String],
    exclude_fs_types: &[String],
) -> Result<Vec<DiskInfo>, String> {
    let content =
        std::fs::read_to_string("/proc/mounts").map_err(|e| format!("read /proc/mounts: {e}"))?;
    let mounts = parse_mounts(&content, exclude_mounts, exclude_fs_types);
    Ok(collect_disk(&mounts))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROC_MOUNTS: &str = "\
sysfs /sys sysfs rw,nosuid,nodev,noexec,relatime 0 0
proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0
udev /dev devtmpfs rw,nosuid,relatime 0 0
tmpfs /run tmpfs rw,nosuid,nodev,noexec,relatime 0 0
/dev/vda1 / ext4 rw,relatime 0 0
/dev/vda2 /boot/efi ext4 rw,relatime 0 0
/dev/sdb1 /data xfs rw,relatime 0 0
overlay /var/lib/docker/overlay2/abc/merged overlay rw,relatime 0 0
tmpfs /dev/shm tmpfs rw,nosuid,nodev 0 0
/dev/loop0 /snap/core20/123 squashfs ro,nodev,relatime 0 0
btrfs-pool /mnt/storage btrfs rw,relatime 0 0
";

    #[test]
    fn parse_mounts_keeps_real_fs() {
        let mounts = parse_mounts(PROC_MOUNTS, &[], &[]);
        let fs_types: Vec<&str> = mounts.iter().map(|m| m.fs_type.as_str()).collect();

        assert!(fs_types.contains(&"ext4"));
        assert!(fs_types.contains(&"xfs"));
        assert!(fs_types.contains(&"overlay"));
        assert!(fs_types.contains(&"btrfs"));
        assert!(!fs_types.contains(&"tmpfs"));
        assert!(!fs_types.contains(&"sysfs"));
        assert!(!fs_types.contains(&"proc"));
        assert!(!fs_types.contains(&"devtmpfs"));
        assert!(!fs_types.contains(&"squashfs"));
    }

    #[test]
    fn parse_mounts_excludes_configured_mounts() {
        let exclude_mounts = vec!["/boot/efi".to_string()];
        let mounts = parse_mounts(PROC_MOUNTS, &exclude_mounts, &[]);
        let mount_points: Vec<&str> = mounts.iter().map(|m| m.mount_point.as_str()).collect();

        assert!(!mount_points.contains(&"/boot/efi"));
        assert!(mount_points.contains(&"/"));
        assert!(mount_points.contains(&"/data"));
    }

    #[test]
    fn parse_mounts_excludes_configured_fs_types() {
        let exclude_fs = vec!["overlay".to_string()];
        let mounts = parse_mounts(PROC_MOUNTS, &[], &exclude_fs);
        let fs_types: Vec<&str> = mounts.iter().map(|m| m.fs_type.as_str()).collect();

        assert!(!fs_types.contains(&"overlay"));
        assert!(fs_types.contains(&"ext4"));
    }

    #[test]
    fn parse_mounts_combined_excludes() {
        let exclude_mounts = vec!["/boot/efi".to_string(), "/snap/core20/123".to_string()];
        let exclude_fs = vec!["overlay".to_string()];
        let mounts = parse_mounts(PROC_MOUNTS, &exclude_mounts, &exclude_fs);
        let mount_points: Vec<&str> = mounts.iter().map(|m| m.mount_point.as_str()).collect();

        assert!(mount_points.contains(&"/"));
        assert!(mount_points.contains(&"/data"));
        assert!(mount_points.contains(&"/mnt/storage"));
        assert!(!mount_points.contains(&"/boot/efi"));
        // overlay is excluded by fs type
        assert!(!mounts.iter().any(|m| m.fs_type == "overlay"));
    }

    #[test]
    fn parse_mounts_empty_input() {
        let mounts = parse_mounts("", &[], &[]);
        assert!(mounts.is_empty());
    }

    #[test]
    fn parse_mounts_overlay_kept_by_default() {
        // Per docs: overlay is NOT excluded — Docker hosts need it visible.
        let mounts = parse_mounts(PROC_MOUNTS, &[], &[]);
        assert!(
            mounts.iter().any(|m| m.fs_type == "overlay"
                && m.mount_point == "/var/lib/docker/overlay2/abc/merged")
        );
    }

    #[test]
    fn parse_mounts_fields_correct() {
        let mounts = parse_mounts(PROC_MOUNTS, &[], &[]);
        let root = mounts.iter().find(|m| m.mount_point == "/").unwrap();
        assert_eq!(root.device, "/dev/vda1");
        assert_eq!(root.fs_type, "ext4");
    }
}
