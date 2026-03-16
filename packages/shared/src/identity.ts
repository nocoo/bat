// @bat/shared — Identity payload types
// Probe → Worker communication (POST /api/identity)
// Source of truth: docs/03-data-structures.md § Communication Payloads

export interface IdentityPayload {
	probe_version?: string;
	host_id: string;
	hostname: string;
	os: string; // PRETTY_NAME from /etc/os-release
	kernel: string; // from /proc/version
	arch: string; // uname -m
	cpu_model: string; // from /proc/cpuinfo
	uptime_seconds: number;
	boot_time: number; // computed: now() - uptime
}

/** D1 hosts table row representation */
export interface HostRow {
	host_id: string;
	hostname: string;
	os: string | null;
	kernel: string | null;
	arch: string | null;
	cpu_model: string | null;
	boot_time: number | null;
	last_seen: number;
	identity_updated_at: number | null;
	is_active: number; // 0 = retired, 1 = active
	created_at: number;
}
