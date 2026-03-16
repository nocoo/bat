/// Raw jiffies from `/proc/stat` cpu line.
#[derive(Debug, Clone, Default)]
pub struct CpuJiffies {
    pub user: u64,
    pub nice: u64,
    pub system: u64,
    pub idle: u64,
    pub iowait: u64,
    pub irq: u64,
    pub softirq: u64,
    pub steal: u64,
}

impl CpuJiffies {
    const fn total(&self) -> u64 {
        self.user
            + self.nice
            + self.system
            + self.idle
            + self.iowait
            + self.irq
            + self.softirq
            + self.steal
    }
}

/// Parse the aggregate `cpu` line from `/proc/stat`.
///
/// Expected format:
/// ```text
/// cpu  user nice system idle iowait irq softirq steal guest guest_nice
/// ```
pub fn parse_stat(content: &str) -> Option<CpuJiffies> {
    for line in content.lines() {
        // Match "cpu " (with trailing space) to get the aggregate line,
        // not per-core lines like "cpu0", "cpu1", etc.
        if let Some(rest) = line.strip_prefix("cpu ") {
            let fields: Vec<u64> = rest
                .split_whitespace()
                .filter_map(|f| f.parse().ok())
                .collect();
            if fields.len() >= 8 {
                return Some(CpuJiffies {
                    user: fields[0],
                    nice: fields[1],
                    system: fields[2],
                    idle: fields[3],
                    iowait: fields[4],
                    irq: fields[5],
                    softirq: fields[6],
                    steal: fields[7],
                });
            }
        }
    }
    None
}

/// Compute CPU usage percentages from two jiffies samples.
///
/// Returns `(usage_pct, iowait_pct, steal_pct)`.
/// `usage_pct = (user + nice + system) delta / total delta * 100`
pub fn compute_cpu_usage(prev: &CpuJiffies, curr: &CpuJiffies) -> (f64, f64, f64) {
    let total_delta = curr.total().saturating_sub(prev.total());
    if total_delta == 0 {
        return (0.0, 0.0, 0.0);
    }

    let busy_delta =
        (curr.user + curr.nice + curr.system).saturating_sub(prev.user + prev.nice + prev.system);
    let iowait_delta = curr.iowait.saturating_sub(prev.iowait);
    let steal_delta = curr.steal.saturating_sub(prev.steal);

    let total = total_delta as f64;
    (
        busy_delta as f64 / total * 100.0,
        iowait_delta as f64 / total * 100.0,
        steal_delta as f64 / total * 100.0,
    )
}

/// Parse load averages from `/proc/loadavg`.
///
/// Format: `0.50 0.30 0.20 1/234 5678`
pub fn parse_loadavg(content: &str) -> Option<(f64, f64, f64)> {
    let fields: Vec<&str> = content.split_whitespace().collect();
    if fields.len() >= 3 {
        let load1: f64 = fields[0].parse().ok()?;
        let load5: f64 = fields[1].parse().ok()?;
        let load15: f64 = fields[2].parse().ok()?;
        Some((load1, load5, load15))
    } else {
        None
    }
}

/// Count CPU cores from `/proc/cpuinfo` by counting `^processor` lines.
pub fn parse_cpu_count(content: &str) -> u32 {
    content
        .lines()
        .filter(|line| line.starts_with("processor"))
        .count() as u32
}

/// Parse the first `model name` from `/proc/cpuinfo`.
pub fn parse_cpu_model(content: &str) -> String {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix("model name")
            && let Some(value) = rest.trim().strip_prefix(':')
        {
            return value.trim().to_string();
        }
    }
    String::from("unknown")
}

// ── Live readers (require Linux /proc) ──────────────────────────────

/// Read aggregate CPU jiffies from `/proc/stat`.
pub fn read_jiffies() -> Result<CpuJiffies, String> {
    let content =
        std::fs::read_to_string("/proc/stat").map_err(|e| format!("read /proc/stat: {e}"))?;
    parse_stat(&content).ok_or_else(|| "failed to parse cpu line from /proc/stat".to_string())
}

/// Read load averages from `/proc/loadavg`.
pub fn read_loadavg() -> Result<(f64, f64, f64), String> {
    let content =
        std::fs::read_to_string("/proc/loadavg").map_err(|e| format!("read /proc/loadavg: {e}"))?;
    parse_loadavg(&content).ok_or_else(|| "failed to parse /proc/loadavg".to_string())
}

/// Read CPU core count from `/proc/cpuinfo`.
pub fn read_cpu_count() -> Result<u32, String> {
    let content =
        std::fs::read_to_string("/proc/cpuinfo").map_err(|e| format!("read /proc/cpuinfo: {e}"))?;
    let count = parse_cpu_count(&content);
    if count == 0 {
        Err("no processors found in /proc/cpuinfo".to_string())
    } else {
        Ok(count)
    }
}

/// Read CPU model from `/proc/cpuinfo`.
pub fn read_cpu_model() -> Result<String, String> {
    let content =
        std::fs::read_to_string("/proc/cpuinfo").map_err(|e| format!("read /proc/cpuinfo: {e}"))?;
    Ok(parse_cpu_model(&content))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROC_STAT: &str = "\
cpu  10132153 290696 3084719 46828483 16683 0 25195 0 0 0
cpu0 1393280 32966 572056 13343292 6130 0 17875 0 0 0
cpu1 3585920 73768 503820 11226932 3694 0 4894 0 0 0
";

    const PROC_STAT_WITH_STEAL: &str = "\
cpu  10000 200 3000 40000 500 100 150 250 0 0
";

    const PROC_LOADAVG: &str = "0.50 0.30 0.20 1/234 5678\n";

    const PROC_CPUINFO: &str = "\
processor\t: 0
vendor_id\t: GenuineIntel
model name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
cpu MHz\t\t: 2400.000

processor\t: 1
vendor_id\t: GenuineIntel
model name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
cpu MHz\t\t: 2400.000

processor\t: 2
vendor_id\t: GenuineIntel
model name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
cpu MHz\t\t: 2400.000

processor\t: 3
vendor_id\t: GenuineIntel
model name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
cpu MHz\t\t: 2400.000
";

    #[test]
    fn parse_stat_aggregate_line() {
        let jiffies = parse_stat(PROC_STAT).unwrap();
        assert_eq!(jiffies.user, 10132153);
        assert_eq!(jiffies.nice, 290696);
        assert_eq!(jiffies.system, 3084719);
        assert_eq!(jiffies.idle, 46828483);
        assert_eq!(jiffies.iowait, 16683);
        assert_eq!(jiffies.irq, 0);
        assert_eq!(jiffies.softirq, 25195);
        assert_eq!(jiffies.steal, 0);
    }

    #[test]
    fn parse_stat_with_steal() {
        let jiffies = parse_stat(PROC_STAT_WITH_STEAL).unwrap();
        assert_eq!(jiffies.steal, 250);
    }

    #[test]
    fn compute_usage_normal() {
        let prev = CpuJiffies {
            user: 10000,
            nice: 200,
            system: 3000,
            idle: 40000,
            iowait: 500,
            irq: 0,
            softirq: 0,
            steal: 0,
        };
        let curr = CpuJiffies {
            user: 11000,
            nice: 200,
            system: 3500,
            idle: 45000,
            iowait: 600,
            irq: 0,
            softirq: 0,
            steal: 0,
        };
        // total delta = (11000+200+3500+45000+600) - (10000+200+3000+40000+500) = 60300 - 53700 = 6600
        // busy delta = (11000+200+3500) - (10000+200+3000) = 14700 - 13200 = 1500
        // usage = 1500/6600*100 = 22.727...
        let (usage, iowait, steal) = compute_cpu_usage(&prev, &curr);
        assert!((usage - 22.727).abs() < 0.01);
        assert!((iowait - 1.515).abs() < 0.01); // 100/6600*100
        assert_eq!(steal, 0.0);
    }

    #[test]
    fn compute_usage_all_idle() {
        let prev = CpuJiffies {
            idle: 1000,
            ..Default::default()
        };
        let curr = CpuJiffies {
            idle: 2000,
            ..Default::default()
        };
        let (usage, iowait, steal) = compute_cpu_usage(&prev, &curr);
        assert_eq!(usage, 0.0);
        assert_eq!(iowait, 0.0);
        assert_eq!(steal, 0.0);
    }

    #[test]
    fn compute_usage_zero_delta() {
        let j = CpuJiffies {
            user: 100,
            idle: 900,
            ..Default::default()
        };
        let (usage, iowait, steal) = compute_cpu_usage(&j, &j);
        assert_eq!(usage, 0.0);
        assert_eq!(iowait, 0.0);
        assert_eq!(steal, 0.0);
    }

    #[test]
    fn compute_usage_with_steal() {
        let prev = CpuJiffies {
            user: 1000,
            system: 500,
            idle: 8000,
            steal: 200,
            ..Default::default()
        };
        let curr = CpuJiffies {
            user: 1100,
            system: 550,
            idle: 8800,
            steal: 350,
            ..Default::default()
        };
        // total delta = (1100+550+8800+350) - (1000+500+8000+200) = 10800 - 9700 = 1100
        // busy delta = (1100+550) - (1000+500) = 150
        // steal delta = 150
        let (usage, _, steal) = compute_cpu_usage(&prev, &curr);
        assert!((usage - 13.636).abs() < 0.01); // 150/1100*100
        assert!((steal - 13.636).abs() < 0.01); // 150/1100*100
    }

    #[test]
    fn parse_loadavg_normal() {
        let (l1, l5, l15) = parse_loadavg(PROC_LOADAVG).unwrap();
        assert!((l1 - 0.50).abs() < f64::EPSILON);
        assert!((l5 - 0.30).abs() < f64::EPSILON);
        assert!((l15 - 0.20).abs() < f64::EPSILON);
    }

    #[test]
    fn parse_loadavg_empty() {
        assert!(parse_loadavg("").is_none());
    }

    #[test]
    fn parse_cpu_count_normal() {
        assert_eq!(parse_cpu_count(PROC_CPUINFO), 4);
    }

    #[test]
    fn parse_cpu_count_empty() {
        assert_eq!(parse_cpu_count(""), 0);
    }

    #[test]
    fn parse_cpu_model_normal() {
        assert_eq!(
            parse_cpu_model(PROC_CPUINFO),
            "Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz"
        );
    }

    #[test]
    fn parse_cpu_model_missing() {
        assert_eq!(parse_cpu_model("processor\t: 0\n"), "unknown");
    }
}
