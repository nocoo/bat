use serde::Deserialize;
use std::path::PathBuf;

const DEFAULT_CONFIG_PATH: &str = "/etc/bat/config.toml";
const DEFAULT_INTERVAL: u32 = 30;
const MIN_INTERVAL: u32 = 10;

#[derive(Debug, Deserialize)]
pub struct Config {
    pub worker_url: String,
    pub write_key: String,
    pub host_id: Option<String>,
    #[serde(default = "default_interval")]
    pub interval: u32,
    #[serde(default)]
    pub disk: DiskConfig,
    #[serde(default)]
    pub network: NetworkConfig,
}

#[derive(Debug, Default, Deserialize)]
pub struct DiskConfig {
    #[serde(default)]
    pub exclude_mounts: Vec<String>,
    #[serde(default)]
    pub exclude_fs_types: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
pub struct NetworkConfig {
    #[serde(default)]
    pub exclude_interfaces: Vec<String>,
}

const fn default_interval() -> u32 {
    DEFAULT_INTERVAL
}

/// Determine config file path from CLI args.
/// Looks for `--config <path>`, falls back to `/etc/bat/config.toml`.
pub fn config_path_from_args(args: &[String]) -> PathBuf {
    for (i, arg) in args.iter().enumerate() {
        if arg == "--config"
            && let Some(path) = args.get(i + 1)
        {
            return PathBuf::from(path);
        }
    }
    PathBuf::from(DEFAULT_CONFIG_PATH)
}

/// Load and parse config from a TOML file.
pub fn load_config(path: &std::path::Path) -> Result<Config, String> {
    let content =
        std::fs::read_to_string(path).map_err(|e| format!("failed to read config: {e}"))?;
    parse_config(&content)
}

/// Validate that `worker_url` uses HTTPS (or HTTP for localhost only).
fn validate_worker_url(raw: &str) -> Result<(), String> {
    let parsed = url::Url::parse(raw).map_err(|e| format!("invalid worker_url: {e}"))?;

    match parsed.scheme() {
        "https" => Ok(()),
        "http" => {
            let is_loopback = match parsed.host() {
                Some(url::Host::Domain("localhost")) => true,
                Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
                Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
                _ => false,
            };
            if is_loopback {
                Ok(()) // allow http://localhost for development
            } else {
                Err("worker_url must use HTTPS (http:// only allowed for localhost)".into())
            }
        }
        scheme => Err(format!("unsupported URL scheme '{scheme}', expected https")),
    }
}

/// Parse config from a TOML string.
pub fn parse_config(content: &str) -> Result<Config, String> {
    let config: Config = toml::from_str(content).map_err(|e| format!("invalid config: {e}"))?;
    if config.interval < MIN_INTERVAL {
        return Err(format!(
            "invalid config: interval must be >= {MIN_INTERVAL} (got {})",
            config.interval
        ));
    }
    validate_worker_url(&config.worker_url)?;
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    const VALID_FULL: &str = r#"
worker_url = "https://bat-worker.example.workers.dev"
write_key = "secret-key"
host_id = "jp.nocoo.cloud"
interval = 60

[disk]
exclude_mounts = ["/boot/efi", "/snap"]
exclude_fs_types = ["tmpfs", "devtmpfs", "squashfs"]

[network]
exclude_interfaces = ["lo", "docker0"]
"#;

    const VALID_MINIMAL: &str = r#"
worker_url = "https://bat-worker.example.workers.dev"
write_key = "secret-key"
"#;

    const INVALID_MISSING_URL: &str = r#"
write_key = "secret-key"
"#;

    const INVALID_MISSING_KEY: &str = r#"
worker_url = "https://bat-worker.example.workers.dev"
"#;

    #[test]
    fn parse_full_config() {
        let cfg = parse_config(VALID_FULL).unwrap();
        assert_eq!(cfg.worker_url, "https://bat-worker.example.workers.dev");
        assert_eq!(cfg.write_key, "secret-key");
        assert_eq!(cfg.host_id.as_deref(), Some("jp.nocoo.cloud"));
        assert_eq!(cfg.interval, 60);
        assert_eq!(cfg.disk.exclude_mounts, vec!["/boot/efi", "/snap"]);
        assert_eq!(
            cfg.disk.exclude_fs_types,
            vec!["tmpfs", "devtmpfs", "squashfs"]
        );
        assert_eq!(cfg.network.exclude_interfaces, vec!["lo", "docker0"]);
    }

    #[test]
    fn parse_minimal_config_defaults() {
        let cfg = parse_config(VALID_MINIMAL).unwrap();
        assert_eq!(cfg.worker_url, "https://bat-worker.example.workers.dev");
        assert_eq!(cfg.write_key, "secret-key");
        assert!(cfg.host_id.is_none());
        assert_eq!(cfg.interval, 30);
        assert!(cfg.disk.exclude_mounts.is_empty());
        assert!(cfg.disk.exclude_fs_types.is_empty());
        assert!(cfg.network.exclude_interfaces.is_empty());
    }

    #[test]
    fn reject_missing_worker_url() {
        let result = parse_config(INVALID_MISSING_URL);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("worker_url"));
    }

    #[test]
    fn reject_missing_write_key() {
        let result = parse_config(INVALID_MISSING_KEY);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("write_key"));
    }

    #[test]
    fn config_path_from_cli_args() {
        let args = vec![
            "bat-probe".to_string(),
            "--config".to_string(),
            "/tmp/test.toml".to_string(),
        ];
        assert_eq!(
            config_path_from_args(&args),
            PathBuf::from("/tmp/test.toml")
        );
    }

    #[test]
    fn config_path_default() {
        let args = vec!["bat-probe".to_string()];
        assert_eq!(
            config_path_from_args(&args),
            PathBuf::from("/etc/bat/config.toml")
        );
    }

    #[test]
    fn config_path_missing_value_after_flag() {
        let args = vec!["bat-probe".to_string(), "--config".to_string()];
        assert_eq!(
            config_path_from_args(&args),
            PathBuf::from("/etc/bat/config.toml")
        );
    }

    #[test]
    fn reject_interval_zero() {
        let content = r#"
worker_url = "https://bat-worker.example.workers.dev"
write_key = "secret-key"
interval = 0
"#;
        let result = parse_config(content);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains(">= 10"));
    }

    #[test]
    fn reject_interval_below_minimum() {
        for interval in [1, 5, 9] {
            let content = format!(
                r#"
worker_url = "https://bat-worker.example.workers.dev"
write_key = "secret-key"
interval = {interval}
"#
            );
            let result = parse_config(&content);
            assert!(result.is_err(), "interval={interval} should be rejected");
            assert!(
                result.unwrap_err().contains(">= 10"),
                "interval={interval} error should mention >= 10"
            );
        }
    }

    #[test]
    fn accept_interval_minimum() {
        let content = r#"
worker_url = "https://bat-worker.example.workers.dev"
write_key = "secret-key"
interval = 10
"#;
        let cfg = parse_config(content).unwrap();
        assert_eq!(cfg.interval, 10);
    }

    #[test]
    fn reject_invalid_toml_syntax() {
        let result = parse_config("not valid toml {{{}");
        assert!(result.is_err());
    }

    #[test]
    fn accept_empty_host_id() {
        let content = r#"
worker_url = "https://bat-worker.example.workers.dev"
write_key = "secret-key"
host_id = ""
"#;
        let cfg = parse_config(content).unwrap();
        assert_eq!(cfg.host_id.as_deref(), Some(""));
    }

    #[test]
    fn load_config_from_tempfile() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        std::fs::write(
            &path,
            r#"
worker_url = "https://example.com"
write_key = "key123"
interval = 15
"#,
        )
        .unwrap();
        let cfg = load_config(&path).unwrap();
        assert_eq!(cfg.worker_url, "https://example.com");
        assert_eq!(cfg.write_key, "key123");
        assert_eq!(cfg.interval, 15);
    }

    #[test]
    fn load_config_missing_file() {
        let result = load_config(std::path::Path::new("/nonexistent/config.toml"));
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("failed to read config"));
    }

    #[test]
    fn reject_http_remote_url() {
        let content = r#"
worker_url = "http://api.example.com"
write_key = "secret-key"
"#;
        let result = parse_config(content);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("HTTPS"));
    }

    #[test]
    fn accept_https_url() {
        let content = r#"
worker_url = "https://api.example.com"
write_key = "secret-key"
"#;
        assert!(parse_config(content).is_ok());
    }

    #[test]
    fn accept_http_localhost() {
        let content = r#"
worker_url = "http://localhost:8080"
write_key = "secret-key"
"#;
        assert!(parse_config(content).is_ok());
    }

    #[test]
    fn accept_http_127_0_0_1() {
        let content = r#"
worker_url = "http://127.0.0.1:8080"
write_key = "secret-key"
"#;
        assert!(parse_config(content).is_ok());
    }

    #[test]
    fn accept_http_ipv6_loopback() {
        let content = r#"
worker_url = "http://[::1]:8080"
write_key = "secret-key"
"#;
        assert!(parse_config(content).is_ok());
    }

    #[test]
    fn reject_ftp_scheme() {
        let content = r#"
worker_url = "ftp://example.com"
write_key = "secret-key"
"#;
        let result = parse_config(content);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("unsupported URL scheme"));
    }

    #[test]
    fn reject_no_scheme() {
        let content = r#"
worker_url = "example.com"
write_key = "secret-key"
"#;
        let result = parse_config(content);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("invalid worker_url"));
    }
}
