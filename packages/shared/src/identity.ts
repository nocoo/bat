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
	// Host inventory fields (optional for backward compat)
	cpu_logical?: number;
	cpu_physical?: number;
	mem_total_bytes?: number;
	swap_total_bytes?: number;
	virtualization?: string;
	net_interfaces?: NetInterfaceDTO[];
	disks?: BlockDeviceDTO[];
	boot_mode?: string;
	public_ip?: string;
}

/** Network interface identity (from probe identity payload) */
export interface NetInterfaceDTO {
	iface: string;
	mac: string;
	ipv4: string[];
	ipv6: string[];
	speed_mbps: number | null;
}

/** Block device identity (from probe identity payload) */
export interface BlockDeviceDTO {
	device: string;
	size_bytes: number;
	rotational: boolean;
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
	// Host inventory columns
	cpu_logical: number | null;
	cpu_physical: number | null;
	mem_total_bytes: number | null;
	swap_total_bytes: number | null;
	virtualization: string | null;
	net_interfaces: string | null; // JSON text
	disks: string | null; // JSON text
	boot_mode: string | null;
	timezone: string | null;
	dns_resolvers: string | null; // JSON text
	dns_search: string | null; // JSON text
	public_ip: string | null;
}
