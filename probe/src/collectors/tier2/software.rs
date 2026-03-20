use std::collections::{HashMap, HashSet};
use std::time::Instant;

use crate::collectors::tier2::ports::ListeningPort;
use crate::command;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A single detected software item.
#[derive(Debug, Clone)]
pub struct DetectedSoftware {
    pub id: String,
    pub name: String,
    pub category: String,
    pub version: Option<String>,
    pub source: String,
    pub running: bool,
    pub listening_ports: Vec<u16>,
}

/// Aggregate result of software discovery.
#[derive(Debug, Clone)]
pub struct SoftwareDiscoveryInfo {
    pub detected: Vec<DetectedSoftware>,
    pub scan_duration_ms: u64,
    pub version_duration_ms: u64,
}

// ---------------------------------------------------------------------------
// Software registry — static lookup table
// ---------------------------------------------------------------------------

struct DetectRules {
    /// (port, `process_name_prefix`)
    ports: &'static [(u16, &'static str)],
    /// /proc/*/comm matches
    process_names: &'static [&'static str],
    /// systemd unit file name patterns (without .service suffix)
    systemd_units: &'static [&'static str],
    /// Binary names for `which`-style lookup
    binary_names: &'static [&'static str],
    /// Debian package names for dpkg-query
    dpkg_names: &'static [&'static str],
}

pub struct SoftwareSignature {
    id: &'static str,
    name: &'static str,
    category: &'static str,
    detect: DetectRules,
}

static REGISTRY: &[SoftwareSignature] = &[
    // --- Web servers & reverse proxies ---
    SoftwareSignature {
        id: "nginx",
        name: "Nginx",
        category: "web",
        detect: DetectRules {
            ports: &[(80, "nginx"), (443, "nginx")],
            process_names: &["nginx"],
            systemd_units: &["nginx"],
            binary_names: &["nginx"],
            dpkg_names: &["nginx"],
        },
    },
    SoftwareSignature {
        id: "apache",
        name: "Apache",
        category: "web",
        detect: DetectRules {
            ports: &[
                (80, "apache"),
                (443, "apache"),
                (80, "httpd"),
                (443, "httpd"),
            ],
            process_names: &["apache2", "httpd"],
            systemd_units: &["apache2", "httpd"],
            binary_names: &["apache2", "httpd"],
            dpkg_names: &["apache2"],
        },
    },
    SoftwareSignature {
        id: "caddy",
        name: "Caddy",
        category: "web",
        detect: DetectRules {
            ports: &[(80, "caddy"), (443, "caddy")],
            process_names: &["caddy"],
            systemd_units: &["caddy"],
            binary_names: &["caddy"],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "traefik",
        name: "Traefik",
        category: "web",
        detect: DetectRules {
            ports: &[(80, "traefik"), (443, "traefik"), (8080, "traefik")],
            process_names: &["traefik"],
            systemd_units: &["traefik"],
            binary_names: &["traefik"],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "haproxy",
        name: "HAProxy",
        category: "web",
        detect: DetectRules {
            ports: &[(80, "haproxy"), (443, "haproxy")],
            process_names: &["haproxy"],
            systemd_units: &["haproxy"],
            binary_names: &["haproxy"],
            dpkg_names: &["haproxy"],
        },
    },
    // --- Databases ---
    SoftwareSignature {
        id: "postgres",
        name: "PostgreSQL",
        category: "database",
        detect: DetectRules {
            ports: &[(5432, "postgres")],
            process_names: &["postgres"],
            systemd_units: &["postgresql"],
            binary_names: &["psql"],
            dpkg_names: &["postgresql"],
        },
    },
    SoftwareSignature {
        id: "mysql",
        name: "MySQL/MariaDB",
        category: "database",
        detect: DetectRules {
            ports: &[(3306, "mysqld"), (3306, "mariadbd")],
            process_names: &["mysqld", "mariadbd"],
            systemd_units: &["mysql", "mysqld", "mariadb"],
            binary_names: &["mysql", "mariadb"],
            dpkg_names: &["mysql-server", "mariadb-server"],
        },
    },
    SoftwareSignature {
        id: "mongodb",
        name: "MongoDB",
        category: "database",
        detect: DetectRules {
            ports: &[(27017, "mongod")],
            process_names: &["mongod", "mongos"],
            systemd_units: &["mongod"],
            binary_names: &["mongod"],
            dpkg_names: &["mongodb-org-server"],
        },
    },
    SoftwareSignature {
        id: "sqlite",
        name: "SQLite3",
        category: "database",
        detect: DetectRules {
            ports: &[],
            process_names: &[],
            systemd_units: &[],
            binary_names: &["sqlite3"],
            dpkg_names: &["sqlite3"],
        },
    },
    SoftwareSignature {
        id: "clickhouse",
        name: "ClickHouse",
        category: "database",
        detect: DetectRules {
            ports: &[(8123, "clickhouse"), (9000, "clickhouse")],
            process_names: &["clickhouse"],
            systemd_units: &["clickhouse-server"],
            binary_names: &["clickhouse"],
            dpkg_names: &["clickhouse-server"],
        },
    },
    // --- Caches & message queues ---
    SoftwareSignature {
        id: "redis",
        name: "Redis",
        category: "cache",
        detect: DetectRules {
            ports: &[(6379, "redis")],
            process_names: &["redis-server"],
            systemd_units: &["redis", "redis-server"],
            binary_names: &["redis-server"],
            dpkg_names: &["redis-server"],
        },
    },
    SoftwareSignature {
        id: "memcached",
        name: "Memcached",
        category: "cache",
        detect: DetectRules {
            ports: &[(11211, "memcached")],
            process_names: &["memcached"],
            systemd_units: &["memcached"],
            binary_names: &["memcached"],
            dpkg_names: &["memcached"],
        },
    },
    SoftwareSignature {
        id: "rabbitmq",
        name: "RabbitMQ",
        category: "queue",
        detect: DetectRules {
            ports: &[(5672, "beam")],
            process_names: &["beam.smp"],
            systemd_units: &["rabbitmq-server"],
            binary_names: &["rabbitmqctl"],
            dpkg_names: &["rabbitmq-server"],
        },
    },
    SoftwareSignature {
        id: "kafka",
        name: "Kafka",
        category: "queue",
        detect: DetectRules {
            ports: &[(9092, "java")],
            process_names: &[],
            systemd_units: &["kafka"],
            binary_names: &[],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "nats",
        name: "NATS",
        category: "queue",
        detect: DetectRules {
            ports: &[(4222, "nats-server")],
            process_names: &["nats-server"],
            systemd_units: &["nats"],
            binary_names: &["nats-server"],
            dpkg_names: &[],
        },
    },
    // --- Runtimes & languages ---
    SoftwareSignature {
        id: "node",
        name: "Node.js",
        category: "runtime",
        detect: DetectRules {
            ports: &[],
            process_names: &["node"],
            systemd_units: &[],
            binary_names: &["node"],
            dpkg_names: &["nodejs"],
        },
    },
    SoftwareSignature {
        id: "python",
        name: "Python 3",
        category: "runtime",
        detect: DetectRules {
            ports: &[],
            process_names: &["python3"],
            systemd_units: &[],
            binary_names: &["python3"],
            dpkg_names: &["python3"],
        },
    },
    SoftwareSignature {
        id: "go",
        name: "Go",
        category: "runtime",
        detect: DetectRules {
            ports: &[],
            process_names: &[],
            systemd_units: &[],
            binary_names: &["go"],
            dpkg_names: &["golang"],
        },
    },
    SoftwareSignature {
        id: "rust",
        name: "Rust",
        category: "runtime",
        detect: DetectRules {
            ports: &[],
            process_names: &[],
            systemd_units: &[],
            binary_names: &["rustc"],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "java",
        name: "Java",
        category: "runtime",
        detect: DetectRules {
            ports: &[],
            process_names: &["java"],
            systemd_units: &[],
            binary_names: &["java"],
            dpkg_names: &["default-jre"],
        },
    },
    SoftwareSignature {
        id: "php",
        name: "PHP",
        category: "runtime",
        detect: DetectRules {
            ports: &[],
            process_names: &["php-fpm", "php"],
            systemd_units: &["php-fpm"],
            binary_names: &["php"],
            dpkg_names: &["php"],
        },
    },
    SoftwareSignature {
        id: "ruby",
        name: "Ruby",
        category: "runtime",
        detect: DetectRules {
            ports: &[],
            process_names: &[],
            systemd_units: &[],
            binary_names: &["ruby"],
            dpkg_names: &["ruby"],
        },
    },
    SoftwareSignature {
        id: "bun",
        name: "Bun",
        category: "runtime",
        detect: DetectRules {
            ports: &[],
            process_names: &["bun"],
            systemd_units: &[],
            binary_names: &["bun"],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "deno",
        name: "Deno",
        category: "runtime",
        detect: DetectRules {
            ports: &[],
            process_names: &["deno"],
            systemd_units: &[],
            binary_names: &["deno"],
            dpkg_names: &[],
        },
    },
    // --- Container & orchestration ---
    SoftwareSignature {
        id: "docker",
        name: "Docker",
        category: "container",
        detect: DetectRules {
            ports: &[],
            process_names: &["dockerd"],
            systemd_units: &["docker"],
            binary_names: &["docker"],
            dpkg_names: &["docker-ce"],
        },
    },
    SoftwareSignature {
        id: "podman",
        name: "Podman",
        category: "container",
        detect: DetectRules {
            ports: &[],
            process_names: &["podman"],
            systemd_units: &["podman"],
            binary_names: &["podman"],
            dpkg_names: &["podman"],
        },
    },
    SoftwareSignature {
        id: "containerd",
        name: "containerd",
        category: "container",
        detect: DetectRules {
            ports: &[],
            process_names: &["containerd"],
            systemd_units: &["containerd"],
            binary_names: &["containerd"],
            dpkg_names: &["containerd"],
        },
    },
    SoftwareSignature {
        id: "k3s",
        name: "K3s",
        category: "container",
        detect: DetectRules {
            ports: &[(6443, "k3s")],
            process_names: &["k3s"],
            systemd_units: &["k3s"],
            binary_names: &["k3s"],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "portainer",
        name: "Portainer",
        category: "container",
        detect: DetectRules {
            ports: &[(9000, "portainer"), (9443, "portainer")],
            process_names: &["portainer"],
            systemd_units: &[],
            binary_names: &[],
            dpkg_names: &[],
        },
    },
    // --- Monitoring & observability ---
    SoftwareSignature {
        id: "prometheus",
        name: "Prometheus",
        category: "monitoring",
        detect: DetectRules {
            ports: &[(9090, "prometheus")],
            process_names: &["prometheus"],
            systemd_units: &["prometheus"],
            binary_names: &["prometheus"],
            dpkg_names: &["prometheus"],
        },
    },
    SoftwareSignature {
        id: "grafana",
        name: "Grafana",
        category: "monitoring",
        detect: DetectRules {
            ports: &[(3000, "grafana")],
            process_names: &["grafana"],
            systemd_units: &["grafana-server"],
            binary_names: &["grafana-server"],
            dpkg_names: &["grafana"],
        },
    },
    SoftwareSignature {
        id: "node_exporter",
        name: "node_exporter",
        category: "monitoring",
        detect: DetectRules {
            ports: &[(9100, "node_exporte")],
            process_names: &["node_exporter"],
            systemd_units: &["node_exporter"],
            binary_names: &["node_exporter"],
            dpkg_names: &["prometheus-node-exporter"],
        },
    },
    SoftwareSignature {
        id: "zabbix_agent",
        name: "Zabbix Agent",
        category: "monitoring",
        detect: DetectRules {
            ports: &[(10050, "zabbix")],
            process_names: &["zabbix_agentd"],
            systemd_units: &["zabbix-agent"],
            binary_names: &["zabbix_agentd"],
            dpkg_names: &["zabbix-agent"],
        },
    },
    SoftwareSignature {
        id: "uptime_kuma",
        name: "Uptime Kuma",
        category: "monitoring",
        detect: DetectRules {
            ports: &[(3001, "node")],
            process_names: &[],
            systemd_units: &["uptime-kuma"],
            binary_names: &[],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "umami",
        name: "Umami",
        category: "monitoring",
        detect: DetectRules {
            ports: &[(3000, "node")],
            process_names: &[],
            systemd_units: &[],
            binary_names: &[],
            dpkg_names: &[],
        },
    },
    // --- Security ---
    SoftwareSignature {
        id: "crowdsec",
        name: "CrowdSec",
        category: "security",
        detect: DetectRules {
            ports: &[],
            process_names: &["crowdsec"],
            systemd_units: &["crowdsec"],
            binary_names: &["cscli"],
            dpkg_names: &["crowdsec"],
        },
    },
    SoftwareSignature {
        id: "wireguard",
        name: "WireGuard",
        category: "security",
        detect: DetectRules {
            ports: &[],
            process_names: &[],
            systemd_units: &["wg-quick@"],
            binary_names: &["wg"],
            dpkg_names: &["wireguard-tools"],
        },
    },
    SoftwareSignature {
        id: "openvpn",
        name: "OpenVPN",
        category: "security",
        detect: DetectRules {
            ports: &[(1194, "openvpn")],
            process_names: &["openvpn"],
            systemd_units: &["openvpn"],
            binary_names: &["openvpn"],
            dpkg_names: &["openvpn"],
        },
    },
    // --- Proxies & tunnels ---
    SoftwareSignature {
        id: "frps",
        name: "frp Server",
        category: "proxy",
        detect: DetectRules {
            ports: &[(7000, "frps"), (7500, "frps")],
            process_names: &["frps"],
            systemd_units: &["frps"],
            binary_names: &["frps"],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "frpc",
        name: "frp Client",
        category: "proxy",
        detect: DetectRules {
            ports: &[],
            process_names: &["frpc"],
            systemd_units: &["frpc"],
            binary_names: &["frpc"],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "xray",
        name: "Xray",
        category: "proxy",
        detect: DetectRules {
            ports: &[],
            process_names: &["xray"],
            systemd_units: &["xray"],
            binary_names: &["xray"],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "v2ray",
        name: "V2Ray",
        category: "proxy",
        detect: DetectRules {
            ports: &[],
            process_names: &["v2ray"],
            systemd_units: &["v2ray"],
            binary_names: &["v2ray"],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "clash",
        name: "Clash",
        category: "proxy",
        detect: DetectRules {
            ports: &[(7890, "clash"), (9090, "clash")],
            process_names: &["clash"],
            systemd_units: &["clash"],
            binary_names: &["clash"],
            dpkg_names: &[],
        },
    },
    // --- Infrastructure ---
    SoftwareSignature {
        id: "sshd",
        name: "OpenSSH",
        category: "infra",
        detect: DetectRules {
            ports: &[(22, "sshd")],
            process_names: &["sshd"],
            systemd_units: &["sshd", "ssh"],
            binary_names: &["sshd"],
            dpkg_names: &["openssh-server"],
        },
    },
    SoftwareSignature {
        id: "cron",
        name: "Cron",
        category: "infra",
        detect: DetectRules {
            ports: &[],
            process_names: &["cron", "crond"],
            systemd_units: &["cron", "crond"],
            binary_names: &[],
            dpkg_names: &["cron"],
        },
    },
    SoftwareSignature {
        id: "resolved",
        name: "systemd-resolved",
        category: "infra",
        detect: DetectRules {
            ports: &[],
            process_names: &["systemd-resolve"],
            systemd_units: &["systemd-resolved"],
            binary_names: &[],
            dpkg_names: &[],
        },
    },
    SoftwareSignature {
        id: "dnsmasq",
        name: "dnsmasq",
        category: "infra",
        detect: DetectRules {
            ports: &[(53, "dnsmasq")],
            process_names: &["dnsmasq"],
            systemd_units: &["dnsmasq"],
            binary_names: &["dnsmasq"],
            dpkg_names: &["dnsmasq"],
        },
    },
    SoftwareSignature {
        id: "postfix",
        name: "Postfix",
        category: "infra",
        detect: DetectRules {
            ports: &[(25, "master"), (25, "postfix")],
            process_names: &["master"],
            systemd_units: &["postfix"],
            binary_names: &["postfix"],
            dpkg_names: &["postfix"],
        },
    },
    SoftwareSignature {
        id: "certbot",
        name: "certbot",
        category: "infra",
        detect: DetectRules {
            ports: &[],
            process_names: &[],
            systemd_units: &[],
            binary_names: &["certbot"],
            dpkg_names: &["certbot"],
        },
    },
    SoftwareSignature {
        id: "n8n",
        name: "n8n",
        category: "infra",
        detect: DetectRules {
            ports: &[(5678, "node")],
            process_names: &[],
            systemd_units: &["n8n"],
            binary_names: &[],
            dpkg_names: &[],
        },
    },
];

// ---------------------------------------------------------------------------
// Detection: pure functions (testable)
// ---------------------------------------------------------------------------

/// Match listening ports against the software registry.
/// Returns a map of `software_id` → `matched_ports`.
pub fn match_by_ports(
    ports: &[ListeningPort],
    registry: &'static [SoftwareSignature],
) -> HashMap<&'static str, Vec<u16>> {
    let mut hits: HashMap<&'static str, Vec<u16>> = HashMap::new();

    for port_entry in ports {
        let Some(ref proc_name) = port_entry.process else {
            continue;
        };
        let proc_lower = proc_name.to_lowercase();

        for sig in registry {
            for &(sig_port, prefix) in sig.detect.ports {
                if port_entry.port == sig_port && proc_lower.starts_with(prefix) {
                    let entry = hits.entry(sig.id).or_default();
                    if !entry.contains(&port_entry.port) {
                        entry.push(port_entry.port);
                    }
                }
            }
        }
    }

    hits
}

/// Match running process names against the software registry.
/// `process_names` is the set of unique /proc/*/comm values.
pub fn match_by_processes(
    process_names: &HashSet<String>,
    registry: &'static [SoftwareSignature],
) -> HashSet<&'static str> {
    let mut hits = HashSet::new();

    for sig in registry {
        for &expected in sig.detect.process_names {
            if process_names.contains(expected) {
                hits.insert(sig.id);
                break;
            }
        }
    }

    hits
}

/// Parse `systemctl list-unit-files --type=service --no-legend --plain` output
/// and match against the software registry.
///
/// Output format:
/// ```text
/// nginx.service                          enabled         enabled
/// ssh.service                            enabled         enabled
/// ```
pub fn match_by_systemd_units(
    output: &str,
    registry: &'static [SoftwareSignature],
) -> HashSet<&'static str> {
    let mut unit_names: HashSet<String> = HashSet::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        // First field is the unit name
        if let Some(unit) = trimmed.split_whitespace().next() {
            // Strip .service suffix
            let name = unit.strip_suffix(".service").unwrap_or(unit);
            unit_names.insert(name.to_string());
        }
    }

    let mut hits = HashSet::new();
    for sig in registry {
        for &expected in sig.detect.systemd_units {
            // For wildcard units like "wg-quick@", match prefix
            if expected.ends_with('@') {
                if unit_names.iter().any(|u| u.starts_with(expected)) {
                    hits.insert(sig.id);
                    break;
                }
            } else if unit_names.contains(expected) {
                hits.insert(sig.id);
                break;
            }
        }
    }

    hits
}

/// Parse `dpkg-query -W -f '${Package}\n' <packages>` output.
/// Returns set of installed package names.
pub fn parse_dpkg_output(output: &str) -> HashSet<String> {
    output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

/// Match dpkg package names against the software registry.
pub fn match_by_packages(
    installed_packages: &HashSet<String>,
    registry: &'static [SoftwareSignature],
) -> HashSet<&'static str> {
    let mut hits = HashSet::new();

    for sig in registry {
        for &expected in sig.detect.dpkg_names {
            if installed_packages.contains(expected) {
                hits.insert(sig.id);
                break;
            }
        }
    }

    hits
}

/// Parse a `--version` output to extract just the version string.
/// Tries common patterns: "X.Y.Z", "vX.Y.Z", etc.
pub fn parse_version_output(output: &str) -> Option<String> {
    let first_line = output.lines().next().unwrap_or("").trim();
    if first_line.is_empty() {
        return None;
    }

    // Split by whitespace AND common separators like '/' and '='
    // to handle formats like "nginx/1.24.0" and "v=7.2.4"
    let tokens: Vec<&str> = first_line
        .split(|c: char| c.is_whitespace() || c == '/' || c == '=')
        .filter(|s| !s.is_empty())
        .collect();

    for token in &tokens {
        // Strip leading 'v'/'V' prefix and non-alphanumeric prefix (e.g. "go1.21.5")
        let cleaned = token
            .trim_start_matches('v')
            .trim_start_matches('V')
            .trim_start_matches(|c: char| c.is_ascii_alphabetic());

        if cleaned.contains('.') && cleaned.chars().next().is_some_and(|c| c.is_ascii_digit()) {
            // Trim trailing junk: comma, parentheses, semicolons, etc.
            let version = cleaned.trim_end_matches([',', ')', ']', ';']);
            return Some(version.to_string());
        }
    }

    None
}

/// Assemble the final list of detected software from all signal sources.
///
/// Priority: port > process > systemd > binary > package.
/// Deduplicates by software ID — first detection source wins for `source` field.
pub fn assemble_detections(
    port_hits: &HashMap<&str, Vec<u16>>,
    process_hits: &HashSet<&str>,
    systemd_hits: &HashSet<&str>,
    binary_hits: &HashSet<&str>,
    package_hits: &HashSet<&str>,
) -> Vec<DetectedSoftware> {
    let mut seen: HashMap<&str, DetectedSoftware> = HashMap::new();

    // 1. Port detections — highest priority, always "running"
    for (&id, ports) in port_hits {
        let sig = REGISTRY.iter().find(|s| s.id == id).unwrap();
        seen.insert(
            id,
            DetectedSoftware {
                id: id.to_string(),
                name: sig.name.to_string(),
                category: sig.category.to_string(),
                version: None,
                source: "port".to_string(),
                running: true,
                listening_ports: ports.clone(),
            },
        );
    }

    // 2. Process detections — running
    for &id in process_hits {
        if seen.contains_key(id) {
            continue;
        }
        let sig = REGISTRY.iter().find(|s| s.id == id).unwrap();
        seen.insert(
            id,
            DetectedSoftware {
                id: id.to_string(),
                name: sig.name.to_string(),
                category: sig.category.to_string(),
                version: None,
                source: "process".to_string(),
                running: true,
                listening_ports: Vec::new(),
            },
        );
    }

    // 3. Systemd detections — installed, not necessarily running
    for &id in systemd_hits {
        if seen.contains_key(id) {
            continue;
        }
        let sig = REGISTRY.iter().find(|s| s.id == id).unwrap();
        seen.insert(
            id,
            DetectedSoftware {
                id: id.to_string(),
                name: sig.name.to_string(),
                category: sig.category.to_string(),
                version: None,
                source: "systemd".to_string(),
                running: false,
                listening_ports: Vec::new(),
            },
        );
    }

    // 4. Binary detections — installed
    for &id in binary_hits {
        if seen.contains_key(id) {
            continue;
        }
        let sig = REGISTRY.iter().find(|s| s.id == id).unwrap();
        seen.insert(
            id,
            DetectedSoftware {
                id: id.to_string(),
                name: sig.name.to_string(),
                category: sig.category.to_string(),
                version: None,
                source: "binary".to_string(),
                running: false,
                listening_ports: Vec::new(),
            },
        );
    }

    // 5. Package detections — installed
    for &id in package_hits {
        if seen.contains_key(id) {
            continue;
        }
        let sig = REGISTRY.iter().find(|s| s.id == id).unwrap();
        seen.insert(
            id,
            DetectedSoftware {
                id: id.to_string(),
                name: sig.name.to_string(),
                category: sig.category.to_string(),
                version: None,
                source: "package".to_string(),
                running: false,
                listening_ports: Vec::new(),
            },
        );
    }

    let mut result: Vec<DetectedSoftware> = seen.into_values().collect();
    result.sort_by(|a, b| a.id.cmp(&b.id));
    result
}

// ---------------------------------------------------------------------------
// Async entry point (glue code, coverage off)
// ---------------------------------------------------------------------------

/// Collect all software discovery data.
///
/// Receives already-collected `ListeningPort` data to avoid re-scanning ports.
#[cfg_attr(coverage_nightly, coverage(off))]
pub async fn collect_software_discovery(ports: Option<&[ListeningPort]>) -> SoftwareDiscoveryInfo {
    let start = Instant::now();

    // 1. Port matching (reuse already-collected data)
    let port_hits = ports.map_or_else(HashMap::new, |p| match_by_ports(p, REGISTRY));

    // 2. Process scan — read /proc/*/comm
    let process_names = scan_process_names();
    let process_hits = match_by_processes(&process_names, REGISTRY);

    // 3. Systemd unit files
    let systemd_hits = command::run_command_default(
        "systemctl",
        &[
            "list-unit-files",
            "--type=service",
            "--no-legend",
            "--plain",
        ],
    )
    .await
    .map_or_else(
        |_| HashSet::new(),
        |output| match_by_systemd_units(&output, REGISTRY),
    );

    // 4. Binary probing via `which`
    let binary_hits = probe_binaries(REGISTRY);

    // 5. Package manager (dpkg)
    let all_dpkg_names: Vec<&str> = REGISTRY
        .iter()
        .flat_map(|s| s.detect.dpkg_names.iter().copied())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    let package_hits = if !all_dpkg_names.is_empty() && command::command_exists("dpkg-query") {
        let mut args = vec!["-W", "-f", "${Package}\\n"];
        args.extend_from_slice(&all_dpkg_names);
        command::run_command_default("dpkg-query", &args)
            .await
            .map_or_else(
                |_| HashSet::new(),
                |output| {
                    let installed = parse_dpkg_output(&output);
                    match_by_packages(&installed, REGISTRY)
                },
            )
    } else {
        HashSet::new()
    };

    let scan_duration_ms = u64::try_from(start.elapsed().as_millis()).unwrap_or(u64::MAX);

    let mut detected = assemble_detections(
        &port_hits,
        &process_hits,
        &systemd_hits,
        &binary_hits,
        &package_hits,
    );

    // Version probing (best-effort, 3s global timeout)
    let version_start = Instant::now();
    probe_versions(&mut detected).await;
    let version_duration_ms =
        u64::try_from(version_start.elapsed().as_millis()).unwrap_or(u64::MAX);

    SoftwareDiscoveryInfo {
        detected,
        scan_duration_ms,
        version_duration_ms,
    }
}

/// Scan /proc/*/comm to get unique process names.
#[cfg_attr(coverage_nightly, coverage(off))]
fn scan_process_names() -> HashSet<String> {
    let mut names = HashSet::new();
    let Ok(entries) = std::fs::read_dir("/proc") else {
        return names;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        // Only PID directories (all digits)
        if !name_str.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        let comm_path = entry.path().join("comm");
        if let Ok(comm) = std::fs::read_to_string(&comm_path) {
            let trimmed = comm.trim().to_string();
            if !trimmed.is_empty() {
                names.insert(trimmed);
            }
        }
    }
    names
}

/// Check which binaries from the registry exist on the system.
#[cfg_attr(coverage_nightly, coverage(off))]
fn probe_binaries(registry: &[SoftwareSignature]) -> HashSet<&'static str> {
    let mut hits = HashSet::new();
    for sig in registry {
        for &bin in sig.detect.binary_names {
            if command::command_exists(bin) {
                hits.insert(sig.id);
                break;
            }
        }
    }
    hits
}

/// Probe versions for detected software (best-effort, 3s global timeout).
#[cfg_attr(coverage_nightly, coverage(off))]
async fn probe_versions(detected: &mut [DetectedSoftware]) {
    use std::time::Duration;

    let global_timeout = Duration::from_secs(3);
    let per_cmd_timeout = Duration::from_secs(2);

    let _ = tokio::time::timeout(global_timeout, async {
        for sw in detected.iter_mut() {
            let Some(sig) = REGISTRY.iter().find(|s| s.id == sw.id) else {
                continue;
            };
            for &bin in sig.detect.binary_names {
                if command::command_exists(bin) {
                    let result = command::run_command(bin, &["--version"], per_cmd_timeout).await;
                    match result {
                        Ok(output) => {
                            sw.version = parse_version_output(&output);
                            break;
                        }
                        Err(command::CommandError::ExitStatus { stdout, .. }) => {
                            sw.version = parse_version_output(&stdout);
                            break;
                        }
                        Err(_) => {}
                    }
                }
            }
        }
    })
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- parse_version_output ---

    #[test]
    fn parse_version_simple() {
        assert_eq!(
            parse_version_output("nginx version: nginx/1.24.0"),
            Some("1.24.0".to_string())
        );
    }

    #[test]
    fn parse_version_with_v_prefix() {
        assert_eq!(
            parse_version_output("v18.19.0"),
            Some("18.19.0".to_string())
        );
    }

    #[test]
    fn parse_version_redis() {
        assert_eq!(
            parse_version_output(
                "Redis server v=7.2.4 sha=00000000:0 malloc=jemalloc-5.3.0 bits=64 build=abc"
            ),
            Some("7.2.4".to_string())
        );
    }

    #[test]
    fn parse_version_python() {
        assert_eq!(
            parse_version_output("Python 3.11.4"),
            Some("3.11.4".to_string())
        );
    }

    #[test]
    fn parse_version_empty() {
        assert_eq!(parse_version_output(""), None);
    }

    #[test]
    fn parse_version_no_version_found() {
        assert_eq!(
            parse_version_output("some random text without numbers"),
            None
        );
    }

    #[test]
    fn parse_version_multiline() {
        assert_eq!(
            parse_version_output("go version go1.21.5 linux/amd64\nmore stuff"),
            Some("1.21.5".to_string())
        );
    }

    // --- match_by_ports ---

    #[test]
    fn match_ports_finds_nginx() {
        let ports = vec![ListeningPort {
            port: 80,
            bind: "0.0.0.0".to_string(),
            protocol: "tcp".to_string(),
            pid: Some(100),
            process: Some("nginx".to_string()),
        }];
        let hits = match_by_ports(&ports, REGISTRY);
        assert!(hits.contains_key("nginx"));
        assert_eq!(hits["nginx"], vec![80]);
    }

    #[test]
    fn match_ports_multiple_ports_same_software() {
        let ports = vec![
            ListeningPort {
                port: 80,
                bind: "0.0.0.0".to_string(),
                protocol: "tcp".to_string(),
                pid: Some(100),
                process: Some("nginx".to_string()),
            },
            ListeningPort {
                port: 443,
                bind: "0.0.0.0".to_string(),
                protocol: "tcp".to_string(),
                pid: Some(100),
                process: Some("nginx".to_string()),
            },
        ];
        let hits = match_by_ports(&ports, REGISTRY);
        assert!(hits.contains_key("nginx"));
        let mut matched_ports = hits["nginx"].clone();
        matched_ports.sort();
        assert_eq!(matched_ports, vec![80, 443]);
    }

    #[test]
    fn match_ports_no_process_name_skipped() {
        let ports = vec![ListeningPort {
            port: 80,
            bind: "0.0.0.0".to_string(),
            protocol: "tcp".to_string(),
            pid: None,
            process: None,
        }];
        let hits = match_by_ports(&ports, REGISTRY);
        assert!(hits.is_empty());
    }

    #[test]
    fn match_ports_unknown_process_ignored() {
        let ports = vec![ListeningPort {
            port: 80,
            bind: "0.0.0.0".to_string(),
            protocol: "tcp".to_string(),
            pid: Some(100),
            process: Some("my-custom-app".to_string()),
        }];
        let hits = match_by_ports(&ports, REGISTRY);
        assert!(hits.is_empty());
    }

    // --- match_by_processes ---

    #[test]
    fn match_processes_finds_redis() {
        let procs: HashSet<String> = ["redis-server", "sshd", "systemd"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let hits = match_by_processes(&procs, REGISTRY);
        assert!(hits.contains("redis"));
        assert!(hits.contains("sshd"));
    }

    #[test]
    fn match_processes_empty_set() {
        let procs: HashSet<String> = HashSet::new();
        let hits = match_by_processes(&procs, REGISTRY);
        assert!(hits.is_empty());
    }

    // --- match_by_systemd_units ---

    #[test]
    fn match_systemd_units_normal() {
        let output = "\
nginx.service                          enabled         enabled
ssh.service                            enabled         enabled
docker.service                         enabled         enabled
";
        let hits = match_by_systemd_units(output, REGISTRY);
        assert!(hits.contains("nginx"));
        assert!(hits.contains("sshd")); // ssh maps to sshd
        assert!(hits.contains("docker"));
    }

    #[test]
    fn match_systemd_units_wildcard_prefix() {
        let output = "\
wg-quick@wg0.service                   enabled         enabled
";
        let hits = match_by_systemd_units(output, REGISTRY);
        assert!(hits.contains("wireguard"));
    }

    #[test]
    fn match_systemd_units_empty() {
        let hits = match_by_systemd_units("", REGISTRY);
        assert!(hits.is_empty());
    }

    // --- parse_dpkg_output ---

    #[test]
    fn parse_dpkg_normal() {
        let output = "nginx\nopenssh-server\npostgresql\n";
        let pkgs = parse_dpkg_output(output);
        assert!(pkgs.contains("nginx"));
        assert!(pkgs.contains("openssh-server"));
        assert!(pkgs.contains("postgresql"));
        assert_eq!(pkgs.len(), 3);
    }

    #[test]
    fn parse_dpkg_empty() {
        let pkgs = parse_dpkg_output("");
        assert!(pkgs.is_empty());
    }

    // --- match_by_packages ---

    #[test]
    fn match_packages_finds_software() {
        let installed: HashSet<String> = ["nginx", "openssh-server", "postgresql"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        let hits = match_by_packages(&installed, REGISTRY);
        assert!(hits.contains("nginx"));
        assert!(hits.contains("sshd"));
        assert!(hits.contains("postgres"));
    }

    // --- assemble_detections ---

    #[test]
    fn assemble_deduplicates_and_prioritizes() {
        let mut port_hits: HashMap<&str, Vec<u16>> = HashMap::new();
        port_hits.insert("nginx", vec![80, 443]);

        let mut process_hits: HashSet<&str> = HashSet::new();
        process_hits.insert("nginx"); // Duplicate — should be ignored
        process_hits.insert("redis");

        let systemd_hits: HashSet<&str> = HashSet::new();
        let binary_hits: HashSet<&str> = HashSet::new();
        let package_hits: HashSet<&str> = HashSet::new();

        let result = assemble_detections(
            &port_hits,
            &process_hits,
            &systemd_hits,
            &binary_hits,
            &package_hits,
        );

        assert_eq!(result.len(), 2);

        let nginx = result.iter().find(|s| s.id == "nginx").unwrap();
        assert_eq!(nginx.source, "port");
        assert!(nginx.running);
        assert_eq!(nginx.listening_ports, vec![80, 443]);

        let redis = result.iter().find(|s| s.id == "redis").unwrap();
        assert_eq!(redis.source, "process");
        assert!(redis.running);
    }

    #[test]
    fn assemble_all_sources() {
        let port_hits: HashMap<&str, Vec<u16>> = HashMap::new();
        let process_hits: HashSet<&str> = HashSet::new();
        let mut systemd_hits: HashSet<&str> = HashSet::new();
        systemd_hits.insert("nginx");
        let mut binary_hits: HashSet<&str> = HashSet::new();
        binary_hits.insert("python");
        let mut package_hits: HashSet<&str> = HashSet::new();
        package_hits.insert("postgres");

        let result = assemble_detections(
            &port_hits,
            &process_hits,
            &systemd_hits,
            &binary_hits,
            &package_hits,
        );

        assert_eq!(result.len(), 3);

        let nginx = result.iter().find(|s| s.id == "nginx").unwrap();
        assert_eq!(nginx.source, "systemd");
        assert!(!nginx.running);

        let python = result.iter().find(|s| s.id == "python").unwrap();
        assert_eq!(python.source, "binary");

        let postgres = result.iter().find(|s| s.id == "postgres").unwrap();
        assert_eq!(postgres.source, "package");
    }

    #[test]
    fn assemble_empty_all() {
        let result = assemble_detections(
            &HashMap::new(),
            &HashSet::new(),
            &HashSet::new(),
            &HashSet::new(),
            &HashSet::new(),
        );
        assert!(result.is_empty());
    }

    #[test]
    fn assemble_sorted_by_id() {
        let mut process_hits: HashSet<&str> = HashSet::new();
        process_hits.insert("redis");
        process_hits.insert("nginx");
        process_hits.insert("cron");

        let result = assemble_detections(
            &HashMap::new(),
            &process_hits,
            &HashSet::new(),
            &HashSet::new(),
            &HashSet::new(),
        );

        let ids: Vec<&str> = result.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["cron", "nginx", "redis"]);
    }

    // --- Registry completeness ---

    #[test]
    fn registry_has_expected_count() {
        // ~50 entries: 41 original + 9 new (frps, frpc, xray, v2ray, clash, uptime_kuma, umami, n8n, portainer)
        assert!(
            REGISTRY.len() >= 44,
            "registry should have ≥44 entries, got {}",
            REGISTRY.len()
        );
    }

    #[test]
    fn registry_ids_are_unique() {
        let mut ids = HashSet::new();
        for sig in REGISTRY {
            assert!(ids.insert(sig.id), "duplicate registry id: {}", sig.id);
        }
    }

    // --- New registry entries ---

    #[test]
    fn match_ports_finds_frps() {
        let ports = vec![ListeningPort {
            port: 7000,
            bind: "0.0.0.0".to_string(),
            protocol: "tcp".to_string(),
            pid: Some(200),
            process: Some("frps".to_string()),
        }];
        let hits = match_by_ports(&ports, REGISTRY);
        assert!(hits.contains_key("frps"));
        assert_eq!(hits["frps"], vec![7000]);
    }

    #[test]
    fn match_processes_finds_xray() {
        let procs: HashSet<String> = ["xray"].iter().map(|s| s.to_string()).collect();
        let hits = match_by_processes(&procs, REGISTRY);
        assert!(hits.contains("xray"));
    }

    #[test]
    fn match_systemd_finds_frpc() {
        let output = "frpc.service                           enabled         enabled\n";
        let hits = match_by_systemd_units(output, REGISTRY);
        assert!(hits.contains("frpc"));
    }

    #[test]
    fn match_ports_finds_portainer() {
        let ports = vec![ListeningPort {
            port: 9000,
            bind: "0.0.0.0".to_string(),
            protocol: "tcp".to_string(),
            pid: Some(300),
            process: Some("portainer".to_string()),
        }];
        let hits = match_by_ports(&ports, REGISTRY);
        assert!(hits.contains_key("portainer"));
    }

    #[test]
    fn match_ports_finds_n8n() {
        let ports = vec![ListeningPort {
            port: 5678,
            bind: "0.0.0.0".to_string(),
            protocol: "tcp".to_string(),
            pid: Some(400),
            process: Some("node".to_string()),
        }];
        let hits = match_by_ports(&ports, REGISTRY);
        assert!(hits.contains_key("n8n"));
    }

    #[test]
    fn match_systemd_finds_uptime_kuma() {
        let output = "uptime-kuma.service                    enabled         enabled\n";
        let hits = match_by_systemd_units(output, REGISTRY);
        assert!(hits.contains("uptime_kuma"));
    }

    #[test]
    fn registry_has_proxy_category() {
        let proxy_entries: Vec<_> = REGISTRY.iter().filter(|s| s.category == "proxy").collect();
        assert_eq!(proxy_entries.len(), 5, "expected 5 proxy entries");
        let ids: Vec<&str> = proxy_entries.iter().map(|s| s.id).collect();
        assert!(ids.contains(&"frps"));
        assert!(ids.contains(&"frpc"));
        assert!(ids.contains(&"xray"));
        assert!(ids.contains(&"v2ray"));
        assert!(ids.contains(&"clash"));
    }

    #[test]
    fn match_ports_finds_clash() {
        let ports = vec![ListeningPort {
            port: 7890,
            bind: "0.0.0.0".to_string(),
            protocol: "tcp".to_string(),
            pid: Some(500),
            process: Some("clash".to_string()),
        }];
        let hits = match_by_ports(&ports, REGISTRY);
        assert!(hits.contains_key("clash"));
    }
}
