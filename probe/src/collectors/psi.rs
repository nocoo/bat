//! PSI (Pressure Stall Information) collector.
//!
//! Reads `/proc/pressure/{cpu,memory,io}` to get resource pressure metrics.
//! Available on Linux 4.20+ with `CONFIG_PSI=y` (default on kernels ≥ 5.10).
//!
//! Each file contains `some` and `full` lines with avg10/avg60/avg300 values.
//! CPU pressure only has `some` (no `full` line on most kernels).

/// Parsed averages from a single PSI line (some or full).
#[derive(Debug, Default)]
pub struct PsiLine {
    pub avg10: f64,
    pub avg60: f64,
    pub avg300: f64,
}

/// Parsed PSI data from one resource file (cpu, memory, or io).
#[derive(Debug, Default)]
pub struct PsiResource {
    pub some: PsiLine,
    pub full: PsiLine,
}

/// All PSI data combined from cpu, memory, and io.
#[derive(Debug)]
pub struct PsiData {
    pub cpu: PsiResource,
    pub memory: PsiResource,
    pub io: PsiResource,
}

/// Parse a single PSI line like:
/// `some avg10=2.40 avg60=2.13 avg300=1.40 total=1627410488`
///
/// Returns `(kind, PsiLine)` where kind is "some" or "full".
pub fn parse_psi_line(line: &str) -> Option<(&str, PsiLine)> {
    let mut parts = line.split_whitespace();
    let kind = parts.next()?;
    if kind != "some" && kind != "full" {
        return None;
    }

    let mut avg10 = 0.0;
    let mut avg60 = 0.0;
    let mut avg300 = 0.0;

    for part in parts {
        if let Some(val) = part.strip_prefix("avg10=") {
            avg10 = val.parse().ok()?;
        } else if let Some(val) = part.strip_prefix("avg60=") {
            avg60 = val.parse().ok()?;
        } else if let Some(val) = part.strip_prefix("avg300=") {
            avg300 = val.parse().ok()?;
        }
        // skip total=... and any unknown fields
    }

    Some((
        kind,
        PsiLine {
            avg10,
            avg60,
            avg300,
        },
    ))
}

/// Parse a PSI resource file content (e.g. `/proc/pressure/cpu`).
pub fn parse_psi_file(content: &str) -> PsiResource {
    let mut resource = PsiResource::default();
    for line in content.lines() {
        if let Some((kind, psi_line)) = parse_psi_line(line) {
            match kind {
                "some" => resource.some = psi_line,
                "full" => resource.full = psi_line,
                _ => {}
            }
        }
    }
    resource
}

/// Read PSI data from parameterized directory (for testing).
pub fn read_psi_from(dir: &str) -> Option<PsiData> {
    let cpu_content = std::fs::read_to_string(format!("{dir}/cpu")).ok()?;
    let mem_content = std::fs::read_to_string(format!("{dir}/memory")).ok()?;
    let io_content = std::fs::read_to_string(format!("{dir}/io")).ok()?;

    Some(PsiData {
        cpu: parse_psi_file(&cpu_content),
        memory: parse_psi_file(&mem_content),
        io: parse_psi_file(&io_content),
    })
}

/// Read PSI data from `/proc/pressure/`.
/// Returns `None` if PSI is not available (kernel < 4.20 or `CONFIG_PSI=n`).
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_psi() -> Option<PsiData> {
    read_psi_from("/proc/pressure")
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    const PSI_CPU: &str = "\
some avg10=2.40 avg60=2.13 avg300=1.40 total=1627410488
full avg10=0.00 avg60=0.00 avg300=0.00 total=0
";

    const PSI_MEMORY: &str = "\
some avg10=0.00 avg60=0.00 avg300=0.00 total=0
full avg10=0.00 avg60=0.00 avg300=0.00 total=0
";

    const PSI_IO: &str = "\
some avg10=0.50 avg60=0.01 avg300=0.00 total=23982867
full avg10=0.30 avg60=0.00 avg300=0.00 total=21296068
";

    // CPU on some kernels has no full line
    const PSI_CPU_NO_FULL: &str = "\
some avg10=5.00 avg60=3.00 avg300=1.00 total=999999
";

    #[test]
    fn parse_psi_line_some() {
        let (kind, line) =
            parse_psi_line("some avg10=2.40 avg60=2.13 avg300=1.40 total=1627410488").unwrap();
        assert_eq!(kind, "some");
        assert!((line.avg10 - 2.40).abs() < f64::EPSILON);
        assert!((line.avg60 - 2.13).abs() < f64::EPSILON);
        assert!((line.avg300 - 1.40).abs() < f64::EPSILON);
    }

    #[test]
    fn parse_psi_line_full() {
        let (kind, line) =
            parse_psi_line("full avg10=0.30 avg60=0.00 avg300=0.00 total=21296068").unwrap();
        assert_eq!(kind, "full");
        assert!((line.avg10 - 0.30).abs() < f64::EPSILON);
        assert_eq!(line.avg60, 0.0);
        assert_eq!(line.avg300, 0.0);
    }

    #[test]
    fn parse_psi_line_empty() {
        assert!(parse_psi_line("").is_none());
    }

    #[test]
    fn parse_psi_line_invalid_kind() {
        assert!(parse_psi_line("invalid avg10=1.0 avg60=2.0 avg300=3.0 total=0").is_none());
    }

    #[test]
    fn parse_psi_file_cpu() {
        let resource = parse_psi_file(PSI_CPU);
        assert!((resource.some.avg10 - 2.40).abs() < f64::EPSILON);
        assert!((resource.some.avg60 - 2.13).abs() < f64::EPSILON);
        assert!((resource.some.avg300 - 1.40).abs() < f64::EPSILON);
        assert_eq!(resource.full.avg10, 0.0);
        assert_eq!(resource.full.avg60, 0.0);
        assert_eq!(resource.full.avg300, 0.0);
    }

    #[test]
    fn parse_psi_file_io() {
        let resource = parse_psi_file(PSI_IO);
        assert!((resource.some.avg10 - 0.50).abs() < f64::EPSILON);
        assert!((resource.some.avg60 - 0.01).abs() < f64::EPSILON);
        assert!((resource.full.avg10 - 0.30).abs() < f64::EPSILON);
    }

    #[test]
    fn parse_psi_file_no_full_line() {
        let resource = parse_psi_file(PSI_CPU_NO_FULL);
        assert!((resource.some.avg10 - 5.0).abs() < f64::EPSILON);
        // full stays default (0.0)
        assert_eq!(resource.full.avg10, 0.0);
        assert_eq!(resource.full.avg60, 0.0);
        assert_eq!(resource.full.avg300, 0.0);
    }

    #[test]
    fn parse_psi_file_empty() {
        let resource = parse_psi_file("");
        assert_eq!(resource.some.avg10, 0.0);
        assert_eq!(resource.full.avg10, 0.0);
    }

    #[test]
    fn read_psi_from_tempdir() {
        let dir = tempfile::tempdir().unwrap();
        let dir_path = dir.path();
        std::fs::write(dir_path.join("cpu"), PSI_CPU).unwrap();
        std::fs::write(dir_path.join("memory"), PSI_MEMORY).unwrap();
        std::fs::write(dir_path.join("io"), PSI_IO).unwrap();

        let data = read_psi_from(dir_path.to_str().unwrap()).unwrap();
        assert!((data.cpu.some.avg10 - 2.40).abs() < f64::EPSILON);
        assert_eq!(data.memory.some.avg10, 0.0);
        assert!((data.io.some.avg10 - 0.50).abs() < f64::EPSILON);
        assert!((data.io.full.avg10 - 0.30).abs() < f64::EPSILON);
    }

    #[test]
    fn read_psi_from_missing_dir() {
        let result = read_psi_from("/nonexistent/psi/path");
        assert!(result.is_none());
    }

    #[test]
    fn read_psi_from_partial_dir() {
        // Only cpu file exists — should return None (all 3 required)
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("cpu"), PSI_CPU).unwrap();
        let result = read_psi_from(dir.path().to_str().unwrap());
        assert!(result.is_none());
    }
}
