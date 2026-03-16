use crate::command::{self, CommandError};

/// A failed systemd service unit.
#[derive(Debug, Clone)]
pub struct FailedService {
    pub unit: String,
    pub load_state: String,
    pub active_state: String,
    pub sub_state: String,
    pub description: String,
}

/// Result of collecting systemd failed services.
#[derive(Debug, Clone)]
pub struct SystemdServicesInfo {
    pub failed_count: u32,
    pub failed: Vec<FailedService>,
}

/// Parse `systemctl list-units --state=failed --no-legend --plain` output.
///
/// Example output (--no-legend --plain, columns are space-padded for alignment):
/// ```text
/// nginx.service               loaded failed failed The nginx HTTP and reverse proxy server
/// foo.service                  loaded failed failed Foo Service
/// ```
///
/// Uses `split_whitespace()` to handle multi-space column alignment.
/// Only includes `.service` units (skips .timer, .socket, .mount, etc.).
pub fn parse_failed_units(output: &str) -> Vec<FailedService> {
    let mut services = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let mut iter = trimmed.split_whitespace();
        let Some(unit) = iter.next() else { continue };
        let Some(load_state) = iter.next() else {
            continue;
        };
        let Some(active_state) = iter.next() else {
            continue;
        };
        let Some(sub_state) = iter.next() else {
            continue;
        };
        let description: String = iter.collect::<Vec<_>>().join(" ");
        if description.is_empty() {
            continue;
        }

        // Only include .service units — skip .timer, .socket, .mount, .scope, etc.
        if !unit.ends_with(".service") {
            continue;
        }

        services.push(FailedService {
            unit: unit.to_string(),
            load_state: load_state.to_string(),
            active_state: active_state.to_string(),
            sub_state: sub_state.to_string(),
            description,
        });
    }

    services
}

/// Collect failed systemd services from the system.
///
/// Returns `None` if systemctl is not available.
pub async fn collect_failed_services() -> Option<SystemdServicesInfo> {
    if !command::command_exists("systemctl") {
        return None;
    }

    let output = command::run_command_default(
        "systemctl",
        &["list-units", "--state=failed", "--no-legend", "--plain"],
    )
    .await;

    let list_output = match output {
        Ok(s) => s,
        Err(CommandError::NotFound) => return None,
        // systemctl may exit 1 when there are failed units, so we handle ExitStatus too
        Err(CommandError::ExitStatus { stderr, .. }) => {
            tracing::debug!(stderr, "systemctl list-units returned non-zero");
            // Try to parse stderr as well, but it's usually empty for this command
            String::new()
        }
        Err(e) => {
            tracing::warn!(error = %e, "failed to run systemctl");
            return None;
        }
    };

    let failed = parse_failed_units(&list_output);
    #[allow(clippy::cast_possible_truncation)]
    let failed_count = failed.len() as u32;

    Some(SystemdServicesInfo {
        failed_count,
        failed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_failed_units_normal() {
        let output = "\
nginx.service loaded failed failed The nginx HTTP and reverse proxy server
foo.service loaded failed failed Foo Service
";
        let services = parse_failed_units(output);
        assert_eq!(services.len(), 2);
        assert_eq!(services[0].unit, "nginx.service");
        assert_eq!(services[0].load_state, "loaded");
        assert_eq!(services[0].active_state, "failed");
        assert_eq!(services[0].sub_state, "failed");
        assert_eq!(
            services[0].description,
            "The nginx HTTP and reverse proxy server"
        );
        assert_eq!(services[1].unit, "foo.service");
        assert_eq!(services[1].description, "Foo Service");
    }

    #[test]
    fn parse_failed_units_multi_space_alignment() {
        // Real systemctl output uses multi-space column alignment
        let output = "\
nginx.service               loaded failed failed The nginx HTTP and reverse proxy server
foo.service                  loaded failed failed Foo Service
";
        let services = parse_failed_units(output);
        assert_eq!(services.len(), 2);
        assert_eq!(services[0].unit, "nginx.service");
        assert_eq!(services[0].load_state, "loaded");
        assert_eq!(services[0].active_state, "failed");
        assert_eq!(services[0].sub_state, "failed");
        assert_eq!(
            services[0].description,
            "The nginx HTTP and reverse proxy server"
        );
        assert_eq!(services[1].unit, "foo.service");
        assert_eq!(services[1].load_state, "loaded");
        assert_eq!(services[1].description, "Foo Service");
    }

    #[test]
    fn parse_failed_units_filters_non_service_units() {
        let output = "\
nginx.service loaded failed failed The nginx HTTP and reverse proxy server
certbot.timer loaded failed failed Run certbot twice daily
dbus.socket loaded failed failed D-Bus System Message Bus Socket
";
        let services = parse_failed_units(output);
        assert_eq!(services.len(), 1);
        assert_eq!(services[0].unit, "nginx.service");
    }

    #[test]
    fn parse_failed_units_empty() {
        let services = parse_failed_units("");
        assert!(services.is_empty());
    }

    #[test]
    fn parse_failed_units_whitespace_only() {
        let services = parse_failed_units("   \n  \n");
        assert!(services.is_empty());
    }

    #[test]
    fn parse_failed_units_single_line() {
        let output = "mysql.service loaded failed failed MySQL Community Server\n";
        let services = parse_failed_units(output);
        assert_eq!(services.len(), 1);
        assert_eq!(services[0].unit, "mysql.service");
    }

    #[test]
    fn parse_failed_units_description_with_spaces() {
        let output = "my-long-service.service loaded failed failed A very long description with many words\n";
        let services = parse_failed_units(output);
        assert_eq!(services.len(), 1);
        assert_eq!(
            services[0].description,
            "A very long description with many words"
        );
    }

    #[test]
    fn parse_failed_units_too_few_fields() {
        let output = "nginx.service loaded\n";
        let services = parse_failed_units(output);
        assert!(services.is_empty());
    }
}
