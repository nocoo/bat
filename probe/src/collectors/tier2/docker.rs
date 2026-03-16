use std::collections::HashMap;
use std::path::Path;

use crate::command::{self, CommandError};

/// A running Docker container with resource usage.
#[derive(Debug, Clone)]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub cpu_pct: Option<f64>,
    pub mem_bytes: Option<u64>,
    pub restart_count: u32,
    pub started_at: Option<u64>,
}

/// Docker images disk usage summary.
#[derive(Debug, Clone)]
pub struct DockerImagesInfo {
    pub total_count: u32,
    pub total_bytes: u64,
    pub reclaimable_bytes: u64,
}

/// Result of collecting Docker status.
#[derive(Debug, Clone)]
pub struct DockerStatusInfo {
    pub installed: bool,
    pub version: Option<String>,
    pub containers: Vec<DockerContainer>,
    pub images: Option<DockerImagesInfo>,
}

/// Check if Docker socket exists.
pub fn docker_socket_exists(path: &Path) -> bool {
    path.exists()
}

/// Parse `docker version --format '{{.Server.Version}}'` output.
pub fn parse_docker_version(output: &str) -> Option<String> {
    let trimmed = output.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Parse `docker ps -a --format '{{json .}}'` output (one JSON object per line).
pub fn parse_docker_ps(output: &str) -> Vec<DockerContainer> {
    let mut containers = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };

        let id = val["ID"].as_str().unwrap_or("").to_string();
        let name = val["Names"].as_str().unwrap_or("").to_string();
        let image = val["Image"].as_str().unwrap_or("").to_string();
        let status = val["Status"].as_str().unwrap_or("").to_string();
        let state = val["State"].as_str().unwrap_or("").to_string();

        containers.push(DockerContainer {
            id,
            name,
            image,
            status,
            state,
            cpu_pct: None,
            mem_bytes: None,
            restart_count: 0,
            started_at: None,
        });
    }

    containers
}

/// Parse `docker stats --no-stream --format '{{json .}}'` output.
///
/// Returns a map of container ID/Name → (`cpu_pct`, `mem_bytes`).
pub fn parse_docker_stats(output: &str) -> HashMap<String, (f64, u64)> {
    let mut map = HashMap::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };

        let id = val["ID"].as_str().unwrap_or("").to_string();
        let name = val["Name"].as_str().unwrap_or("").to_string();

        // CPU%: "2.50%" → 2.5
        let cpu_str = val["CPUPerc"].as_str().unwrap_or("0%");
        let cpu_pct = cpu_str.trim_end_matches('%').parse::<f64>().unwrap_or(0.0);

        // MemUsage: "256MiB / 4GiB" → parse first part
        let mem_str = val["MemUsage"].as_str().unwrap_or("0B");
        let mem_bytes = parse_mem_usage(mem_str);

        if !id.is_empty() {
            map.insert(id, (cpu_pct, mem_bytes));
        }
        if !name.is_empty() {
            map.insert(name, (cpu_pct, mem_bytes));
        }
    }

    map
}

/// Parse memory usage string like "256MiB" from Docker stats.
fn parse_mem_usage(s: &str) -> u64 {
    // Format: "256MiB / 4GiB" — take the part before " / "
    let usage_part = s.split('/').next().unwrap_or(s).trim();
    parse_size_string_binary(usage_part)
}

/// Parse a binary size string like "256MiB", "1.5GiB", "512KiB", "1024B".
fn parse_size_string_binary(s: &str) -> u64 {
    let s = s.trim();
    if s.is_empty() {
        return 0;
    }

    let suffixes: &[(&str, u64)] = &[
        ("TiB", 1024 * 1024 * 1024 * 1024),
        ("GiB", 1024 * 1024 * 1024),
        ("MiB", 1024 * 1024),
        ("KiB", 1024),
        ("TB", 1_000_000_000_000),
        ("GB", 1_000_000_000),
        ("MB", 1_000_000),
        ("kB", 1000),
        ("B", 1),
    ];

    for (suffix, multiplier) in suffixes {
        if let Some(num_str) = s.strip_suffix(suffix)
            && let Ok(num) = num_str.trim().parse::<f64>()
        {
            #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
            return (num * *multiplier as f64) as u64;
        }
    }

    0
}

/// Parse `docker system df --format '{{json .}}'` output.
///
/// Returns images info if found.
pub fn parse_docker_system_df(output: &str) -> Option<DockerImagesInfo> {
    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) else {
            continue;
        };

        // docker system df outputs rows for Images, Containers, Local Volumes, Build Cache
        let type_str = val["Type"].as_str().unwrap_or("");
        if type_str != "Images" {
            continue;
        }

        let total_count = val["TotalCount"]
            .as_str()
            .and_then(|s| s.parse::<u32>().ok())
            .or_else(|| {
                val["TotalCount"]
                    .as_u64()
                    .map(|v| u32::try_from(v).unwrap_or(u32::MAX))
            })
            .unwrap_or(0);

        let size_str = val["Size"].as_str().unwrap_or("0B");
        let total_bytes = parse_size_string_binary(size_str);

        let reclaimable_str = val["Reclaimable"].as_str().unwrap_or("0B");
        // Reclaimable might be "1.2GB (50%)" — strip the percentage part
        let reclaim_clean = reclaimable_str
            .split('(')
            .next()
            .unwrap_or(reclaimable_str)
            .trim();
        let reclaimable_bytes = parse_size_string_binary(reclaim_clean);

        return Some(DockerImagesInfo {
            total_count,
            total_bytes,
            reclaimable_bytes,
        });
    }

    None
}

/// Parse `docker inspect` JSON output for restart count and start time.
pub fn parse_container_inspect(json: &str) -> Option<(u32, Option<u64>)> {
    let val: serde_json::Value = serde_json::from_str(json).ok()?;
    let arr = val.as_array()?;
    let container = arr.first()?;

    #[allow(clippy::cast_possible_truncation)]
    let restart_count = container["RestartCount"].as_u64().unwrap_or(0) as u32;

    let started_at = container["State"]["StartedAt"].as_str().and_then(|s| {
        // ISO 8601 format: "2024-01-15T10:30:00.123456789Z"
        // Simple parse: try to extract Unix timestamp
        parse_iso8601_to_unix(s)
    });

    Some((restart_count, started_at))
}

/// Simple ISO 8601 to Unix timestamp parser.
fn parse_iso8601_to_unix(s: &str) -> Option<u64> {
    // Handle "0001-01-01T00:00:00Z" (not started)
    if s.starts_with("0001-") {
        return None;
    }

    // Very simple parser for "2024-01-15T10:30:00.123Z" or "2024-01-15T10:30:00Z"
    let s = s.trim_end_matches('Z');
    let (date_part, time_part) = s.split_once('T')?;
    let date_parts: Vec<&str> = date_part.split('-').collect();
    if date_parts.len() != 3 {
        return None;
    }

    let year: i64 = date_parts[0].parse().ok()?;
    let month: i64 = date_parts[1].parse().ok()?;
    let day: i64 = date_parts[2].parse().ok()?;

    // Take only HH:MM:SS (ignore fractional seconds)
    let time_clean = time_part.split('.').next()?;
    let time_parts: Vec<&str> = time_clean.split(':').collect();
    if time_parts.len() != 3 {
        return None;
    }

    let hour: i64 = time_parts[0].parse().ok()?;
    let min: i64 = time_parts[1].parse().ok()?;
    let sec: i64 = time_parts[2].parse().ok()?;

    // Days from epoch (simplified, not accounting for leap seconds)
    let days = days_from_civil(year, month, day);
    let total_secs = days * 86400 + hour * 3600 + min * 60 + sec;

    if total_secs < 0 {
        None
    } else {
        Some(total_secs as u64)
    }
}

/// Convert year/month/day to days from Unix epoch.
/// Simplified algorithm from Howard Hinnant.
const fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let m = if month <= 2 { month + 9 } else { month - 3 };
    let era = y.div_euclid(400);
    let yoe = y.rem_euclid(400);
    let doy = (153 * m + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Collect Docker status from the system.
///
/// Returns `None` if Docker is not installed.
#[cfg_attr(coverage_nightly, coverage(off))]
pub async fn collect_docker_status() -> Option<DockerStatusInfo> {
    // Check if Docker socket exists
    if !docker_socket_exists(Path::new("/var/run/docker.sock")) {
        // Also check if docker command exists
        if !command::command_exists("docker") {
            return Some(DockerStatusInfo {
                installed: false,
                version: None,
                containers: Vec::new(),
                images: None,
            });
        }
    }

    // Get version
    let version = match command::run_command_default(
        "docker",
        &["version", "--format", "{{.Server.Version}}"],
    )
    .await
    {
        Ok(output) => parse_docker_version(&output),
        Err(CommandError::NotFound) => {
            return Some(DockerStatusInfo {
                installed: false,
                version: None,
                containers: Vec::new(),
                images: None,
            });
        }
        Err(_) => None,
    };

    // Get containers
    let mut containers =
        command::run_command_default("docker", &["ps", "-a", "--format", "{{json .}}"])
            .await
            .map_or_else(|_| Vec::new(), |output| parse_docker_ps(&output));

    // Get stats for running containers
    if !containers.is_empty() {
        if let Ok(stats_output) = command::run_command_default(
            "docker",
            &["stats", "--no-stream", "--format", "{{json .}}"],
        )
        .await
        {
            let stats = parse_docker_stats(&stats_output);
            for container in &mut containers {
                if let Some((cpu, mem)) = stats
                    .get(&container.id)
                    .or_else(|| stats.get(&container.name))
                {
                    container.cpu_pct = Some(*cpu);
                    container.mem_bytes = Some(*mem);
                }
            }
        }

        // Get inspect info for restart counts
        for container in &mut containers {
            if let Ok(inspect_output) =
                command::run_command_default("docker", &["inspect", &container.id]).await
                && let Some((restart_count, started_at)) = parse_container_inspect(&inspect_output)
            {
                container.restart_count = restart_count;
                container.started_at = started_at;
            }
        }
    }

    // Get images info
    let images =
        command::run_command_default("docker", &["system", "df", "--format", "{{json .}}"])
            .await
            .ok()
            .and_then(|output| parse_docker_system_df(&output));

    Some(DockerStatusInfo {
        installed: true,
        version,
        containers,
        images,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_docker_version_normal() {
        assert_eq!(parse_docker_version("24.0.7\n"), Some("24.0.7".to_string()));
    }

    #[test]
    fn parse_docker_version_empty() {
        assert_eq!(parse_docker_version(""), None);
        assert_eq!(parse_docker_version("  \n"), None);
    }

    #[test]
    fn parse_docker_ps_normal() {
        let output = r#"{"Command":"\"docker-entrypoint.…\"","CreatedAt":"2024-01-15 10:00:00 +0000 UTC","ID":"abc123","Image":"n8nio/n8n:latest","Labels":"","LocalVolumes":"1","Mounts":"n8n_data","Names":"n8n","Networks":"bridge","Ports":"0.0.0.0:5678->5678/tcp","RunningFor":"3 days ago","Size":"0B","State":"running","Status":"Up 3 days"}
{"Command":"\"caddy run\"","CreatedAt":"2024-01-15 10:00:00 +0000 UTC","ID":"def456","Image":"caddy:latest","Labels":"","LocalVolumes":"0","Mounts":"","Names":"caddy","Networks":"bridge","Ports":"0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp","RunningFor":"3 days ago","Size":"0B","State":"running","Status":"Up 3 days"}"#;

        let containers = parse_docker_ps(output);
        assert_eq!(containers.len(), 2);
        assert_eq!(containers[0].id, "abc123");
        assert_eq!(containers[0].name, "n8n");
        assert_eq!(containers[0].image, "n8nio/n8n:latest");
        assert_eq!(containers[0].state, "running");
        assert_eq!(containers[1].id, "def456");
        assert_eq!(containers[1].name, "caddy");
    }

    #[test]
    fn parse_docker_ps_empty() {
        assert!(parse_docker_ps("").is_empty());
        assert!(parse_docker_ps("\n").is_empty());
    }

    #[test]
    fn parse_docker_ps_invalid_json() {
        assert!(parse_docker_ps("not json\n").is_empty());
    }

    #[test]
    fn parse_docker_stats_normal() {
        let output = r#"{"BlockIO":"0B / 0B","CPUPerc":"2.50%","Container":"abc123","ID":"abc123","MemPerc":"6.25%","MemUsage":"256MiB / 4GiB","Name":"n8n","NetIO":"1.5MB / 500kB","PIDs":"15"}"#;

        let stats = parse_docker_stats(output);
        assert!(stats.contains_key("abc123"));
        let (cpu, mem) = stats["abc123"];
        assert!((cpu - 2.5).abs() < f64::EPSILON);
        assert_eq!(mem, 256 * 1024 * 1024); // 256 MiB
    }

    #[test]
    fn parse_docker_stats_empty() {
        assert!(parse_docker_stats("").is_empty());
    }

    #[test]
    fn parse_docker_system_df_normal() {
        let output = r#"{"Active":"5","Reclaimable":"1.2GiB (50%)","Size":"2.5GiB","TotalCount":"10","Type":"Images","UniqueSize":"1.3GiB"}
{"Active":"3","Reclaimable":"0B (0%)","Size":"500MiB","TotalCount":"3","Type":"Containers","UniqueSize":"500MiB"}
{"Active":"2","Reclaimable":"100MiB","Size":"1GiB","TotalCount":"5","Type":"Local Volumes","UniqueSize":"900MiB"}"#;

        let info = parse_docker_system_df(output);
        assert!(info.is_some());
        let info = info.unwrap();
        assert_eq!(info.total_count, 10);
        assert_eq!(info.total_bytes, 2684354560); // 2.5 GiB
        assert_eq!(info.reclaimable_bytes, 1288490188); // 1.2 GiB
    }

    #[test]
    fn parse_docker_system_df_empty() {
        assert!(parse_docker_system_df("").is_none());
    }

    #[test]
    fn parse_docker_system_df_no_images() {
        let output = r#"{"Active":"0","Reclaimable":"0B","Size":"0B","TotalCount":"0","Type":"Containers","UniqueSize":"0B"}"#;
        assert!(parse_docker_system_df(output).is_none());
    }

    #[test]
    fn parse_container_inspect_normal() {
        let json =
            r#"[{"RestartCount": 3, "State": {"StartedAt": "2024-01-15T10:30:00.123456789Z"}}]"#;
        let result = parse_container_inspect(json);
        assert!(result.is_some());
        let (restart_count, started_at) = result.unwrap();
        assert_eq!(restart_count, 3);
        assert!(started_at.is_some());
    }

    #[test]
    fn parse_container_inspect_not_started() {
        let json = r#"[{"RestartCount": 0, "State": {"StartedAt": "0001-01-01T00:00:00Z"}}]"#;
        let result = parse_container_inspect(json);
        assert!(result.is_some());
        let (restart_count, started_at) = result.unwrap();
        assert_eq!(restart_count, 0);
        assert!(started_at.is_none());
    }

    #[test]
    fn parse_container_inspect_invalid_json() {
        assert!(parse_container_inspect("not json").is_none());
    }

    #[test]
    fn parse_container_inspect_empty_array() {
        assert!(parse_container_inspect("[]").is_none());
    }

    #[test]
    fn docker_socket_exists_nonexistent() {
        assert!(!docker_socket_exists(Path::new("/nonexistent_socket_xyz")));
    }

    #[test]
    fn parse_mem_usage_mib() {
        assert_eq!(parse_mem_usage("256MiB / 4GiB"), 256 * 1024 * 1024);
    }

    #[test]
    fn parse_mem_usage_gib() {
        assert_eq!(parse_mem_usage("1GiB / 4GiB"), 1024 * 1024 * 1024);
    }

    #[test]
    fn parse_mem_usage_empty() {
        assert_eq!(parse_mem_usage(""), 0);
    }

    #[test]
    fn parse_size_string_binary_various() {
        assert_eq!(parse_size_string_binary("1024B"), 1024);
        assert_eq!(parse_size_string_binary("1KiB"), 1024);
        assert_eq!(parse_size_string_binary("1MiB"), 1024 * 1024);
        assert_eq!(parse_size_string_binary("1GiB"), 1024 * 1024 * 1024);
    }

    #[test]
    fn iso8601_parsing() {
        // 2024-01-15T10:30:00Z
        let ts = parse_iso8601_to_unix("2024-01-15T10:30:00Z");
        assert!(ts.is_some());
        // Should be around 1705312200
        let val = ts.unwrap();
        assert!(val > 1705000000 && val < 1706000000);
    }

    #[test]
    fn iso8601_not_started() {
        assert!(parse_iso8601_to_unix("0001-01-01T00:00:00Z").is_none());
    }

    #[test]
    fn iso8601_no_t_separator() {
        assert!(parse_iso8601_to_unix("2024-01-15 10:30:00Z").is_none());
    }

    #[test]
    fn iso8601_bad_date_parts() {
        // Only two date components
        assert!(parse_iso8601_to_unix("2024-01T10:30:00Z").is_none());
    }

    #[test]
    fn iso8601_bad_time_parts() {
        // Only two time components
        assert!(parse_iso8601_to_unix("2024-01-15T10:30Z").is_none());
    }

    #[test]
    fn iso8601_non_numeric_fields() {
        assert!(parse_iso8601_to_unix("abcd-01-15T10:30:00Z").is_none());
        assert!(parse_iso8601_to_unix("2024-xx-15T10:30:00Z").is_none());
        assert!(parse_iso8601_to_unix("2024-01-15Txx:30:00Z").is_none());
    }

    #[test]
    fn iso8601_pre_epoch() {
        // 1960-01-01T00:00:00Z is before Unix epoch → negative → None
        assert!(parse_iso8601_to_unix("1960-01-01T00:00:00Z").is_none());
    }

    #[test]
    fn iso8601_with_fractional_seconds() {
        // Should parse fine, ignoring the fractional part
        let ts = parse_iso8601_to_unix("2024-06-15T12:00:00.999999Z");
        assert!(ts.is_some());
    }

    #[test]
    fn iso8601_epoch() {
        // Exactly the Unix epoch
        let ts = parse_iso8601_to_unix("1970-01-01T00:00:00Z");
        assert_eq!(ts, Some(0));
    }

    #[test]
    fn parse_docker_stats_invalid_json_line() {
        let output = "not valid json\n";
        assert!(parse_docker_stats(output).is_empty());
    }

    #[test]
    fn parse_docker_stats_missing_fields() {
        // JSON with no ID or Name → nothing inserted
        let output = r#"{"CPUPerc":"1.0%","MemUsage":"128MiB / 2GiB"}"#;
        let stats = parse_docker_stats(output);
        assert!(stats.is_empty());
    }

    #[test]
    fn parse_docker_stats_name_keyed() {
        let output =
            r#"{"ID":"","Name":"mycontainer","CPUPerc":"3.5%","MemUsage":"512MiB / 8GiB"}"#;
        let stats = parse_docker_stats(output);
        assert!(stats.contains_key("mycontainer"));
        assert!(!stats.contains_key(""));
        let (cpu, mem) = stats["mycontainer"];
        assert!((cpu - 3.5).abs() < f64::EPSILON);
        assert_eq!(mem, 512 * 1024 * 1024);
    }

    #[test]
    fn parse_docker_system_df_numeric_total_count() {
        // TotalCount as JSON number instead of string
        let output = r#"{"Active":"2","Reclaimable":"0B","Size":"1GiB","TotalCount":7,"Type":"Images","UniqueSize":"1GiB"}"#;
        let info = parse_docker_system_df(output).unwrap();
        assert_eq!(info.total_count, 7);
    }

    #[test]
    fn parse_docker_system_df_invalid_json() {
        assert!(parse_docker_system_df("not json\n").is_none());
    }

    #[test]
    fn parse_docker_ps_missing_fields() {
        // Minimal JSON with no recognized keys
        let output = r#"{"foo":"bar"}"#;
        let containers = parse_docker_ps(output);
        assert_eq!(containers.len(), 1);
        assert_eq!(containers[0].id, "");
        assert_eq!(containers[0].name, "");
    }

    #[test]
    fn parse_container_inspect_not_array() {
        // Valid JSON but not an array
        assert!(parse_container_inspect(r#"{"RestartCount": 1}"#).is_none());
    }

    #[test]
    fn parse_container_inspect_no_restart_count() {
        // Array with object missing RestartCount → defaults to 0
        let json = r#"[{"State": {"StartedAt": "2024-01-15T10:30:00Z"}}]"#;
        let (restart_count, started_at) = parse_container_inspect(json).unwrap();
        assert_eq!(restart_count, 0);
        assert!(started_at.is_some());
    }

    #[test]
    fn parse_size_string_binary_tib() {
        assert_eq!(parse_size_string_binary("1TiB"), 1024 * 1024 * 1024 * 1024);
    }

    #[test]
    fn parse_size_string_binary_decimal_suffixes() {
        assert_eq!(parse_size_string_binary("1TB"), 1_000_000_000_000);
        assert_eq!(parse_size_string_binary("1GB"), 1_000_000_000);
        assert_eq!(parse_size_string_binary("1MB"), 1_000_000);
        assert_eq!(parse_size_string_binary("1kB"), 1000);
    }

    #[test]
    fn parse_size_string_binary_unknown_suffix() {
        assert_eq!(parse_size_string_binary("100XB"), 0);
    }

    #[test]
    fn parse_size_string_binary_empty() {
        assert_eq!(parse_size_string_binary(""), 0);
    }

    #[test]
    fn parse_mem_usage_no_slash() {
        // Just a raw size without " / total"
        assert_eq!(parse_mem_usage("128MiB"), 128 * 1024 * 1024);
    }

    #[test]
    fn docker_socket_exists_existing_path() {
        // /tmp always exists on macOS/Linux
        assert!(docker_socket_exists(Path::new("/tmp")));
    }

    #[test]
    fn days_from_civil_leap_year() {
        // 2024-02-29 is valid (leap year)
        let ts = parse_iso8601_to_unix("2024-02-29T00:00:00Z");
        assert!(ts.is_some());
        // 2024-03-01 should be exactly 1 day later
        let ts_march = parse_iso8601_to_unix("2024-03-01T00:00:00Z").unwrap();
        assert_eq!(ts_march - ts.unwrap(), 86400);
    }

    #[test]
    fn parse_docker_stats_with_blank_lines() {
        let output = "\n{\"ID\":\"abc123\",\"Name\":\"web\",\"CPUPerc\":\"1.50%\",\"MemUsage\":\"50MiB / 1GiB\"}\n\n";
        let stats = parse_docker_stats(output);
        // Both ID and Name are inserted as keys
        assert_eq!(stats.len(), 2);
        assert!(stats.contains_key("abc123"));
        assert!(stats.contains_key("web"));
    }

    #[test]
    fn parse_docker_system_df_with_blank_lines() {
        let output = "\n{\"Type\":\"Images\",\"TotalCount\":\"5\",\"Size\":\"1.5GB\",\"Reclaimable\":\"500MB\"}\n\n";
        let result = parse_docker_system_df(output);
        assert!(result.is_some());
        let info = result.unwrap();
        assert_eq!(info.total_count, 5);
    }
}
