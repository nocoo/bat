/// Website discovery — parse Nginx/Apache vhost configs to extract domains.
///
/// Best-effort parser: reads standard config paths, does not follow `include`
/// directives, skips unreadable files silently.
use serde::Serialize;
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredWebsite {
    pub domain: String,
    pub web_server: String, // "nginx" | "apache"
    pub ssl: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WebsiteDiscoveryData {
    pub sites: Vec<DiscoveredWebsite>,
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/// Collect website domains from Nginx and Apache configs.
/// Only runs if `detected_ids` contains "nginx" or "apache".
pub fn collect_websites(detected_ids: &[String]) -> Option<WebsiteDiscoveryData> {
    let has_nginx = detected_ids.iter().any(|id| id == "nginx");
    let has_apache = detected_ids.iter().any(|id| id == "apache");

    if !has_nginx && !has_apache {
        return None;
    }

    let mut sites = Vec::new();
    if has_nginx {
        sites.extend(parse_nginx_sites());
    }
    if has_apache {
        sites.extend(parse_apache_sites());
    }

    // Deduplicate by domain (keep ssl=true if any block serves it with SSL)
    sites.sort_by(|a, b| a.domain.cmp(&b.domain));
    sites.dedup_by(|a, b| {
        if a.domain == b.domain {
            b.ssl = b.ssl || a.ssl; // merge: if either has SSL, keep SSL
            true
        } else {
            false
        }
    });

    Some(WebsiteDiscoveryData { sites })
}

// ---------------------------------------------------------------------------
// Nginx parser
// ---------------------------------------------------------------------------

/// Scan standard Nginx config directories for server blocks.
#[cfg_attr(coverage_nightly, coverage(off))]
fn parse_nginx_sites() -> Vec<DiscoveredWebsite> {
    let mut sites = Vec::new();
    let paths = glob_config_files(&["/etc/nginx/sites-enabled/*", "/etc/nginx/conf.d/*.conf"]);

    for path in paths {
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue; // permission denied or missing → skip
        };
        sites.extend(extract_nginx_server_blocks(&content));
    }
    sites
}

/// Parse `server{}` blocks from Nginx config content.
/// Tracks brace nesting to associate `server_name` with listen directives.
pub fn extract_nginx_server_blocks(content: &str) -> Vec<DiscoveredWebsite> {
    let mut results = Vec::new();

    let mut in_server = false;
    let mut brace_depth: i32 = 0;
    let mut server_start_depth: i32 = 0;
    let mut ssl = false;
    let mut names: Vec<String> = Vec::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();

        // Skip comments
        if line.starts_with('#') {
            continue;
        }

        // Strip inline comments
        let line = line.split('#').next().unwrap_or(line).trim();

        if !in_server {
            // Look for `server {` or `server{`
            if let Some(rest) = line.strip_prefix("server") {
                let rest = rest.trim_start();
                if rest.starts_with('{') || rest.is_empty() {
                    in_server = true;
                    server_start_depth = brace_depth;
                    ssl = false;
                    names.clear();
                }
            }
        }

        // Count braces in the line
        for ch in line.chars() {
            if ch == '{' {
                brace_depth += 1;
            } else if ch == '}' {
                brace_depth -= 1;

                // Check if we're closing the server block
                if in_server && brace_depth == server_start_depth {
                    // Emit sites
                    for name in &names {
                        results.push(DiscoveredWebsite {
                            domain: name.clone(),
                            web_server: "nginx".to_string(),
                            ssl,
                        });
                    }
                    in_server = false;
                    names.clear();
                    ssl = false;
                }
            }
        }

        if !in_server {
            continue;
        }

        // Parse listen directives for SSL detection
        if line.starts_with("listen") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            // `listen 443 ssl;` or `listen [::]:443 ssl;` or `listen ... ssl`
            for part in &parts {
                if *part == "ssl" || part.trim_end_matches(';') == "ssl" {
                    ssl = true;
                }
            }
            // Port 443 implies SSL
            for part in &parts[1..] {
                let clean = part.trim_end_matches(';');
                if clean == "443"
                    || clean.ends_with(":443")
                    || clean == "[::]:443"
                    || clean.starts_with("443")
                {
                    ssl = true;
                }
            }
        }

        // Parse server_name directive
        if let Some(rest) = line.strip_prefix("server_name") {
            let rest = rest.trim().trim_end_matches(';');
            for name in rest.split_whitespace() {
                let name = name.trim();
                if is_valid_domain(name) {
                    names.push(name.to_string());
                }
            }
        }
    }

    results
}

// ---------------------------------------------------------------------------
// Apache parser
// ---------------------------------------------------------------------------

/// Scan standard Apache config directories for `VirtualHost` blocks.
#[cfg_attr(coverage_nightly, coverage(off))]
fn parse_apache_sites() -> Vec<DiscoveredWebsite> {
    let mut sites = Vec::new();
    let paths = glob_config_files(&[
        "/etc/apache2/sites-enabled/*.conf",
        "/etc/httpd/conf.d/*.conf",
    ]);

    for path in paths {
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        sites.extend(extract_apache_vhosts(&content));
    }
    sites
}

/// Parse `<VirtualHost>` blocks from Apache config content.
pub fn extract_apache_vhosts(content: &str) -> Vec<DiscoveredWebsite> {
    let mut results = Vec::new();

    let mut in_vhost = false;
    let mut ssl = false;
    let mut names: Vec<String> = Vec::new();

    for raw_line in content.lines() {
        let line = raw_line.trim();

        // Skip comments
        if line.starts_with('#') {
            continue;
        }

        // Detect VirtualHost open
        if line.starts_with("<VirtualHost") {
            in_vhost = true;
            ssl = false;
            names.clear();

            // Check for port 443 in the VirtualHost declaration
            // e.g., <VirtualHost *:443> or <VirtualHost 10.0.0.1:443>
            if line.contains(":443") {
                ssl = true;
            }
            continue;
        }

        // Detect VirtualHost close
        if line.starts_with("</VirtualHost") {
            if in_vhost {
                for name in &names {
                    results.push(DiscoveredWebsite {
                        domain: name.clone(),
                        web_server: "apache".to_string(),
                        ssl,
                    });
                }
            }
            in_vhost = false;
            names.clear();
            ssl = false;
            continue;
        }

        if !in_vhost {
            continue;
        }

        // SSLEngine on → SSL
        if let Some(rest) = line.strip_prefix("SSLEngine") {
            let rest = rest.trim().trim_end_matches(';');
            if rest.eq_ignore_ascii_case("on") {
                ssl = true;
            }
        }

        // ServerName
        if let Some(rest) = line.strip_prefix("ServerName") {
            let rest = rest.trim();
            if is_valid_domain(rest) {
                names.push(rest.to_string());
            }
        }

        // ServerAlias (can have multiple space-separated names)
        if let Some(rest) = line.strip_prefix("ServerAlias") {
            let rest = rest.trim();
            for name in rest.split_whitespace() {
                let name = name.trim();
                if is_valid_domain(name) {
                    names.push(name.to_string());
                }
            }
        }
    }

    results
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Check if a name is a valid domain (not `_`, localhost, empty, or IP-like).
fn is_valid_domain(name: &str) -> bool {
    if name.is_empty() || name == "_" || name == "localhost" {
        return false;
    }

    // Skip IP-like patterns: digits and dots only
    if name
        .chars()
        .all(|c| c.is_ascii_digit() || c == '.' || c == ':')
    {
        return false;
    }

    // Must contain at least one dot (minimal domain: "a.b")
    if !name.contains('.') {
        return false;
    }

    true
}

/// Glob config files from the given patterns.
/// Supports simple patterns: "/dir/path/*" and "/dir/path/*.ext"
/// Silently returns empty if paths don't exist or aren't readable.
#[cfg_attr(coverage_nightly, coverage(off))]
fn glob_config_files(patterns: &[&str]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for pattern in patterns {
        // Split into directory and filename pattern
        let path = std::path::Path::new(pattern);
        let Some(dir) = path.parent() else {
            continue;
        };
        let Some(file_pattern) = path.file_name().and_then(|f| f.to_str()) else {
            continue;
        };

        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let name = entry.file_name();
            let Some(name_str) = name.to_str() else {
                continue;
            };

            let matches = if file_pattern == "*" {
                // Match all files (but skip hidden)
                !name_str.starts_with('.')
            } else if let Some(ext) = file_pattern.strip_prefix("*.") {
                // Match by extension (e.g., "*.conf")
                name_str.ends_with(&format!(".{ext}"))
            } else {
                name_str == file_pattern
            };

            if matches {
                files.push(entry.path());
            }
        }
    }
    files.sort(); // deterministic order
    files
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    // --- is_valid_domain ---

    #[test]
    fn valid_domain_normal() {
        assert!(is_valid_domain("lizheng.me"));
        assert!(is_valid_domain("bbs.tongji.net"));
        assert!(is_valid_domain("sub.example.com"));
    }

    #[test]
    fn valid_domain_rejects_underscore() {
        assert!(!is_valid_domain("_"));
    }

    #[test]
    fn valid_domain_rejects_localhost() {
        assert!(!is_valid_domain("localhost"));
    }

    #[test]
    fn valid_domain_rejects_empty() {
        assert!(!is_valid_domain(""));
    }

    #[test]
    fn valid_domain_rejects_ip() {
        assert!(!is_valid_domain("192.168.1.1"));
        assert!(!is_valid_domain("10.0.0.1"));
        assert!(!is_valid_domain("127.0.0.1"));
    }

    #[test]
    fn valid_domain_rejects_no_dot() {
        assert!(!is_valid_domain("example"));
    }

    // --- Nginx parser ---

    #[test]
    fn nginx_single_server_block() {
        let config = r#"
server {
    listen 80;
    server_name example.com;
    root /var/www/example;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 1);
        assert_eq!(sites[0].domain, "example.com");
        assert_eq!(sites[0].web_server, "nginx");
        assert!(!sites[0].ssl);
    }

    #[test]
    fn nginx_ssl_listen_443() {
        let config = r#"
server {
    listen 443 ssl;
    server_name secure.example.com;
    ssl_certificate /etc/ssl/certs/cert.pem;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 1);
        assert!(sites[0].ssl);
    }

    #[test]
    fn nginx_ssl_listen_port_443() {
        let config = r#"
server {
    listen 443;
    server_name secure.example.com;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 1);
        assert!(sites[0].ssl);
    }

    #[test]
    fn nginx_ssl_ipv6_443() {
        let config = r#"
server {
    listen [::]:443 ssl;
    server_name secure.example.com;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 1);
        assert!(sites[0].ssl);
    }

    #[test]
    fn nginx_multiple_server_blocks() {
        let config = r#"
server {
    listen 80;
    server_name blog.example.com;
}

server {
    listen 443 ssl;
    server_name shop.example.com;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 2);
        assert_eq!(sites[0].domain, "blog.example.com");
        assert!(!sites[0].ssl);
        assert_eq!(sites[1].domain, "shop.example.com");
        assert!(sites[1].ssl);
    }

    #[test]
    fn nginx_multiple_server_names() {
        let config = r#"
server {
    listen 80;
    server_name example.com www.example.com api.example.com;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 3);
        assert_eq!(sites[0].domain, "example.com");
        assert_eq!(sites[1].domain, "www.example.com");
        assert_eq!(sites[2].domain, "api.example.com");
    }

    #[test]
    fn nginx_filters_underscore_and_localhost() {
        let config = r#"
server {
    listen 80;
    server_name _ localhost 192.168.1.1;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert!(sites.is_empty());
    }

    #[test]
    fn nginx_skips_comments() {
        let config = r#"
server {
    listen 80;
    # server_name commented.example.com;
    server_name real.example.com;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 1);
        assert_eq!(sites[0].domain, "real.example.com");
    }

    #[test]
    fn nginx_inline_comments() {
        let config = r#"
server {
    listen 80;
    server_name real.example.com; # primary domain
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 1);
        assert_eq!(sites[0].domain, "real.example.com");
    }

    #[test]
    fn nginx_nested_location_blocks() {
        let config = r#"
server {
    listen 443 ssl;
    server_name nested.example.com;

    location / {
        proxy_pass http://backend;
    }

    location /api {
        proxy_pass http://api-backend;
    }
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 1);
        assert_eq!(sites[0].domain, "nested.example.com");
        assert!(sites[0].ssl);
    }

    #[test]
    fn nginx_http_to_https_redirect() {
        let config = r#"
server {
    listen 80;
    server_name example.com;
    return 301 https://example.com$request_uri;
}

server {
    listen 443 ssl;
    server_name example.com;
    root /var/www/example;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert_eq!(sites.len(), 2);
        // Both should have example.com
        assert!(sites.iter().all(|s| s.domain == "example.com"));
        // One SSL, one not
        assert!(sites.iter().any(|s| s.ssl));
        assert!(sites.iter().any(|s| !s.ssl));
    }

    #[test]
    fn nginx_empty_config() {
        let sites = extract_nginx_server_blocks("");
        assert!(sites.is_empty());
    }

    #[test]
    fn nginx_no_server_blocks() {
        let config = r#"
http {
    include /etc/nginx/mime.types;
    gzip on;
}
"#;
        let sites = extract_nginx_server_blocks(config);
        assert!(sites.is_empty());
    }

    // --- Apache parser ---

    #[test]
    fn apache_single_vhost() {
        let config = r#"
<VirtualHost *:80>
    ServerName example.com
    DocumentRoot /var/www/example
</VirtualHost>
"#;
        let sites = extract_apache_vhosts(config);
        assert_eq!(sites.len(), 1);
        assert_eq!(sites[0].domain, "example.com");
        assert_eq!(sites[0].web_server, "apache");
        assert!(!sites[0].ssl);
    }

    #[test]
    fn apache_ssl_vhost_port_443() {
        let config = r#"
<VirtualHost *:443>
    ServerName secure.example.com
    SSLCertificateFile /etc/ssl/certs/cert.pem
</VirtualHost>
"#;
        let sites = extract_apache_vhosts(config);
        assert_eq!(sites.len(), 1);
        assert!(sites[0].ssl);
    }

    #[test]
    fn apache_ssl_engine_on() {
        let config = r#"
<VirtualHost *:80>
    ServerName secure.example.com
    SSLEngine on
</VirtualHost>
"#;
        let sites = extract_apache_vhosts(config);
        assert_eq!(sites.len(), 1);
        assert!(sites[0].ssl);
    }

    #[test]
    fn apache_server_alias() {
        let config = r#"
<VirtualHost *:80>
    ServerName example.com
    ServerAlias www.example.com cdn.example.com
</VirtualHost>
"#;
        let sites = extract_apache_vhosts(config);
        assert_eq!(sites.len(), 3);
        assert_eq!(sites[0].domain, "example.com");
        assert_eq!(sites[1].domain, "www.example.com");
        assert_eq!(sites[2].domain, "cdn.example.com");
    }

    #[test]
    fn apache_multiple_vhosts() {
        let config = r#"
<VirtualHost *:80>
    ServerName blog.example.com
</VirtualHost>

<VirtualHost *:443>
    ServerName shop.example.com
</VirtualHost>
"#;
        let sites = extract_apache_vhosts(config);
        assert_eq!(sites.len(), 2);
        assert!(!sites[0].ssl);
        assert!(sites[1].ssl);
    }

    #[test]
    fn apache_skips_comments() {
        let config = r#"
<VirtualHost *:80>
    # ServerName commented.example.com
    ServerName real.example.com
</VirtualHost>
"#;
        let sites = extract_apache_vhosts(config);
        assert_eq!(sites.len(), 1);
        assert_eq!(sites[0].domain, "real.example.com");
    }

    #[test]
    fn apache_empty_config() {
        let sites = extract_apache_vhosts("");
        assert!(sites.is_empty());
    }

    #[test]
    fn apache_ip_based_vhost() {
        let config = r#"
<VirtualHost 10.0.0.1:443>
    ServerName example.com
</VirtualHost>
"#;
        let sites = extract_apache_vhosts(config);
        assert_eq!(sites.len(), 1);
        assert!(sites[0].ssl);
    }

    // --- collect_websites ---

    #[test]
    fn collect_websites_none_when_no_webserver() {
        let ids: Vec<String> = vec!["redis".to_string(), "postgres".to_string()];
        let result = collect_websites(&ids);
        assert!(result.is_none());
    }

    // --- Deduplication ---

    #[test]
    fn dedup_merges_ssl() {
        // Simulate two blocks for the same domain: one SSL, one not
        let mut sites = vec![
            DiscoveredWebsite {
                domain: "example.com".to_string(),
                web_server: "nginx".to_string(),
                ssl: false,
            },
            DiscoveredWebsite {
                domain: "example.com".to_string(),
                web_server: "nginx".to_string(),
                ssl: true,
            },
        ];

        sites.sort_by(|a, b| a.domain.cmp(&b.domain));
        sites.dedup_by(|a, b| {
            if a.domain == b.domain {
                b.ssl = b.ssl || a.ssl;
                true
            } else {
                false
            }
        });

        assert_eq!(sites.len(), 1);
        assert!(sites[0].ssl);
    }

    #[test]
    fn dedup_keeps_different_domains() {
        let mut sites = vec![
            DiscoveredWebsite {
                domain: "a.example.com".to_string(),
                web_server: "nginx".to_string(),
                ssl: false,
            },
            DiscoveredWebsite {
                domain: "b.example.com".to_string(),
                web_server: "nginx".to_string(),
                ssl: true,
            },
        ];

        sites.sort_by(|a, b| a.domain.cmp(&b.domain));
        sites.dedup_by(|a, b| {
            if a.domain == b.domain {
                b.ssl = b.ssl || a.ssl;
                true
            } else {
                false
            }
        });

        assert_eq!(sites.len(), 2);
    }
}
