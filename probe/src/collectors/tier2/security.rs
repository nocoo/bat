use std::path::Path;

use crate::command;

/// Result of collecting security posture information.
#[derive(Debug, Clone)]
pub struct SecurityPostureInfo {
    pub ssh_password_auth: Option<bool>,
    pub ssh_root_login: Option<String>,
    pub ssh_failed_logins_7d: Option<u64>,
    pub firewall_active: Option<bool>,
    pub firewall_default_policy: Option<String>,
    pub fail2ban_active: Option<bool>,
    pub fail2ban_banned_count: Option<u32>,
    pub unattended_upgrades_active: Option<bool>,
}

/// Parse `PasswordAuthentication` from `sshd_config` content.
///
/// Returns `Some(true)` if "yes", `Some(false)` if "no", `None` if not found.
/// OpenSSH uses first-match semantics.
pub fn parse_password_auth(content: &str) -> Option<bool> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if lower.starts_with("passwordauthentication") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 2 {
                return match parts[1].to_lowercase().as_str() {
                    "yes" => Some(true),
                    "no" => Some(false),
                    _ => None,
                };
            }
        }
    }
    None
}

/// Parse `PermitRootLogin` from `sshd_config` content.
///
/// Returns the value as-is: "yes", "no", "prohibit-password", "forced-commands-only".
/// OpenSSH uses first-match semantics.
pub fn parse_root_login(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.is_empty() {
            continue;
        }
        let lower = trimmed.to_lowercase();
        if lower.starts_with("permitrootlogin") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 2 {
                return Some(parts[1].to_lowercase());
            }
        }
    }
    None
}

/// Resolve `sshd_config` by merging main config with include directory.
///
/// OpenSSH uses first-match semantics: the first occurrence of a directive wins.
/// Include directives are processed at the point they appear.
pub fn resolve_sshd_config(
    main_content: &str,
    include_contents: &[String],
) -> (Option<bool>, Option<String>) {
    // Concatenate: include_contents first (since includes typically come early),
    // but we need to follow the actual Include order in the main config.
    // For simplicity, process main config and when we hit an Include,
    // inject the include contents at that point.

    let mut combined = String::new();

    for line in main_content.lines() {
        let trimmed = line.trim();
        let lower = trimmed.to_lowercase();
        if lower.starts_with("include") {
            // Inject all include contents at this point
            for include_content in include_contents {
                combined.push_str(include_content);
                combined.push('\n');
            }
        } else {
            combined.push_str(line);
            combined.push('\n');
        }
    }

    // If no Include directive found, append includes at the end
    // (they won't affect first-match if main config already has the directive)
    if !main_content.to_lowercase().contains("include") {
        for include_content in include_contents {
            combined.push_str(include_content);
            combined.push('\n');
        }
    }

    let password_auth = parse_password_auth(&combined);
    let root_login = parse_root_login(&combined);

    (password_auth, root_login)
}

/// Parse failed login count from journalctl output.
///
/// Counts lines containing "Failed password" or "authentication failure".
pub fn parse_failed_logins(output: &str) -> u64 {
    let mut count: u64 = 0;
    for line in output.lines() {
        let lower = line.to_lowercase();
        if lower.contains("failed password") || lower.contains("authentication failure") {
            count += 1;
        }
    }
    count
}

/// Parse `ufw status` output.
///
/// Returns (active, `default_policy`).
pub fn parse_ufw_status(output: &str) -> (bool, Option<String>) {
    let mut active = false;
    let mut default_policy = None;

    for line in output.lines() {
        let trimmed = line.trim().to_lowercase();
        if trimmed.starts_with("status:") {
            active = trimmed.contains("active") && !trimmed.contains("inactive");
        }
        if trimmed.starts_with("default:") {
            // "Default: deny (incoming), allow (outgoing), disabled (routed)"
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 2 {
                default_policy = Some(parts[1].trim_matches(',').to_string());
            }
        }
    }

    (active, default_policy)
}

/// Check if iptables has any non-default INPUT rules.
///
/// Runs `iptables -L INPUT -n` and checks for rules beyond the default
/// ACCEPT/DROP policy line and the header. Returns `true` if there are
/// user-defined rules (indicating an active firewall), `false` if only
/// default ACCEPT policy with no rules.
pub fn parse_iptables_input(output: &str) -> bool {
    let mut rule_count = 0;
    let mut has_non_accept_policy = false;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // "Chain INPUT (policy DROP)" or "Chain INPUT (policy ACCEPT)"
        if trimmed.starts_with("Chain INPUT") {
            if let Some(policy_start) = trimmed.find("policy ") {
                let policy = &trimmed[policy_start + 7..];
                let policy = policy.trim_end_matches(')');
                if policy != "ACCEPT" {
                    has_non_accept_policy = true;
                }
            }
            continue;
        }
        // Skip the column header line ("target     prot opt source  destination")
        if trimmed.starts_with("target") || trimmed.starts_with("num") {
            continue;
        }
        // Any other line is a rule
        rule_count += 1;
    }

    // Active firewall = either a restrictive default policy or user-defined rules
    has_non_accept_policy || rule_count > 0
}

/// Parse `fail2ban-client status sshd` output for banned count.
///
/// Looks for "Currently banned:" line.
pub fn parse_fail2ban_status(output: &str) -> Option<u32> {
    for line in output.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("Currently banned:")
            && let Ok(count) = rest.trim().parse::<u32>()
        {
            return Some(count);
        }
        // Also handle the tab-indented format
        let lower = trimmed.to_lowercase();
        if lower.contains("currently banned")
            && let Some(idx) = trimmed.rfind(':')
            && let Ok(count) = trimmed[idx + 1..].trim().parse::<u32>()
        {
            return Some(count);
        }
    }
    None
}

/// Read `sshd_config` from parameterized paths, handling Include directives.
pub fn read_sshd_config_from(
    main_path: &Path,
    config_dir: &Path,
) -> (Option<bool>, Option<String>) {
    let Ok(main_content) = std::fs::read_to_string(main_path) else {
        return (None, None);
    };

    // Read all .conf files from the include directory
    let mut include_contents = Vec::new();
    if let Ok(entries) = std::fs::read_dir(config_dir) {
        let mut paths: Vec<_> = entries
            .flatten()
            .filter(|e| e.path().extension().is_some_and(|ext| ext == "conf"))
            .map(|e| e.path())
            .collect();
        paths.sort(); // Process in alphabetical order
        for path in paths {
            if let Ok(content) = std::fs::read_to_string(&path) {
                include_contents.push(content);
            }
        }
    }

    resolve_sshd_config(&main_content, &include_contents)
}

/// Collect the full security posture from the system.
pub async fn collect_security_posture() -> SecurityPostureInfo {
    // SSH config
    let (ssh_password_auth, ssh_root_login) = read_sshd_config_from(
        Path::new("/etc/ssh/sshd_config"),
        Path::new("/etc/ssh/sshd_config.d"),
    );

    // Failed logins (last 7 days)
    let ssh_failed_logins_7d = match command::run_command_default(
        "journalctl",
        &["-u", "ssh", "--since", "7 days ago", "--no-pager", "-q"],
    )
    .await
    {
        Ok(output) => Some(parse_failed_logins(&output)),
        Err(_) => {
            // Try sshd unit name (varies by distro)
            command::run_command_default(
                "journalctl",
                &["-u", "sshd", "--since", "7 days ago", "--no-pager", "-q"],
            )
            .await
            .ok()
            .map(|output| parse_failed_logins(&output))
        }
    };

    // Firewall: try ufw first, then fall back to iptables
    let (firewall_active, firewall_default_policy) = if command::command_exists("ufw") {
        command::run_command_default("ufw", &["status"])
            .await
            .map_or((None, None), |output| {
                let (active, policy) = parse_ufw_status(&output);
                (Some(active), policy)
            })
    } else if command::command_exists("iptables") {
        // No ufw — check if iptables has any INPUT rules or a restrictive policy
        let active = command::run_command_default("iptables", &["-L", "INPUT", "-n"])
            .await
            .is_ok_and(|output| parse_iptables_input(&output));
        (Some(active), None)
    } else {
        // Neither ufw nor iptables available — definitively no firewall
        (Some(false), None)
    };

    // Fail2ban
    let (fail2ban_active, fail2ban_banned_count) = if command::command_exists("fail2ban-client") {
        let active = command::run_command_default("systemctl", &["is-active", "fail2ban"])
            .await
            .map_or(Some(false), |output| Some(output.trim() == "active"));

        let banned = command::run_command_default("fail2ban-client", &["status", "sshd"])
            .await
            .ok()
            .and_then(|output| parse_fail2ban_status(&output));

        (active, banned)
    } else {
        (None, None)
    };

    // Unattended upgrades
    let unattended_upgrades_active =
        command::run_command_default("systemctl", &["is-active", "unattended-upgrades"])
            .await
            .ok()
            .map(|output| output.trim() == "active");

    SecurityPostureInfo {
        ssh_password_auth,
        ssh_root_login,
        ssh_failed_logins_7d,
        firewall_active,
        firewall_default_policy,
        fail2ban_active,
        fail2ban_banned_count,
        unattended_upgrades_active,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_password_auth ---

    #[test]
    fn parse_password_auth_yes() {
        let config = "PasswordAuthentication yes\n";
        assert_eq!(parse_password_auth(config), Some(true));
    }

    #[test]
    fn parse_password_auth_no() {
        let config = "PasswordAuthentication no\n";
        assert_eq!(parse_password_auth(config), Some(false));
    }

    #[test]
    fn parse_password_auth_commented() {
        let config = "#PasswordAuthentication yes\nPermitRootLogin no\n";
        assert_eq!(parse_password_auth(config), None);
    }

    #[test]
    fn parse_password_auth_first_match() {
        let config = "PasswordAuthentication no\nPasswordAuthentication yes\n";
        assert_eq!(parse_password_auth(config), Some(false)); // first match wins
    }

    #[test]
    fn parse_password_auth_not_present() {
        let config = "PermitRootLogin no\nUsePAM yes\n";
        assert_eq!(parse_password_auth(config), None);
    }

    #[test]
    fn parse_password_auth_case_insensitive() {
        let config = "passwordauthentication YES\n";
        assert_eq!(parse_password_auth(config), Some(true));
    }

    // --- parse_root_login ---

    #[test]
    fn parse_root_login_yes() {
        let config = "PermitRootLogin yes\n";
        assert_eq!(parse_root_login(config), Some("yes".to_string()));
    }

    #[test]
    fn parse_root_login_no() {
        let config = "PermitRootLogin no\n";
        assert_eq!(parse_root_login(config), Some("no".to_string()));
    }

    #[test]
    fn parse_root_login_prohibit_password() {
        let config = "PermitRootLogin prohibit-password\n";
        assert_eq!(
            parse_root_login(config),
            Some("prohibit-password".to_string())
        );
    }

    #[test]
    fn parse_root_login_not_present() {
        let config = "PasswordAuthentication no\n";
        assert_eq!(parse_root_login(config), None);
    }

    #[test]
    fn parse_root_login_commented() {
        let config = "#PermitRootLogin yes\n";
        assert_eq!(parse_root_login(config), None);
    }

    // --- resolve_sshd_config ---

    #[test]
    fn resolve_sshd_config_main_only() {
        let main = "PasswordAuthentication yes\nPermitRootLogin no\n";
        let (pa, rl) = resolve_sshd_config(main, &[]);
        assert_eq!(pa, Some(true));
        assert_eq!(rl, Some("no".to_string()));
    }

    #[test]
    fn resolve_sshd_config_include_overrides() {
        let main = "Include /etc/ssh/sshd_config.d/*.conf\nPasswordAuthentication yes\n";
        let includes = vec!["PasswordAuthentication no\n".to_string()];
        let (pa, _) = resolve_sshd_config(main, &includes);
        // Include is processed first (at the point of Include directive), so "no" wins
        assert_eq!(pa, Some(false));
    }

    #[test]
    fn resolve_sshd_config_main_before_include() {
        let main = "PasswordAuthentication yes\nInclude /etc/ssh/sshd_config.d/*.conf\n";
        let includes = vec!["PasswordAuthentication no\n".to_string()];
        let (pa, _) = resolve_sshd_config(main, &includes);
        // Main comes first, so "yes" wins
        assert_eq!(pa, Some(true));
    }

    // --- parse_failed_logins ---

    #[test]
    fn parse_failed_logins_count() {
        let output = "\
Mar 15 10:00:00 host sshd[1234]: Failed password for root from 1.2.3.4 port 22 ssh2
Mar 15 10:01:00 host sshd[1235]: Failed password for admin from 5.6.7.8 port 22 ssh2
Mar 15 10:02:00 host sshd[1236]: Accepted publickey for user from 10.0.0.1 port 22 ssh2
Mar 15 10:03:00 host sshd[1237]: pam_unix(sshd:auth): authentication failure; logname= uid=0
";
        assert_eq!(parse_failed_logins(output), 3);
    }

    #[test]
    fn parse_failed_logins_empty() {
        assert_eq!(parse_failed_logins(""), 0);
    }

    #[test]
    fn parse_failed_logins_no_failures() {
        let output = "Mar 15 10:00:00 host sshd[1234]: Accepted publickey for user\n";
        assert_eq!(parse_failed_logins(output), 0);
    }

    // --- parse_ufw_status ---

    #[test]
    fn parse_ufw_status_active() {
        let output = "\
Status: active

To                         Action      From
--                         ------      ----
22                         ALLOW       Anywhere
Default: deny (incoming), allow (outgoing), disabled (routed)
";
        let (active, policy) = parse_ufw_status(output);
        assert!(active);
        assert_eq!(policy, Some("deny".to_string()));
    }

    #[test]
    fn parse_ufw_status_inactive() {
        let output = "Status: inactive\n";
        let (active, policy) = parse_ufw_status(output);
        assert!(!active);
        assert_eq!(policy, None);
    }

    #[test]
    fn parse_ufw_status_empty() {
        let (active, policy) = parse_ufw_status("");
        assert!(!active);
        assert_eq!(policy, None);
    }

    // --- parse_fail2ban_status ---

    #[test]
    fn parse_fail2ban_status_with_banned() {
        let output = "\
Status for the jail: sshd
|- Filter
|  |- Currently failed:\t5
|  `- Total failed:\t1000
`- Actions
   |- Currently banned:\t3
   `- Total banned:\t150
";
        assert_eq!(parse_fail2ban_status(output), Some(3));
    }

    #[test]
    fn parse_fail2ban_status_zero_banned() {
        let output = "   |- Currently banned:\t0\n";
        assert_eq!(parse_fail2ban_status(output), Some(0));
    }

    #[test]
    fn parse_fail2ban_status_no_match() {
        let output = "some random output\n";
        assert_eq!(parse_fail2ban_status(output), None);
    }

    #[test]
    fn parse_fail2ban_status_empty() {
        assert_eq!(parse_fail2ban_status(""), None);
    }

    // --- parse_iptables_input ---

    #[test]
    fn parse_iptables_drop_policy_no_rules() {
        let output = "\
Chain INPUT (policy DROP)
target     prot opt source               destination
";
        assert!(parse_iptables_input(output));
    }

    #[test]
    fn parse_iptables_accept_policy_with_rules() {
        let output = "\
Chain INPUT (policy ACCEPT)
target     prot opt source               destination
ACCEPT     tcp  --  0.0.0.0/0            0.0.0.0/0            tcp dpt:22
DROP       all  --  0.0.0.0/0            0.0.0.0/0
";
        assert!(parse_iptables_input(output));
    }

    #[test]
    fn parse_iptables_accept_policy_no_rules() {
        // Default ACCEPT with zero rules = no firewall
        let output = "\
Chain INPUT (policy ACCEPT)
target     prot opt source               destination
";
        assert!(!parse_iptables_input(output));
    }

    #[test]
    fn parse_iptables_empty() {
        assert!(!parse_iptables_input(""));
    }

    // --- read_sshd_config_from ---

    #[test]
    fn read_sshd_config_from_nonexistent() {
        let (pa, rl) = read_sshd_config_from(
            Path::new("/nonexistent_sshd_config_xyz"),
            Path::new("/nonexistent_dir_xyz"),
        );
        assert_eq!(pa, None);
        assert_eq!(rl, None);
    }
}
