/// Raw jiffies from `/proc/stat` cpu line, plus process/context metrics.
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
    // Tier 3: extracted from same /proc/stat file
    pub ctxt: u64,      // cumulative context switches
    pub processes: u64, // cumulative forks
    pub procs_running: u32,
    pub procs_blocked: u32,
    // Signal expansion: cumulative counters from /proc/stat
    pub intr_total: u64, // total hardware interrupts (first field of `intr` line)
    pub softirq_net_rx: u64, // NET_RX softirqs (field 5 of `softirq` line, 0-indexed after name)
    pub softirq_block: u64, // BLOCK softirqs (field 6 of `softirq` line)
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
    let mut jiffies: Option<CpuJiffies> = None;

    for line in content.lines() {
        // Match "cpu " (with trailing space) to get the aggregate line,
        // not per-core lines like "cpu0", "cpu1", etc.
        if let Some(rest) = line.strip_prefix("cpu ") {
            let fields: Vec<u64> = rest
                .split_whitespace()
                .filter_map(|f| f.parse().ok())
                .collect();
            if fields.len() >= 8 {
                jiffies = Some(CpuJiffies {
                    user: fields[0],
                    nice: fields[1],
                    system: fields[2],
                    idle: fields[3],
                    iowait: fields[4],
                    irq: fields[5],
                    softirq: fields[6],
                    steal: fields[7],
                    ..Default::default()
                });
            }
        } else if let Some(rest) = line.strip_prefix("ctxt ")
            && let Some(j) = jiffies.as_mut()
        {
            j.ctxt = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("processes ")
            && let Some(j) = jiffies.as_mut()
        {
            j.processes = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("procs_running ")
            && let Some(j) = jiffies.as_mut()
        {
            j.procs_running = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("procs_blocked ")
            && let Some(j) = jiffies.as_mut()
        {
            j.procs_blocked = rest.trim().parse().unwrap_or(0);
        } else if let Some(rest) = line.strip_prefix("intr ")
            && let Some(j) = jiffies.as_mut()
        {
            // `intr` line: first field is total interrupt count
            if let Some(total_str) = rest.split_whitespace().next() {
                j.intr_total = total_str.parse().unwrap_or(0);
            }
        } else if let Some(rest) = line.strip_prefix("softirq ")
            && let Some(j) = jiffies.as_mut()
        {
            // `softirq` line: total HI TIMER NET_TX NET_RX BLOCK ...
            // fields (0-indexed after "softirq"): 0=total, 1=HI, 2=TIMER, 3=NET_TX, 4=NET_RX, 5=BLOCK
            let fields: Vec<u64> = rest
                .split_whitespace()
                .filter_map(|f| f.parse().ok())
                .collect();
            if fields.len() > 4 {
                j.softirq_net_rx = fields[4]; // NET_RX
            }
            if fields.len() > 5 {
                j.softirq_block = fields[5]; // BLOCK
            }
        }
    }
    jiffies
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

/// Parsed load averages and task counts from `/proc/loadavg`.
#[derive(Debug, Clone)]
pub struct LoadAvg {
    pub load1: f64,
    pub load5: f64,
    pub load15: f64,
    /// Running tasks (numerator of field 3, e.g., "1/234" → 1)
    #[allow(dead_code)]
    pub tasks_running: Option<u32>,
    /// Total tasks (denominator of field 3, e.g., "1/234" → 234)
    #[allow(dead_code)]
    pub tasks_total: Option<u32>,
}

/// Parse load averages from `/proc/loadavg`.
///
/// Format: `0.50 0.30 0.20 1/234 5678`
pub fn parse_loadavg(content: &str) -> Option<LoadAvg> {
    let fields: Vec<&str> = content.split_whitespace().collect();
    if fields.len() >= 3 {
        let load1: f64 = fields[0].parse().ok()?;
        let load5: f64 = fields[1].parse().ok()?;
        let load15: f64 = fields[2].parse().ok()?;

        let (tasks_running, tasks_total) = if fields.len() >= 4 {
            if let Some((running, total)) = fields[3].split_once('/') {
                (running.parse().ok(), total.parse().ok())
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        Some(LoadAvg {
            load1,
            load5,
            load15,
            tasks_running,
            tasks_total,
        })
    } else {
        None
    }
}

/// Count logical CPUs from `/proc/cpuinfo` by counting `^processor` lines.
///
/// Logical CPUs = hardware threads visible to the OS scheduler.
/// On a 4-core/8-thread system, this returns 8.
#[allow(clippy::cast_possible_truncation)] // cpu_count fits in u32
pub fn parse_cpu_logical(content: &str) -> u32 {
    content
        .lines()
        .filter(|line| line.starts_with("processor"))
        .count() as u32
}

/// Count physical CPU cores from `/proc/cpuinfo`.
///
/// Physical cores exclude hyper-threading siblings.
/// Fallback chain:
/// 1. Count unique (`physical id`, `core id`) pairs (multi-socket aware)
/// 2. `cpu cores` × distinct `physical id` count (VMs that omit `core id`)
/// 3. Assume `physical == logical` (no HT)
#[allow(clippy::cast_possible_truncation)]
pub fn parse_cpu_physical(content: &str) -> u32 {
    use std::collections::HashSet;

    let mut core_pairs: HashSet<(u32, u32)> = HashSet::new();
    let mut physical_ids: HashSet<u32> = HashSet::new();
    let mut cpu_cores_val: Option<u32> = None;

    let mut current_physical_id: Option<u32> = None;
    let mut current_core_id: Option<u32> = None;

    for line in content.lines() {
        if line.starts_with("processor") {
            // Emit previous block's pair if both fields were present
            if let (Some(pid), Some(cid)) = (current_physical_id, current_core_id) {
                core_pairs.insert((pid, cid));
                physical_ids.insert(pid);
            }
            current_physical_id = None;
            current_core_id = None;
        } else if let Some(rest) = line.strip_prefix("physical id") {
            if let Some(val) = rest.trim().strip_prefix(':') {
                current_physical_id = val.trim().parse().ok();
                if let Some(pid) = current_physical_id {
                    physical_ids.insert(pid);
                }
            }
        } else if let Some(rest) = line.strip_prefix("core id") {
            if let Some(val) = rest.trim().strip_prefix(':') {
                current_core_id = val.trim().parse().ok();
            }
        } else if cpu_cores_val.is_none()
            && let Some(rest) = line.strip_prefix("cpu cores")
            && let Some(val) = rest.trim().strip_prefix(':')
        {
            cpu_cores_val = val.trim().parse().ok();
        }
    }

    // Emit last block
    if let (Some(pid), Some(cid)) = (current_physical_id, current_core_id) {
        core_pairs.insert((pid, cid));
        physical_ids.insert(pid);
    }

    // Method 1: unique (physical_id, core_id) pairs
    if !core_pairs.is_empty() {
        return core_pairs.len() as u32;
    }

    // Method 2: cpu_cores × socket_count
    if let Some(cores) = cpu_cores_val {
        let sockets = if physical_ids.is_empty() {
            1
        } else {
            physical_ids.len() as u32
        };
        return cores * sockets;
    }

    // Method 3: no HT info available, assume physical == logical
    parse_cpu_logical(content)
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

/// Read aggregate CPU jiffies from a file (parameterized path for testing).
pub fn read_jiffies_from(path: &str) -> Result<CpuJiffies, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    parse_stat(&content).ok_or_else(|| format!("failed to parse cpu line from {path}"))
}

/// Read aggregate CPU jiffies from `/proc/stat`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_jiffies() -> Result<CpuJiffies, String> {
    read_jiffies_from("/proc/stat")
}

/// Read load averages from a file (parameterized path for testing).
pub fn read_loadavg_from(path: &str) -> Result<LoadAvg, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    parse_loadavg(&content).ok_or_else(|| format!("failed to parse {path}"))
}

/// Read load averages from `/proc/loadavg`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_loadavg() -> Result<LoadAvg, String> {
    read_loadavg_from("/proc/loadavg")
}

/// Read logical CPU count from a file (parameterized path for testing).
pub fn read_cpu_count_from(path: &str) -> Result<u32, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    let count = parse_cpu_logical(&content);
    if count == 0 {
        Err(format!("no processors found in {path}"))
    } else {
        Ok(count)
    }
}

/// Read logical CPU count from `/proc/cpuinfo`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_cpu_count() -> Result<u32, String> {
    read_cpu_count_from("/proc/cpuinfo")
}

/// Read physical CPU core count from a file (parameterized path for testing).
pub fn read_cpu_physical_from(path: &str) -> Result<u32, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    let count = parse_cpu_physical(&content);
    if count == 0 {
        Err(format!("no processors found in {path}"))
    } else {
        Ok(count)
    }
}

/// Read physical CPU core count from `/proc/cpuinfo`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_cpu_physical() -> Result<u32, String> {
    read_cpu_physical_from("/proc/cpuinfo")
}

/// Read CPU model from a file (parameterized path for testing).
pub fn read_cpu_model_from(path: &str) -> Result<String, String> {
    let content = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
    Ok(parse_cpu_model(&content))
}

/// Read CPU model from `/proc/cpuinfo`.
#[cfg_attr(coverage_nightly, coverage(off))]
pub fn read_cpu_model() -> Result<String, String> {
    read_cpu_model_from("/proc/cpuinfo")
}

#[cfg(test)]
#[allow(clippy::float_cmp)]
mod tests {
    use super::*;

    const PROC_STAT: &str = "\
cpu  10132153 290696 3084719 46828483 16683 0 25195 0 0 0
cpu0 1393280 32966 572056 13343292 6130 0 17875 0 0 0
cpu1 3585920 73768 503820 11226932 3694 0 4894 0 0 0
intr 45678901 23 0 0 0 0 0 0 0 1 2 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0
softirq 12345678 100000 3000000 200000 500000 300000 0 100000 4000000 50000 200000
ctxt 1234567890
processes 56789
procs_running 2
procs_blocked 0
";

    const PROC_STAT_WITH_STEAL: &str = "\
cpu  10000 200 3000 40000 500 100 150 250 0 0
";

    const PROC_LOADAVG: &str = "0.50 0.30 0.20 1/234 5678\n";

    const PROC_CPUINFO: &str = "\
processor\t: 0
vendor_id\t: GenuineIntel
model name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
physical id\t: 0
core id\t\t: 0
cpu cores\t: 2
cpu MHz\t\t: 2400.000

processor\t: 1
vendor_id\t: GenuineIntel
model name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
physical id\t: 0
core id\t\t: 1
cpu cores\t: 2
cpu MHz\t\t: 2400.000

processor\t: 2
vendor_id\t: GenuineIntel
model name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
physical id\t: 0
core id\t\t: 0
cpu cores\t: 2
cpu MHz\t\t: 2400.000

processor\t: 3
vendor_id\t: GenuineIntel
model name\t: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
physical id\t: 0
core id\t\t: 1
cpu cores\t: 2
cpu MHz\t\t: 2400.000
";

    #[test]
    fn parse_stat_aggregate_line() {
        let jiffies = parse_stat(PROC_STAT).unwrap();
        assert_eq!(jiffies.user, 10_132_153);
        assert_eq!(jiffies.nice, 290_696);
        assert_eq!(jiffies.system, 3_084_719);
        assert_eq!(jiffies.idle, 46_828_483);
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
            ..Default::default()
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
            ..Default::default()
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
        let la = parse_loadavg(PROC_LOADAVG).unwrap();
        assert!((la.load1 - 0.50).abs() < f64::EPSILON);
        assert!((la.load5 - 0.30).abs() < f64::EPSILON);
        assert!((la.load15 - 0.20).abs() < f64::EPSILON);
        assert_eq!(la.tasks_running, Some(1));
        assert_eq!(la.tasks_total, Some(234));
    }

    #[test]
    fn parse_loadavg_empty() {
        assert!(parse_loadavg("").is_none());
    }

    #[test]
    fn parse_loadavg_no_tasks_field() {
        // Only 3 fields, no tasks
        let la = parse_loadavg("0.50 0.30 0.20\n").unwrap();
        assert!((la.load1 - 0.50).abs() < f64::EPSILON);
        assert_eq!(la.tasks_running, None);
        assert_eq!(la.tasks_total, None);
    }

    #[test]
    fn parse_loadavg_malformed_tasks() {
        // Tasks field without slash
        let la = parse_loadavg("0.50 0.30 0.20 noslash 5678\n").unwrap();
        assert_eq!(la.tasks_running, None);
        assert_eq!(la.tasks_total, None);
    }

    #[test]
    fn parse_cpu_logical_normal() {
        assert_eq!(parse_cpu_logical(PROC_CPUINFO), 4);
    }

    #[test]
    fn parse_cpu_logical_empty() {
        assert_eq!(parse_cpu_logical(""), 0);
    }

    #[test]
    fn parse_cpu_physical_with_ht() {
        // 4 logical CPUs, 2 unique (physical_id, core_id) pairs → 2 physical cores
        assert_eq!(parse_cpu_physical(PROC_CPUINFO), 2);
    }

    #[test]
    fn parse_cpu_physical_multi_socket() {
        let content = "\
processor\t: 0
physical id\t: 0
core id\t\t: 0

processor\t: 1
physical id\t: 0
core id\t\t: 1

processor\t: 2
physical id\t: 1
core id\t\t: 0

processor\t: 3
physical id\t: 1
core id\t\t: 1
";
        // 2 sockets × 2 cores = 4 unique pairs
        assert_eq!(parse_cpu_physical(content), 4);
    }

    #[test]
    fn parse_cpu_physical_vm_fallback_cpu_cores() {
        // VM without core id — fallback to cpu_cores × socket_count
        let content = "\
processor\t: 0
physical id\t: 0
cpu cores\t: 4

processor\t: 1
physical id\t: 0
cpu cores\t: 4

processor\t: 2
physical id\t: 0
cpu cores\t: 4

processor\t: 3
physical id\t: 0
cpu cores\t: 4
";
        assert_eq!(parse_cpu_physical(content), 4);
    }

    #[test]
    fn parse_cpu_physical_no_topology_info() {
        // No physical id, no core id, no cpu cores → fallback to logical count
        let content = "\
processor\t: 0
model name\t: Some CPU

processor\t: 1
model name\t: Some CPU
";
        assert_eq!(parse_cpu_physical(content), 2);
    }

    #[test]
    fn parse_cpu_physical_empty() {
        assert_eq!(parse_cpu_physical(""), 0);
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

    #[test]
    fn parse_stat_empty_input() {
        assert!(parse_stat("").is_none());
    }

    #[test]
    fn parse_stat_malformed_line() {
        // "cpu " prefix present but no numeric fields
        assert!(parse_stat("cpu  not numbers here\n").is_none());
    }

    #[test]
    fn parse_stat_fewer_than_8_fields() {
        // Only 7 numeric fields — should return None
        assert!(parse_stat("cpu  1 2 3 4 5 6 7\n").is_none());
    }

    #[test]
    fn read_jiffies_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("stat");
        std::fs::write(&path, PROC_STAT).unwrap();
        let jiffies = read_jiffies_from(path.to_str().unwrap()).unwrap();
        assert_eq!(jiffies.user, 10_132_153);
        assert_eq!(jiffies.idle, 46_828_483);
    }

    #[test]
    fn read_jiffies_from_missing_file() {
        let result = read_jiffies_from("/nonexistent/path/stat");
        assert!(result.is_err());
    }

    #[test]
    fn read_loadavg_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("loadavg");
        std::fs::write(&path, PROC_LOADAVG).unwrap();
        let la = read_loadavg_from(path.to_str().unwrap()).unwrap();
        assert!((la.load1 - 0.50).abs() < f64::EPSILON);
        assert!((la.load5 - 0.30).abs() < f64::EPSILON);
        assert!((la.load15 - 0.20).abs() < f64::EPSILON);
        assert_eq!(la.tasks_running, Some(1));
        assert_eq!(la.tasks_total, Some(234));
    }

    #[test]
    fn read_cpu_count_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cpuinfo");
        std::fs::write(&path, PROC_CPUINFO).unwrap();
        assert_eq!(read_cpu_count_from(path.to_str().unwrap()).unwrap(), 4);
    }

    #[test]
    fn read_cpu_count_from_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cpuinfo");
        std::fs::write(&path, "").unwrap();
        let result = read_cpu_count_from(path.to_str().unwrap());
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("no processors"));
    }

    #[test]
    fn read_cpu_physical_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cpuinfo");
        std::fs::write(&path, PROC_CPUINFO).unwrap();
        assert_eq!(read_cpu_physical_from(path.to_str().unwrap()).unwrap(), 2);
    }

    #[test]
    fn read_cpu_physical_from_empty_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cpuinfo");
        std::fs::write(&path, "").unwrap();
        let result = read_cpu_physical_from(path.to_str().unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn read_cpu_model_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("cpuinfo");
        std::fs::write(&path, PROC_CPUINFO).unwrap();
        assert_eq!(
            read_cpu_model_from(path.to_str().unwrap()).unwrap(),
            "Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz"
        );
    }

    #[test]
    fn parse_stat_extended_fields() {
        let jiffies = parse_stat(PROC_STAT).unwrap();
        assert_eq!(jiffies.ctxt, 1_234_567_890);
        assert_eq!(jiffies.processes, 56789);
        assert_eq!(jiffies.procs_running, 2);
        assert_eq!(jiffies.procs_blocked, 0);
        // Signal expansion: intr and softirq
        assert_eq!(jiffies.intr_total, 45_678_901);
        // softirq fields (0-indexed after name): 4=NET_RX(500000), 5=BLOCK(300000)
        assert_eq!(jiffies.softirq_net_rx, 500_000);
        assert_eq!(jiffies.softirq_block, 300_000);
    }

    #[test]
    fn parse_stat_no_extended_fields() {
        // PROC_STAT_WITH_STEAL has no ctxt/processes/procs_*/intr/softirq lines
        let jiffies = parse_stat(PROC_STAT_WITH_STEAL).unwrap();
        assert_eq!(jiffies.ctxt, 0);
        assert_eq!(jiffies.processes, 0);
        assert_eq!(jiffies.procs_running, 0);
        assert_eq!(jiffies.procs_blocked, 0);
        assert_eq!(jiffies.intr_total, 0);
        assert_eq!(jiffies.softirq_net_rx, 0);
        assert_eq!(jiffies.softirq_block, 0);
    }

    #[test]
    fn parse_stat_intr_only() {
        // intr line present but no softirq line
        let content = "\
cpu  10000 200 3000 40000 500 100 150 250 0 0
intr 99999 1 2 3 4 5
";
        let jiffies = parse_stat(content).unwrap();
        assert_eq!(jiffies.intr_total, 99999);
        assert_eq!(jiffies.softirq_net_rx, 0);
        assert_eq!(jiffies.softirq_block, 0);
    }

    #[test]
    fn parse_stat_softirq_short_line() {
        // softirq line with fewer than 5 fields after name
        let content = "\
cpu  10000 200 3000 40000 500 100 150 250 0 0
softirq 1000 100 200 300
";
        let jiffies = parse_stat(content).unwrap();
        // Only 4 fields parsed (total, HI, TIMER, NET_TX) — NET_RX and BLOCK missing
        assert_eq!(jiffies.softirq_net_rx, 0);
        assert_eq!(jiffies.softirq_block, 0);
    }

    #[test]
    fn compute_usage_saturating_sub_wrapround() {
        // curr values smaller than prev (e.g. counter reset)
        // saturating_sub should clamp to 0, not panic
        let prev = CpuJiffies {
            user: 5000,
            nice: 200,
            system: 3000,
            idle: 40000,
            iowait: 500,
            irq: 100,
            softirq: 50,
            steal: 150,
            ..Default::default()
        };
        let curr = CpuJiffies {
            user: 1000,
            nice: 100,
            system: 500,
            idle: 10000,
            iowait: 100,
            irq: 0,
            softirq: 0,
            steal: 0,
            ..Default::default()
        };
        // total_delta saturates to 0 → returns (0.0, 0.0, 0.0)
        let (usage, iowait, steal) = compute_cpu_usage(&prev, &curr);
        assert_eq!(usage, 0.0);
        assert_eq!(iowait, 0.0);
        assert_eq!(steal, 0.0);
    }
}
