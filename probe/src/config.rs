use serde::Deserialize;
use std::path::PathBuf;

const DEFAULT_CONFIG_PATH: &str = "/etc/bat/config.toml";
const DEFAULT_INTERVAL: u32 = 30;

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

fn default_interval() -> u32 {
    DEFAULT_INTERVAL
}

/// Determine config file path from CLI args.
/// Looks for `--config <path>`, falls back to `/etc/bat/config.toml`.
pub fn config_path_from_args(args: &[String]) -> PathBuf {
    for (i, arg) in args.iter().enumerate() {
        if arg == "--config" {
            if let Some(path) = args.get(i + 1) {
                return PathBuf::from(path);
            }
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

/// Parse config from a TOML string.
pub fn parse_config(content: &str) -> Result<Config, String> {
    toml::from_str(content).map_err(|e| format!("invalid config: {e}"))
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
}
