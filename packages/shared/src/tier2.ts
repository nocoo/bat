// @bat/shared — Tier 2 payload and snapshot types
// Source of truth: docs/01-metrics-catalogue.md § Tier 2
// Probe → Worker (POST /api/tier2), Worker → Dashboard (GET /api/hosts/:id/tier2)

// --- Service Ports (2.4) ---

export interface ListeningPort {
	port: number;
	bind: string; // "0.0.0.0", "127.0.0.1", "::", "::1", etc.
	protocol: "tcp" | "tcp6";
	pid: number | null;
	process: string | null;
}

export interface ServicePortsData {
	listening: ListeningPort[];
}

// --- Package Updates (2.1) ---

export interface PackageUpdate {
	name: string;
	current_version: string;
	new_version: string;
	is_security: boolean;
}

export interface PackageUpdatesData {
	total_count: number;
	security_count: number;
	list: PackageUpdate[];
	reboot_required: boolean;
	cache_age_seconds: number | null;
}

// --- Systemd Services (2.6) ---

export interface FailedService {
	unit: string;
	load_state: string;
	active_state: string;
	sub_state: string;
	description: string;
}

export interface SystemdServicesData {
	failed_count: number;
	failed: FailedService[];
}

// --- Security Posture (2.5) ---

export interface SecurityPostureData {
	ssh_password_auth: boolean | null;
	ssh_root_login: string | null; // "yes" | "no" | "prohibit-password" | null
	ssh_failed_logins_7d: number | null;
	firewall_active: boolean | null;
	firewall_default_policy: string | null;
	fail2ban_active: boolean | null;
	fail2ban_banned_count: number | null;
	unattended_upgrades_active: boolean | null;
}

// --- Docker Status (2.3) ---

export interface DockerContainer {
	id: string;
	name: string;
	image: string;
	status: string;
	state: string; // "running" | "exited" | "paused" | etc.
	cpu_pct: number | null;
	mem_bytes: number | null;
	restart_count: number;
	started_at: number | null; // unix seconds
}

export interface DockerImagesInfo {
	total_count: number;
	total_bytes: number;
	reclaimable_bytes: number;
}

export interface DockerStatusData {
	installed: boolean;
	version: string | null;
	containers: DockerContainer[];
	images: DockerImagesInfo | null;
}

// --- Disk Deep Scan (2.2) ---

export interface TopDir {
	path: string;
	size_bytes: number;
}

export interface LargeFile {
	path: string;
	size_bytes: number;
}

export interface DiskDeepScanData {
	top_dirs: TopDir[];
	journal_bytes: number | null;
	large_files: LargeFile[];
}

// --- Tier 2 Payload (Probe → Worker) ---

export interface Tier2Payload {
	probe_version?: string;
	host_id: string;
	timestamp: number; // Unix seconds, Probe clock
	ports?: ServicePortsData;
	updates?: PackageUpdatesData;
	systemd?: SystemdServicesData;
	security?: SecurityPostureData;
	docker?: DockerStatusData;
	disk_deep?: DiskDeepScanData;
	// Host inventory slow-drift fields
	timezone?: string;
	dns_resolvers?: string[];
	dns_search?: string[];
}

// --- Tier 2 Snapshot (Worker → Dashboard) ---

export interface Tier2Snapshot {
	host_id: string;
	ts: number;
	ports: ServicePortsData | null;
	updates: PackageUpdatesData | null;
	systemd: SystemdServicesData | null;
	security: SecurityPostureData | null;
	docker: DockerStatusData | null;
	disk_deep: DiskDeepScanData | null;
	// Host inventory slow-drift fields
	timezone: string | null;
	dns_resolvers: string[] | null;
	dns_search: string[] | null;
}
