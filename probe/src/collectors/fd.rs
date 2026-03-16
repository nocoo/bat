//! File descriptor usage collector from `/proc/sys/fs/file-nr`.
//!
//! Reads system-wide file descriptor allocation: allocated and max.

/// Parsed file descriptor info from `/proc/sys/fs/file-nr`.
#[derive(Debug)]
pub struct FdInfo {
    pub allocated: u64,
    pub max: u64,
}

/// Parse `/proc/sys/fs/file-nr` content.
///
/// Format: `allocated\tfree\tmax`
///
/// Example: `1344\t0\t9223372036854775807`
pub fn parse_file_nr(content: &str) -> Option<FdInfo> {
    let fields: Vec<&str> = content.split_whitespace().collect();
    if fields.len() >= 3 {
        let allocated: u64 = fields[0].parse().ok()?;
        let max: u64 = fields[2].parse().ok()?;
        Some(FdInfo { allocated, max })
    } else {
        None
    }
}

/// Read FD info from a parameterized path (for testing).
pub fn read_fd_info_from(path: &str) -> Option<FdInfo> {
    let content = std::fs::read_to_string(path).ok()?;
    parse_file_nr(&content)
}

/// Read FD info from `/proc/sys/fs/file-nr`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_fd_info() -> Option<FdInfo> {
    read_fd_info_from("/proc/sys/fs/file-nr")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_file_nr_normal() {
        let info = parse_file_nr("1344\t0\t9223372036854775807\n").unwrap();
        assert_eq!(info.allocated, 1344);
        assert_eq!(info.max, 9_223_372_036_854_775_807);
    }

    #[test]
    fn parse_file_nr_spaces() {
        let info = parse_file_nr("2048  0  65536\n").unwrap();
        assert_eq!(info.allocated, 2048);
        assert_eq!(info.max, 65536);
    }

    #[test]
    fn parse_file_nr_empty() {
        assert!(parse_file_nr("").is_none());
    }

    #[test]
    fn parse_file_nr_too_few_fields() {
        assert!(parse_file_nr("1344\t0\n").is_none());
    }

    #[test]
    fn parse_file_nr_non_numeric() {
        assert!(parse_file_nr("abc\t0\tdef\n").is_none());
    }

    #[test]
    fn read_fd_info_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("file-nr");
        std::fs::write(&path, "1344\t0\t9223372036854775807\n").unwrap();

        let info = read_fd_info_from(path.to_str().unwrap()).unwrap();
        assert_eq!(info.allocated, 1344);
        assert_eq!(info.max, 9_223_372_036_854_775_807);
    }

    #[test]
    fn read_fd_info_from_missing_file() {
        assert!(read_fd_info_from("/nonexistent/file-nr").is_none());
    }
}
