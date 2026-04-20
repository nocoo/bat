use crate::command;

/// A top-level directory entry with size.
#[derive(Debug, Clone)]
pub struct TopDir {
    pub path: String,
    pub size_bytes: u64,
}

/// A large file entry.
#[derive(Debug, Clone)]
pub struct LargeFile {
    pub path: String,
    pub size_bytes: u64,
}

/// Result of disk deep scan.
#[derive(Debug, Clone)]
pub struct DiskDeepScanInfo {
    pub top_dirs: Vec<TopDir>,
    pub journal_bytes: Option<u64>,
    pub large_files: Vec<LargeFile>,
}

/// Parse `du` output in `bytes\tpath` format.
///
/// Expected input from: `du -xb --max-depth=1 / 2>/dev/null | sort -rn | head -10`
pub fn parse_du_output(output: &str) -> Vec<TopDir> {
    let mut dirs = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.splitn(2, char::is_whitespace).collect();
        if parts.len() != 2 {
            continue;
        }

        let size_bytes = match parts[0].trim().parse::<u64>() {
            Ok(s) => s,
            Err(_) => {
                // Try parsing human-readable format (from du -sh)
                match parse_size_string(parts[0].trim()) {
                    Some(s) => s,
                    None => continue,
                }
            }
        };

        dirs.push(TopDir {
            path: parts[1].trim().to_string(),
            size_bytes,
        });
    }

    dirs
}

/// Parse `journalctl --disk-usage` output for journal size.
///
/// Example: "Archived and active journals take up 256.0M in the file system."
pub fn parse_journal_usage(output: &str) -> Option<u64> {
    for line in output.lines() {
        // Look for "take up X" pattern
        if let Some(idx) = line.find("take up ") {
            let rest = &line[idx + 8..];
            // Extract the size token (e.g., "256.0M")
            let token = rest.split_whitespace().next()?;
            // Remove trailing period if present
            let clean = token.trim_end_matches('.');
            return parse_size_string(clean);
        }
    }
    None
}

/// Parse `find` output for large files in `bytes\tpath` format.
///
/// Expected input from: `find / -xdev -type f -size +100M -printf '%s\t%p\n' 2>/dev/null`
pub fn parse_find_large_files(output: &str) -> Vec<LargeFile> {
    let mut files = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let parts: Vec<&str> = trimmed.splitn(2, '\t').collect();
        if parts.len() != 2 {
            continue;
        }

        let size_bytes: u64 = match parts[0].trim().parse() {
            Ok(s) => s,
            Err(_) => continue,
        };

        files.push(LargeFile {
            path: parts[1].trim().to_string(),
            size_bytes,
        });
    }

    files
}

/// Parse a human-readable size string like "256.0M", "1.5G", "512K".
pub fn parse_size_string(s: &str) -> Option<u64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }

    let suffixes: &[(&str, u64)] = &[
        ("T", 1_000_000_000_000),
        ("G", 1_000_000_000),
        ("M", 1_000_000),
        ("K", 1_000),
        ("B", 1),
    ];

    for (suffix, multiplier) in suffixes {
        if let Some(num_str) = s.strip_suffix(suffix)
            && let Ok(num) = num_str.parse::<f64>()
        {
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            return Some((num * *multiplier as f64) as u64);
        }
    }

    // Try parsing as a plain number
    s.parse::<u64>().ok()
}

/// Collect disk deep scan information from the system.
#[cfg_attr(coverage_nightly, coverage(off))]
pub async fn collect_disk_deep_scan() -> DiskDeepScanInfo {
    // Run all three commands concurrently
    let (du_result, journal_result, find_result) = tokio::join!(
        // Top directories
        command::run_command_default("du", &["-xb", "--max-depth=1", "/"],),
        // Journal usage
        command::run_command_default("journalctl", &["--disk-usage"],),
        // Large files
        command::run_command_default(
            "find",
            &[
                "/", "-xdev", "-type", "f", "-size", "+100M", "-printf", "%s\t%p\n"
            ],
        ),
    );

    let mut top_dirs = match du_result {
        Ok(output) => {
            let mut dirs = parse_du_output(&output);
            // Sort by size descending and take top 10
            dirs.sort_by_key(|d| std::cmp::Reverse(d.size_bytes));
            dirs.truncate(10);
            dirs
        }
        Err(e) => {
            tracing::debug!(error = %e, "du command failed");
            Vec::new()
        }
    };

    // Remove "/" itself from top_dirs if present (it's the total)
    top_dirs.retain(|d| d.path != "/");

    let journal_bytes = match journal_result {
        Ok(output) => parse_journal_usage(&output),
        Err(e) => {
            tracing::debug!(error = %e, "journalctl --disk-usage failed");
            None
        }
    };

    let large_files = match find_result {
        Ok(output) => {
            let mut files = parse_find_large_files(&output);
            files.sort_by_key(|f| std::cmp::Reverse(f.size_bytes));
            files.truncate(20);
            files
        }
        Err(e) => {
            tracing::debug!(error = %e, "find large files failed");
            Vec::new()
        }
    };

    DiskDeepScanInfo {
        top_dirs,
        journal_bytes,
        large_files,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_du_output_bytes() {
        let output = "\
1073741824\t/usr
536870912\t/var
268435456\t/home
";
        let dirs = parse_du_output(output);
        assert_eq!(dirs.len(), 3);
        assert_eq!(dirs[0].path, "/usr");
        assert_eq!(dirs[0].size_bytes, 1_073_741_824);
        assert_eq!(dirs[1].path, "/var");
        assert_eq!(dirs[2].path, "/home");
    }

    #[test]
    fn parse_du_output_empty() {
        assert!(parse_du_output("").is_empty());
    }

    #[test]
    fn parse_du_output_invalid_lines() {
        let output = "not_a_number\t/usr\n";
        let dirs = parse_du_output(output);
        assert!(dirs.is_empty());
    }

    #[test]
    fn parse_journal_usage_normal() {
        let output = "Archived and active journals take up 256.0M in the file system.\n";
        assert_eq!(parse_journal_usage(output), Some(256_000_000));
    }

    #[test]
    fn parse_journal_usage_gigabytes() {
        let output = "Archived and active journals take up 1.5G in the file system.\n";
        assert_eq!(parse_journal_usage(output), Some(1_500_000_000));
    }

    #[test]
    fn parse_journal_usage_no_match() {
        assert_eq!(parse_journal_usage("some random output"), None);
    }

    #[test]
    fn parse_journal_usage_empty() {
        assert_eq!(parse_journal_usage(""), None);
    }

    #[test]
    fn parse_find_large_files_normal() {
        let output = "\
524288000\t/var/log/syslog
209715200\t/var/lib/mysql/ibdata1
";
        let files = parse_find_large_files(output);
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].path, "/var/log/syslog");
        assert_eq!(files[0].size_bytes, 524_288_000);
        assert_eq!(files[1].path, "/var/lib/mysql/ibdata1");
    }

    #[test]
    fn parse_find_large_files_empty() {
        assert!(parse_find_large_files("").is_empty());
    }

    #[test]
    fn parse_size_string_megabytes() {
        assert_eq!(parse_size_string("256.0M"), Some(256_000_000));
    }

    #[test]
    fn parse_size_string_gigabytes() {
        assert_eq!(parse_size_string("1.5G"), Some(1_500_000_000));
    }

    #[test]
    fn parse_size_string_kilobytes() {
        assert_eq!(parse_size_string("512K"), Some(512_000));
    }

    #[test]
    fn parse_size_string_terabytes() {
        assert_eq!(parse_size_string("1T"), Some(1_000_000_000_000));
    }

    #[test]
    fn parse_size_string_bytes() {
        assert_eq!(parse_size_string("1024B"), Some(1024));
    }

    #[test]
    fn parse_size_string_plain_number() {
        assert_eq!(parse_size_string("12345"), Some(12345));
    }

    #[test]
    fn parse_size_string_empty() {
        assert_eq!(parse_size_string(""), None);
    }

    #[test]
    fn parse_size_string_invalid() {
        assert_eq!(parse_size_string("abc"), None);
    }

    #[test]
    fn parse_du_output_human_readable() {
        // When du uses human-readable format (du -sh), size is like "256M"
        let output = "256M\t/usr\n";
        let dirs = parse_du_output(output);
        assert_eq!(dirs.len(), 1);
        assert_eq!(dirs[0].path, "/usr");
        assert_eq!(dirs[0].size_bytes, 256_000_000);
    }

    #[test]
    fn parse_du_output_single_field() {
        // Line with no tab separator should be skipped
        let output = "1024\n";
        let dirs = parse_du_output(output);
        assert!(dirs.is_empty());
    }

    #[test]
    fn parse_find_large_files_no_tab() {
        // Line without tab separator should be skipped
        let output = "524288000 /var/log/syslog\n";
        let files = parse_find_large_files(output);
        assert!(files.is_empty());
    }

    #[test]
    fn parse_find_large_files_bad_size() {
        let output = "notanumber\t/var/log/syslog\n";
        let files = parse_find_large_files(output);
        assert!(files.is_empty());
    }

    #[test]
    fn parse_du_output_with_blank_lines() {
        // Blank lines interspersed should be skipped
        let output = "\n1073741824\t/usr\n\n536870912\t/var\n\n";
        let dirs = parse_du_output(output);
        assert_eq!(dirs.len(), 2);
        assert_eq!(dirs[0].path, "/usr");
        assert_eq!(dirs[1].path, "/var");
    }

    #[test]
    fn parse_find_large_files_with_blank_lines() {
        // Blank lines interspersed should be skipped
        let output = "\n524288000\t/var/log/syslog\n\n";
        let files = parse_find_large_files(output);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "/var/log/syslog");
    }
}
