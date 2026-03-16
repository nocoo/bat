use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct MetricsPayload {
    pub host_id: String,
    pub timestamp: u64,
    pub interval: u32,
    pub cpu: CpuMetrics,
    pub mem: MemMetrics,
    pub swap: SwapMetrics,
    pub disk: Vec<DiskMetric>,
    pub net: Vec<NetMetric>,
    pub uptime_seconds: u64,
}

#[derive(Debug, Serialize)]
pub struct CpuMetrics {
    pub load1: f64,
    pub load5: f64,
    pub load15: f64,
    pub usage_pct: f64,
    pub iowait_pct: f64,
    pub steal_pct: f64,
    pub count: u32,
}

#[derive(Debug, Serialize)]
pub struct MemMetrics {
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct SwapMetrics {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub used_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct DiskMetric {
    pub mount: String,
    pub total_bytes: u64,
    pub avail_bytes: u64,
    pub used_pct: f64,
}

#[derive(Debug, Serialize)]
pub struct NetMetric {
    pub iface: String,
    pub rx_bytes_rate: f64,
    pub tx_bytes_rate: f64,
    pub rx_errors: u64,
    pub tx_errors: u64,
}

#[derive(Debug, Serialize)]
pub struct IdentityPayload {
    pub host_id: String,
    pub hostname: String,
    pub os: String,
    pub kernel: String,
    pub arch: String,
    pub cpu_model: String,
    pub uptime_seconds: u64,
    pub boot_time: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metrics_payload_serializes_expected_fields() {
        let payload = MetricsPayload {
            host_id: "test-host".into(),
            timestamp: 1_700_000_000,
            interval: 30,
            cpu: CpuMetrics {
                load1: 0.5,
                load5: 0.3,
                load15: 0.2,
                usage_pct: 12.5,
                iowait_pct: 1.2,
                steal_pct: 0.0,
                count: 4,
            },
            mem: MemMetrics {
                total_bytes: 4_000_000_000,
                available_bytes: 2_000_000_000,
                used_pct: 50.0,
            },
            swap: SwapMetrics {
                total_bytes: 2_000_000_000,
                used_bytes: 500_000_000,
                used_pct: 25.0,
            },
            disk: vec![DiskMetric {
                mount: "/".into(),
                total_bytes: 50_000_000_000,
                avail_bytes: 30_000_000_000,
                used_pct: 40.0,
            }],
            net: vec![NetMetric {
                iface: "eth0".into(),
                rx_bytes_rate: 1024.5,
                tx_bytes_rate: 512.3,
                rx_errors: 0,
                tx_errors: 0,
            }],
            uptime_seconds: 86400,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();

        // Top-level fields
        assert_eq!(json["host_id"], "test-host");
        assert_eq!(json["timestamp"], 1_700_000_000_u64);
        assert_eq!(json["interval"], 30);
        assert_eq!(json["uptime_seconds"], 86400);

        // CPU nested fields
        assert_eq!(json["cpu"]["load1"], 0.5);
        assert_eq!(json["cpu"]["usage_pct"], 12.5);
        assert_eq!(json["cpu"]["iowait_pct"], 1.2);
        assert_eq!(json["cpu"]["steal_pct"], 0.0);
        assert_eq!(json["cpu"]["count"], 4);

        // Memory
        assert_eq!(json["mem"]["total_bytes"], 4_000_000_000u64);
        assert_eq!(json["mem"]["available_bytes"], 2_000_000_000u64);
        assert_eq!(json["mem"]["used_pct"], 50.0);

        // Swap
        assert_eq!(json["swap"]["total_bytes"], 2_000_000_000u64);
        assert_eq!(json["swap"]["used_bytes"], 500_000_000u64);
        assert_eq!(json["swap"]["used_pct"], 25.0);

        // Disk array
        assert_eq!(json["disk"][0]["mount"], "/");
        assert_eq!(json["disk"][0]["total_bytes"], 50_000_000_000u64);
        assert_eq!(json["disk"][0]["avail_bytes"], 30_000_000_000u64);
        assert_eq!(json["disk"][0]["used_pct"], 40.0);

        // Net array
        assert_eq!(json["net"][0]["iface"], "eth0");
        assert_eq!(json["net"][0]["rx_bytes_rate"], 1024.5);
        assert_eq!(json["net"][0]["tx_bytes_rate"], 512.3);
        assert_eq!(json["net"][0]["rx_errors"], 0);
        assert_eq!(json["net"][0]["tx_errors"], 0);
    }

    #[test]
    fn identity_payload_serializes_expected_fields() {
        let payload = IdentityPayload {
            host_id: "test-host".into(),
            hostname: "myserver".into(),
            os: "Ubuntu 22.04.3 LTS".into(),
            kernel: "5.15.0-91-generic".into(),
            arch: "x86_64".into(),
            cpu_model: "Intel Xeon E5-2680".into(),
            uptime_seconds: 86400,
            boot_time: 1_699_913_600,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();

        assert_eq!(json["host_id"], "test-host");
        assert_eq!(json["hostname"], "myserver");
        assert_eq!(json["os"], "Ubuntu 22.04.3 LTS");
        assert_eq!(json["kernel"], "5.15.0-91-generic");
        assert_eq!(json["arch"], "x86_64");
        assert_eq!(json["cpu_model"], "Intel Xeon E5-2680");
        assert_eq!(json["uptime_seconds"], 86400);
        assert_eq!(json["boot_time"], 1_699_913_600_u64);
    }

    #[test]
    fn metrics_payload_empty_arrays() {
        let payload = MetricsPayload {
            host_id: "h".into(),
            timestamp: 0,
            interval: 30,
            cpu: CpuMetrics {
                load1: 0.0,
                load5: 0.0,
                load15: 0.0,
                usage_pct: 0.0,
                iowait_pct: 0.0,
                steal_pct: 0.0,
                count: 1,
            },
            mem: MemMetrics {
                total_bytes: 0,
                available_bytes: 0,
                used_pct: 0.0,
            },
            swap: SwapMetrics {
                total_bytes: 0,
                used_bytes: 0,
                used_pct: 0.0,
            },
            disk: vec![],
            net: vec![],
            uptime_seconds: 0,
        };

        let json: serde_json::Value = serde_json::to_value(&payload).unwrap();
        assert!(json["disk"].as_array().unwrap().is_empty());
        assert!(json["net"].as_array().unwrap().is_empty());
    }
}
