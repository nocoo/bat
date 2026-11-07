// Whitelist sanitizer for raw production captures that seed the local Demo catalog.
// Raw captures stay with the coordinator; this module only accepts the audited shape
// documented in docs/25-recordings.md and emits a deterministic, de-identified recording.

import { isIP } from "node:net";

export const SCHEMA_VERSION = 1;

const words = (value) => new Set(value.trim().split(/\s+/));
const HOST_STATUSES = words("healthy warning critical offline maintenance");
const DOCKER_STATES = words("running exited paused restarting created dead");
const CONNECTIVITY_STATUSES = words("reachable partial timeout unreachable error unsupported");
const SOFTWARE_CATEGORIES = words(
	"web database cache queue runtime monitoring security infra container proxy",
);
const SOFTWARE_SOURCES = words("port process systemd binary package docker");
const PUBLIC_SOFTWARE = words(
	"nginx apache2 httpd caddy traefik haproxy postgres postgresql mysql mariadb redis memcached mongodb rabbitmq docker containerd nodejs node python3 java php php-fpm prometheus node-exporter grafana fail2ban ufw nftables openssh openssh-server systemd cron frp wireguard xray n8n cloudflared workers",
);
const PUBLIC_PROCESSES = words(
	"init systemd systemd-journald systemd-logind systemd-resolved sshd nginx apache2 httpd postgres mysql mysqld mariadbd redis-server memcached dockerd containerd containerd-shim node python3 python java php-fpm cron rsyslogd dbus-daemon bash sh zsh prometheus grafana fail2ban-server ufw nft haproxy caddy traefik frps frpc",
);
const PUBLIC_USERS = words(
	"root www-data postgres mysql redis nobody daemon docker systemd-network syslog messagebus sshd",
);
const SAFE_MOUNTS = words(
	"/ /boot /boot/efi /data /home /opt /srv /tmp /usr /var /var/cache /var/lib /var/log /var/tmp",
);
const DOC_V4 = /^(?:192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/;
const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAC = /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const KERNEL = /^(\d+\.\d+(?:\.\d+)?)/;
const ARCHES = words("x86_64 amd64 aarch64 arm64 armv7l i686 riscv64 ppc64le s390x");
const CPU_LABELS = new Map([
	["x86_64", "Generic x86-64 CPU"],
	["amd64", "Generic x86-64 CPU"],
	["aarch64", "Generic ARM64 CPU"],
	["arm64", "Generic ARM64 CPU"],
	["armv7l", "Generic ARMv7 CPU"],
	["i686", "Generic x86 CPU"],
	["riscv64", "Generic RISC-V CPU"],
]);
const OS_PATTERNS = [
	/^Ubuntu \d{2}\.\d{2}(?:\.\d+)?(?: LTS)?$/,
	/^Debian \d+(?:\.\d+)*$/,
	/^Fedora(?: Linux)? \d+$/,
	/^CentOS(?: Linux)? \d+(?:\.\d+)*$/,
	/^Rocky Linux \d+(?:\.\d+)*$/,
	/^AlmaLinux \d+(?:\.\d+)*$/,
	/^Arch Linux$/,
	/^Alpine Linux v?\d+\.\d+(?:\.\d+)?$/,
	/^openSUSE (?:Leap|Tumbleweed)(?: \d+(?:\.\d+)*)?$/,
	/^macOS(?: \d+(?:\.\d+)*)?$/,
	/^Linux$/,
];
const TIMEZONES = words(
	"UTC Etc/UTC Europe/London Europe/Berlin Europe/Paris Asia/Shanghai Asia/Tokyo Asia/Singapore America/New_York America/Chicago America/Los_Angeles Australia/Sydney",
);
const VIRTUALIZATIONS = words(
	"kvm vmware xen hyperv docker podman lxc openvz bhyve parallels virtualbox",
);
const BOOT_MODES = words("bios uefi");
const PROCESS_STATES = words("R S D Z T t W X x K P I");
const LOAD_STATES = words("loaded not-found bad-setting error masked");
const ACTIVE_STATES = words("active reloading inactive failed activating deactivating maintenance");
const SUB_STATES = words(
	"running exited dead failed start stop waiting listening plugged mounted elapsed",
);
const SAFE_PATHS = words(
	"/var /var/backups /var/cache /var/lib /var/lib/docker /var/lib/mysql /var/lib/postgresql /var/lib/redis /var/log /usr /usr/lib /usr/local /usr/share /etc /opt /srv /tmp /boot /boot/efi",
);

const PSI_FIELDS = ["cpu_some", "mem_some", "mem_full", "io_some", "io_full"].flatMap((area) =>
	["avg10", "avg60", "avg300"].map((window) => `psi_${area}_${window}`),
);
const METRIC_FIELDS = [
	...`cpu_usage_pct cpu_iowait cpu_steal cpu_load1 cpu_load5 cpu_load15 cpu_count
	mem_total mem_available mem_used_pct swap_total swap_used swap_used_pct
	net_rx_bytes_avg net_rx_bytes_max net_tx_bytes_avg net_tx_bytes_max net_rx_errors net_tx_errors
	uptime_seconds sample_count`.split(/\s+/),
	...PSI_FIELDS,
	...`psi_cpu_some_total_delta psi_mem_some_total_delta psi_mem_full_total_delta
	psi_io_some_total_delta psi_io_full_total_delta tcp_established tcp_time_wait tcp_orphan
	tcp_allocated context_switches_sec forks_sec procs_running procs_blocked oom_kills
	fd_allocated fd_max interrupts_sec softirq_net_rx_sec softirq_block_sec tasks_running
	tasks_total mem_buffers mem_cached mem_dirty mem_writeback mem_shmem mem_slab_reclaimable
	mem_slab_unreclaim mem_committed_as mem_commit_limit mem_hw_corrupted swap_in_sec
	swap_out_sec pgmajfault_sec pgpgin_sec pgpgout_sec tcp_mem_pages sockets_used udp_inuse
	udp_mem_pages snmp_retrans_segs_sec snmp_active_opens_sec snmp_passive_opens_sec
	snmp_attempt_fails_delta snmp_estab_resets_delta snmp_in_errs_delta snmp_out_rsts_delta
	snmp_udp_rcvbuf_errors_delta snmp_udp_sndbuf_errors_delta snmp_udp_in_errors_delta
	netstat_listen_overflows_delta netstat_listen_drops_delta netstat_tcp_timeouts_delta
	netstat_tcp_syn_retrans_delta netstat_tcp_fast_retrans_delta netstat_tcp_ofo_queue_delta
	netstat_tcp_abort_on_memory_delta netstat_syncookies_sent_delta softnet_processed_delta
	softnet_dropped_delta softnet_time_squeeze_delta conntrack_count conntrack_max`.split(/\s+/),
];

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const asRecord = (value) => (isRecord(value) ? value : {});
const listOrEmpty = (value) => (Array.isArray(value) ? value : []);
const integer = (value) => (Number.isInteger(value) ? value : null);
const finite = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const oneOf = (value, allowed) =>
	(Array.isArray(allowed) ? allowed.includes(value) : allowed.has(value)) ? value : null;
const pad = (value) => String(value).padStart(2, "0");

function sanitizeArch(value) {
	if (typeof value !== "string") return null;
	const arch = value.trim().toLowerCase();
	return ARCHES.has(arch) ? arch : null;
}

function sanitizeOs(value) {
	if (typeof value !== "string") return null;
	const label = value.trim().replace(/\s+/g, " ");
	if (/^Darwin \d+(?:\.\d+){0,2}$/.test(label)) return "macOS";
	return OS_PATTERNS.some((pattern) => pattern.test(label)) ? label : null;
}

function isDocumentationV6(address) {
	const [head = "", tail = ""] = address.split("::");
	const left = head === "" ? [] : head.split(":");
	const right = tail === "" ? [] : tail.split(":");
	const fill = Math.max(0, 8 - left.length - right.length);
	const groups = [...left, ...Array(fill).fill("0"), ...right];
	return (
		groups.length === 8 &&
		Number.parseInt(groups[0], 16) === 0x2001 &&
		Number.parseInt(groups[1], 16) === 0x0db8
	);
}

function sanitizeKernel(value) {
	if (typeof value !== "string") return null;
	const match = KERNEL.exec(value.trim());
	return match ? match[1] : null;
}

function sanitizeVersion(value) {
	if (typeof value !== "string") return null;
	const version = value.trim();
	return SEMVER.test(version) ? version : null;
}

function cpuLabel(arch) {
	return (arch !== null && CPU_LABELS.get(arch)) || "Generic CPU";
}

function safePath(value) {
	return typeof value === "string" && SAFE_PATHS.has(value.trim());
}

function clock(value) {
	return typeof value === "string" && TIME_OF_DAY.test(value) ? value : null;
}

function parseArray(value) {
	if (Array.isArray(value)) return value.filter(isRecord);
	if (typeof value !== "string") return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
	} catch {
		return [];
	}
}

function fnv1a(value) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}

function requireRecord(name, value) {
	if (value === null || value === undefined) return null;
	if (!isRecord(value)) throw new Error(`recording.${name} must be an object`);
	return value;
}

function requireList(name, value) {
	if (value === null || value === undefined) return [];
	if (!Array.isArray(value)) throw new Error(`recording.${name} must be an array`);
	return value;
}

function createContext(input, capturedAt) {
	const detail = asRecord(input.server_detail);
	const tier2 = asRecord(input.server_tier2);
	const workstation = asRecord(input.workstation_detail);
	const report = asRecord(workstation.latest_report);
	const connectivity = asRecord(input.workstation_connectivity);
	const points = [
		...listOrEmpty(asRecord(input.server_raw).data),
		...listOrEmpty(asRecord(input.server_hourly).data),
	].filter(isRecord);
	const diskEntries = points.flatMap((point) => parseArray(point.disk_json));
	const netEntries = points.flatMap((point) => parseArray(point.net_json));
	const ioEntries = points.flatMap((point) => parseArray(point.disk_io_json));
	const ports = listOrEmpty(asRecord(tier2.ports).listening).filter(isRecord);
	const processes = parseArray(detail.top_processes_json);
	const deep = asRecord(tier2.disk_deep);
	const websites = asRecord(tier2.websites);
	const network = asRecord(report.network);
	const reportConnectivity = listOrEmpty(report.connectivity).filter(isRecord);
	const targetEntries = listOrEmpty(connectivity.targets).filter(isRecord);

	const values = (items, read) =>
		new Set(
			items
				.map(read)
				.filter((value) => typeof value === "string" && value.trim() !== "")
				.map((value) => value.trim()),
		);
	const aliases = (names, namer) =>
		new Map([...names].sort().map((name, index) => [name, namer(name, index)]));
	const alias = (map, value) =>
		typeof value === "string" && map.has(value.trim()) ? map.get(value.trim()) : null;

	const ifaces = values(
		[
			...listOrEmpty(detail.net_interfaces),
			...listOrEmpty(network.interfaces),
			...netEntries,
		].filter(isRecord),
		(entry) => entry.iface ?? entry.name,
	);
	const devices = values(
		[...listOrEmpty(detail.disks), ...ioEntries].filter(isRecord),
		(entry) => entry.device,
	);
	const mounts = values(
		[...diskEntries, ...listOrEmpty(report.disk)].filter(isRecord),
		(entry) => entry.mount,
	);
	const paths = values(
		[...listOrEmpty(deep.top_dirs), ...listOrEmpty(deep.large_files)].filter(isRecord),
		(entry) => entry.path,
	);
	const domains = values(
		[
			...listOrEmpty(websites.sites),
			...listOrEmpty(detail.dns_search),
			...listOrEmpty(tier2.dns_search),
		],
		(entry) => (typeof entry === "string" ? entry : entry.domain),
	);
	const units = values(
		listOrEmpty(asRecord(tier2.systemd).failed).filter(isRecord),
		(entry) => entry.unit,
	);
	const processNames = values([...ports, ...processes], (entry) => entry.process ?? entry.name);
	const serverIds = values([...targetEntries, ...reportConnectivity], (entry) => entry.server_id);

	let ethIndex = 0;
	let mountIndex = 0;
	let pathIndex = 0;
	let serviceIndex = 0;
	const ifaceAliases = aliases(ifaces, (name) =>
		/^lo\d*$/.test(name) ? "lo" : `eth${ethIndex++}`,
	);
	const deviceAliases = aliases(devices, (_name, index) =>
		index < 26 ? `vd${String.fromCharCode(97 + index)}` : `vd${index}`,
	);
	const mountAliases = aliases(mounts, (name) =>
		SAFE_MOUNTS.has(name) ? name : `/mnt/data-${pad(++mountIndex)}`,
	);
	const pathAliases = aliases(paths, (name) =>
		safePath(name) ? name : `/var/lib/demo-${pad(++pathIndex)}`,
	);
	const domainAliases = aliases(domains, (_name, index) => `site-${pad(index + 1)}.example.test`);
	const unitAliases = aliases(units, (_name, index) => `service-${pad(index + 1)}.service`);
	const serverAliases = aliases(serverIds, (_name, index) => `server-${pad(index + 1)}`);
	const processAliases = aliases(processNames, (name) =>
		PUBLIC_PROCESSES.has(name.toLowerCase())
			? name.toLowerCase()
			: `service-${pad(++serviceIndex)}`,
	);
	const targetMetadata = new Map();
	const rememberTarget = (entry) => {
		if (typeof entry.server_id !== "string") return;
		const key = entry.server_id.trim();
		if (key === "") return;
		targetMetadata.set(key, { address: entry.address, family: entry.family });
	};
	for (const entry of targetEntries) rememberTarget(entry);
	for (const entry of reportConnectivity) rememberTarget(entry);

	const ipv4 = new Map();
	const ipv6 = new Map();
	let ipv4Index = 0;
	let ipv6Index = 0;
	const ip = (value) => {
		if (typeof value !== "string") return null;
		const [address] = value.trim().split("%");
		const family = isIP(address);
		if (family === 4) {
			if (address === "0.0.0.0") return address;
			if (address.startsWith("127.")) return "127.0.0.1";
			if (DOC_V4.test(address)) return address;
			if (!ipv4.has(address)) ipv4.set(address, `203.0.113.${(ipv4Index++ % 254) + 1}`);
			return ipv4.get(address);
		}
		if (family === 6) {
			if (address === "::" || address === "::1") return address;
			if (isDocumentationV6(address)) return address.toLowerCase();
			if (!ipv6.has(address)) ipv6.set(address, `2001:db8::${(++ipv6Index).toString(16)}`);
			return ipv6.get(address);
		}
		return null;
	};

	const macs = new Map();
	const mac = (value) => {
		if (typeof value !== "string") return null;
		const address = value.trim().toLowerCase();
		if (!MAC.test(address)) return null;
		if (!macs.has(address))
			macs.set(address, `02:00:00:00:00:${macs.size.toString(16).padStart(2, "0")}`);
		return macs.get(address);
	};

	const pids = new Map();
	let pidIndex = 0;
	const pid = (value) => {
		const real = integer(value);
		if (real === null) return null;
		if (real <= 1) return real;
		if (!pids.has(real)) pids.set(real, 1000 + pidIndex++);
		return pids.get(real);
	};

	const process = (value) => {
		if (typeof value !== "string") return null;
		const name = value.trim();
		if (name === "" || name.length > 64) return null;
		if (PUBLIC_PROCESSES.has(name.toLowerCase())) return name.toLowerCase();
		if (!processAliases.has(name)) processAliases.set(name, `service-${pad(++serviceIndex)}`);
		return processAliases.get(name);
	};

	const user = (value) => {
		if (typeof value !== "string") return "demo";
		const name = value.trim().toLowerCase();
		return PUBLIC_USERS.has(name) ? name : "demo";
	};

	const containerIds = new Map();
	const containerNames = new Map();
	const containerImages = new Map();
	const containerId = (value) => {
		const key = typeof value === "string" ? value : "";
		if (!containerIds.has(key)) containerIds.set(key, `demo-${pad(containerIds.size + 1)}`);
		return containerIds.get(key);
	};
	const containerName = (value) => {
		const key = typeof value === "string" ? value : "";
		if (!containerNames.has(key))
			containerNames.set(key, `container-${pad(containerNames.size + 1)}`);
		return containerNames.get(key);
	};
	const containerImage = (value) => {
		const key = typeof value === "string" ? value : "";
		if (!containerImages.has(key))
			containerImages.set(key, `example.test/image-${pad(containerImages.size + 1)}:1`);
		return containerImages.get(key);
	};

	const reportIds = new Map();
	const reportId = (value) => {
		const key = typeof value === "string" ? value : "";
		if (!reportIds.has(key))
			reportIds.set(key, `10000000-0000-4000-8000-${String(reportIds.size + 1).padStart(12, "0")}`);
		return reportIds.get(key);
	};

	let serverIndex = serverAliases.size;
	const server = (value) => {
		const key = typeof value === "string" ? value.trim() : "";
		if (!serverAliases.has(key)) serverAliases.set(key, `server-${pad(++serverIndex)}`);
		return serverAliases.get(key);
	};

	const targets = () =>
		[...serverAliases].map(([real, safeId]) => {
			const info = targetMetadata.get(real) ?? {};
			const address = ip(info.address);
			const detected = isIP(address ?? "");
			const family =
				info.family === 6 || info.family === 4
					? info.family
					: detected === 6 || detected === 4
						? detected
						: null;
			return {
				server_id: safeId,
				name: `Server ${safeId.slice(-2)}`,
				address,
				family,
			};
		});

	return {
		age: (value) => {
			const seconds = integer(value);
			return seconds === null ? null : capturedAt - seconds;
		},
		hostId: "demo-server-01",
		hostHid: fnv1a("demo-server-01"),
		hostname: "server-01.example.test",
		workstationId: "00000000-0000-4000-8000-000000000001",
		ip,
		mac,
		pid,
		process,
		user,
		containerId,
		containerName,
		containerImage,
		reportId,
		server,
		targets,
		iface: (value) => alias(ifaceAliases, value),
		device: (value) => alias(deviceAliases, value),
		mount: (value) => alias(mountAliases, value),
		path: (value) => alias(pathAliases, value),
		domain: (value) => alias(domainAliases, value),
		unit: (value) => alias(unitAliases, value),
	};
}

function sanitizeIpList(ctx, value) {
	if (!Array.isArray(value)) return null;
	return value.map((entry) => ctx.ip(entry)).filter((entry) => entry !== null);
}

function sanitizeDomains(ctx, value) {
	if (!Array.isArray(value)) return null;
	return value.map((entry) => ctx.domain(entry)).filter((entry) => entry !== null);
}

function sanitizeSparkline(ctx, value) {
	return listOrEmpty(value)
		.filter(isRecord)
		.map((point) => ({ age_seconds: ctx.age(point.ts), v: finite(point.v) }));
}

function sanitizeInterfaces(ctx, value) {
	if (!Array.isArray(value)) return null;
	return value.filter(isRecord).map((entry) => ({
		iface: ctx.iface(entry.iface),
		mac: ctx.mac(entry.mac),
		ipv4: sanitizeIpList(ctx, entry.ipv4) ?? [],
		ipv6: sanitizeIpList(ctx, entry.ipv6) ?? [],
		speed_mbps: finite(entry.speed_mbps),
	}));
}

function sanitizeDisks(ctx, value) {
	if (!Array.isArray(value)) return null;
	return value.filter(isRecord).map((entry) => ({
		device: ctx.device(entry.device),
		size_bytes: integer(entry.size_bytes),
		rotational: typeof entry.rotational === "boolean" ? entry.rotational : null,
	}));
}

function sanitizeProcess(ctx, value) {
	const name = ctx.process(value.name);
	return {
		pid: ctx.pid(value.pid),
		name,
		cmd: name,
		state: oneOf(value.state, PROCESS_STATES) ?? "S",
		ppid: ctx.pid(value.ppid),
		user: ctx.user(value.user),
		cpu_pct: finite(value.cpu_pct),
		mem_rss: finite(value.mem_rss),
		mem_pct: finite(value.mem_pct),
		mem_virt: finite(value.mem_virt),
		num_threads: finite(value.num_threads),
		uptime: finite(value.uptime),
		majflt_rate: finite(value.majflt_rate),
		io_read_rate: finite(value.io_read_rate),
		io_write_rate: finite(value.io_write_rate),
		processor: finite(value.processor),
	};
}

function sanitizeDetail(ctx, value) {
	if (!isRecord(value)) return null;
	const maintenanceReason = value.maintenance_reason;
	const arch = sanitizeArch(value.arch);
	return {
		hid: ctx.hostHid,
		host_id: ctx.hostId,
		hostname: ctx.hostname,
		os: sanitizeOs(value.os),
		kernel: sanitizeKernel(value.kernel),
		arch,
		cpu_model: cpuLabel(arch),
		boot_time_age_seconds: ctx.age(value.boot_time),
		status: oneOf(value.status, HOST_STATUSES),
		cpu_usage_pct: finite(value.cpu_usage_pct),
		mem_used_pct: finite(value.mem_used_pct),
		uptime_seconds: finite(value.uptime_seconds),
		last_seen_age_seconds: ctx.age(value.last_seen),
		alert_count: integer(value.alert_count),
		cpu_logical: integer(value.cpu_logical),
		cpu_physical: integer(value.cpu_physical),
		mem_total_bytes: integer(value.mem_total_bytes),
		virtualization: oneOf(value.virtualization, VIRTUALIZATIONS),
		public_ip: ctx.ip(value.public_ip),
		probe_version: sanitizeVersion(value.probe_version),
		cpu_load1: finite(value.cpu_load1),
		swap_used_pct: finite(value.swap_used_pct),
		disk_root_used_pct: finite(value.disk_root_used_pct),
		net_rx_rate: finite(value.net_rx_rate),
		net_tx_rate: finite(value.net_tx_rate),
		cpu_sparkline: sanitizeSparkline(ctx, value.cpu_sparkline),
		mem_sparkline: sanitizeSparkline(ctx, value.mem_sparkline),
		net_sparkline: sanitizeSparkline(ctx, value.net_sparkline),
		maintenance_start: clock(value.maintenance_start),
		maintenance_end: clock(value.maintenance_end),
		maintenance_reason: maintenanceReason == null ? null : "Synthetic maintenance window",
		description: value.description == null ? null : "Synthetic demo server",
		swap_total_bytes: integer(value.swap_total_bytes),
		boot_mode: oneOf(value.boot_mode, BOOT_MODES),
		timezone: oneOf(value.timezone, TIMEZONES),
		dns_resolvers: sanitizeIpList(ctx, value.dns_resolvers),
		dns_search: sanitizeDomains(ctx, value.dns_search),
		net_interfaces: sanitizeInterfaces(ctx, value.net_interfaces),
		disks: sanitizeDisks(ctx, value.disks),
		top_processes: parseArray(value.top_processes_json)
			.map((entry) => sanitizeProcess(ctx, entry))
			.filter((entry) => entry.name !== null),
		top_processes_age_seconds: ctx.age(value.top_processes_ts),
	};
}

function sanitizeMetricPoint(ctx, value) {
	const point = { age_seconds: ctx.age(value.ts) };
	for (const field of METRIC_FIELDS) point[field] = finite(value[field]);
	point.disk = parseArray(value.disk_json).map((entry) => ({
		mount: ctx.mount(entry.mount),
		total_bytes: integer(entry.total_bytes),
		avail_bytes: integer(entry.avail_bytes),
		used_pct: finite(entry.used_pct),
		inodes_total: integer(entry.inodes_total),
		inodes_avail: integer(entry.inodes_avail),
		inodes_used_pct: finite(entry.inodes_used_pct),
	}));
	point.net = parseArray(value.net_json).map((entry) => ({
		iface: ctx.iface(entry.iface),
		rx_bytes_rate: finite(entry.rx_bytes_rate),
		tx_bytes_rate: finite(entry.tx_bytes_rate),
		rx_errors: finite(entry.rx_errors),
		tx_errors: finite(entry.tx_errors),
		rx_packets_rate: finite(entry.rx_packets_rate),
		tx_packets_rate: finite(entry.tx_packets_rate),
		rx_dropped: finite(entry.rx_dropped),
		tx_dropped: finite(entry.tx_dropped),
	}));
	point.disk_io = parseArray(value.disk_io_json).map((entry) => ({
		device: ctx.device(entry.device),
		read_iops: finite(entry.read_iops),
		write_iops: finite(entry.write_iops),
		read_bytes_sec: finite(entry.read_bytes_sec),
		write_bytes_sec: finite(entry.write_bytes_sec),
		io_util_pct: finite(entry.io_util_pct),
		read_await_ms: finite(entry.read_await_ms),
		write_await_ms: finite(entry.write_await_ms),
		io_queue_depth: finite(entry.io_queue_depth),
	}));
	return point;
}

function sanitizeMetrics(ctx, value, resolution) {
	if (!isRecord(value)) return null;
	return {
		host_id: ctx.hostId,
		resolution,
		from_age_seconds: ctx.age(value.from),
		to_age_seconds: ctx.age(value.to),
		data: listOrEmpty(value.data)
			.filter(isRecord)
			.map((point) => sanitizeMetricPoint(ctx, point)),
	};
}

function sanitizePorts(ctx, value) {
	if (!isRecord(value)) return null;
	return {
		listening: listOrEmpty(value.listening)
			.filter(isRecord)
			.map((entry) => ({
				port: integer(entry.port),
				bind: ctx.ip(entry.bind),
				protocol: oneOf(entry.protocol, ["tcp", "tcp6"]),
				pid: ctx.pid(entry.pid),
				process: ctx.process(entry.process),
			})),
	};
}

function sanitizeSystemd(ctx, value) {
	if (!isRecord(value)) return null;
	const failed = listOrEmpty(value.failed)
		.filter(isRecord)
		.map((entry) => ({
			unit: ctx.unit(entry.unit),
			load_state: oneOf(entry.load_state, LOAD_STATES),
			active_state: oneOf(entry.active_state, ACTIVE_STATES),
			sub_state: oneOf(entry.sub_state, SUB_STATES),
			description: "Synthetic unit",
		}));
	return { failed_count: integer(value.failed_count) ?? failed.length, failed };
}

function sanitizeSecurity(value) {
	if (!isRecord(value)) return null;
	return {
		ssh_password_auth:
			typeof value.ssh_password_auth === "boolean" ? value.ssh_password_auth : null,
		ssh_root_login: oneOf(value.ssh_root_login, [
			"yes",
			"no",
			"prohibit-password",
			"forced-commands-only",
		]),
		ssh_failed_logins_7d: integer(value.ssh_failed_logins_7d),
		firewall_active: typeof value.firewall_active === "boolean" ? value.firewall_active : null,
		firewall_default_policy: oneOf(value.firewall_default_policy, [
			"allow",
			"deny",
			"reject",
			"drop",
		]),
		fail2ban_active: typeof value.fail2ban_active === "boolean" ? value.fail2ban_active : null,
		fail2ban_banned_count: integer(value.fail2ban_banned_count),
		unattended_upgrades_active:
			typeof value.unattended_upgrades_active === "boolean"
				? value.unattended_upgrades_active
				: null,
	};
}

function sanitizeDocker(ctx, value) {
	if (!isRecord(value)) return null;
	const images = isRecord(value.images)
		? {
				total_count: integer(value.images.total_count),
				total_bytes: integer(value.images.total_bytes),
				reclaimable_bytes: integer(value.images.reclaimable_bytes),
			}
		: null;
	return {
		installed: typeof value.installed === "boolean" ? value.installed : null,
		version: sanitizeVersion(value.version),
		containers: listOrEmpty(value.containers)
			.filter(isRecord)
			.map((entry) => {
				const state = oneOf(entry.state, DOCKER_STATES);
				return {
					id: ctx.containerId(entry.id),
					name: ctx.containerName(entry.name),
					image: ctx.containerImage(entry.image),
					status: state === "running" ? "Up" : state === "exited" ? "Exited" : state,
					state,
					cpu_pct: finite(entry.cpu_pct),
					mem_bytes: finite(entry.mem_bytes),
					restart_count: integer(entry.restart_count),
					started_at_age_seconds: ctx.age(entry.started_at),
				};
			}),
		images,
	};
}

function sanitizeDiskDeep(ctx, value) {
	if (!isRecord(value)) return null;
	const entries = (items) =>
		listOrEmpty(items)
			.filter(isRecord)
			.map((entry) => ({ path: ctx.path(entry.path), size_bytes: integer(entry.size_bytes) }));
	return {
		top_dirs: entries(value.top_dirs),
		journal_bytes: integer(value.journal_bytes),
		large_files: entries(value.large_files),
	};
}

function sanitizeSoftware(value) {
	if (!isRecord(value)) return null;
	const detected = [];
	for (const entry of listOrEmpty(value.detected)) {
		if (!isRecord(entry)) continue;
		const id = typeof entry.id === "string" ? entry.id.trim().toLowerCase() : "";
		if (!PUBLIC_SOFTWARE.has(id)) continue;
		detected.push({
			id,
			name: id,
			category: oneOf(entry.category, SOFTWARE_CATEGORIES),
			version: sanitizeVersion(entry.version),
			source: oneOf(entry.source, SOFTWARE_SOURCES),
			running: typeof entry.running === "boolean" ? entry.running : null,
			listening_ports: listOrEmpty(entry.listening_ports)
				.map(integer)
				.filter((port) => port !== null),
		});
	}
	return {
		detected,
		scan_duration_ms: finite(value.scan_duration_ms),
		version_duration_ms: finite(value.version_duration_ms),
	};
}

function sanitizeWebsites(ctx, value) {
	if (!isRecord(value)) return null;
	return {
		sites: listOrEmpty(value.sites)
			.filter(isRecord)
			.map((entry) => ({
				domain: ctx.domain(entry.domain),
				web_server: oneOf(entry.web_server, ["nginx", "apache"]),
				ssl: typeof entry.ssl === "boolean" ? entry.ssl : null,
			})),
	};
}

function sanitizeTier2(ctx, value) {
	if (!isRecord(value)) return null;
	return {
		host_id: ctx.hostId,
		age_seconds: ctx.age(value.ts),
		ports: sanitizePorts(ctx, value.ports),
		systemd: sanitizeSystemd(ctx, value.systemd),
		security: sanitizeSecurity(value.security),
		docker: sanitizeDocker(ctx, value.docker),
		disk_deep: sanitizeDiskDeep(ctx, value.disk_deep),
		software: sanitizeSoftware(value.software),
		websites: sanitizeWebsites(ctx, value.websites),
		timezone: oneOf(value.timezone, TIMEZONES),
		dns_resolvers: sanitizeIpList(ctx, value.dns_resolvers),
		dns_search: sanitizeDomains(ctx, value.dns_search),
	};
}

function sanitizeReport(ctx, value) {
	if (!isRecord(value)) return null;
	const cpu = asRecord(value.cpu);
	const mem = asRecord(value.mem);
	const network = asRecord(value.network);
	const arch = sanitizeArch(value.arch);
	return {
		report_id: ctx.reportId(value.report_id),
		started_at_age_seconds: ctx.age(value.started_at),
		finished_at_age_seconds: ctx.age(value.finished_at),
		received_at_age_seconds: ctx.age(value.received_at),
		sample_window_ms: finite(value.sample_window_ms),
		cli_version: sanitizeVersion(value.cli_version),
		hostname: "workstation-01.example.test",
		os: sanitizeOs(value.os),
		arch,
		uptime_seconds: finite(value.uptime_seconds),
		cpu: {
			model: cpuLabel(arch),
			count: integer(cpu.count),
			usage_pct: finite(cpu.usage_pct),
		},
		mem: {
			total_bytes: integer(mem.total_bytes),
			available_bytes: integer(mem.available_bytes),
			used_pct: finite(mem.used_pct),
		},
		disk: listOrEmpty(value.disk)
			.filter(isRecord)
			.map((entry) => ({
				mount: ctx.mount(entry.mount),
				total_bytes: integer(entry.total_bytes),
				available_bytes: integer(entry.available_bytes),
				used_pct: finite(entry.used_pct),
			})),
		network: {
			interfaces: listOrEmpty(network.interfaces)
				.filter(isRecord)
				.map((entry) => ({
					name: ctx.iface(entry.name),
					addresses: listOrEmpty(entry.addresses)
						.filter(isRecord)
						.map((address) => ({
							address: ctx.ip(address.address),
							family: address.family === 6 ? 6 : 4,
							internal: typeof address.internal === "boolean" ? address.internal : null,
						})),
				})),
		},
		connectivity: listOrEmpty(value.connectivity)
			.filter(isRecord)
			.map((entry) => {
				const values = Array.isArray(entry.rtts_ms) ? entry.rtts_ms.slice(0, 3).map(finite) : [];
				return {
					server_id: ctx.server(entry.server_id),
					address: ctx.ip(entry.address),
					family: entry.family === 6 ? 6 : 4,
					sent: integer(entry.sent),
					received: integer(entry.received),
					rtts_ms: [values[0] ?? null, values[1] ?? null, values[2] ?? null],
					status: oneOf(entry.status, CONNECTIVITY_STATUSES),
				};
			}),
		collection_errors: listOrEmpty(value.collection_errors).map(() => "Collection failed"),
		targets_error: value.targets_error == null ? null : "Target discovery failed",
	};
}

function sanitizeWorkstation(ctx, value) {
	if (!isRecord(value)) return null;
	return {
		id: ctx.workstationId,
		owner: "email:operator@example.test",
		name: "Demo workstation",
		created_at_age_seconds: ctx.age(value.created_at),
		last_seen_at_age_seconds: ctx.age(value.last_seen_at),
		public_ip: ctx.ip(value.public_ip),
		disabled: value.disabled === true,
		latest_report: sanitizeReport(ctx, value.latest_report),
	};
}

function sanitizeWorkstationMetrics(ctx, value) {
	if (!isRecord(value)) return null;
	const page = asRecord(value.page);
	return {
		data: listOrEmpty(value.data)
			.filter(isRecord)
			.map((point) => ({
				received_at_age_seconds: ctx.age(point.received_at),
				started_at_age_seconds: ctx.age(point.started_at),
				finished_at_age_seconds: ctx.age(point.finished_at),
				cpu_usage_pct: finite(point.cpu_usage_pct),
				mem_used_pct: finite(point.mem_used_pct),
				mem_total_bytes: integer(point.mem_total_bytes),
				mem_available_bytes: integer(point.mem_available_bytes),
				uptime_seconds: finite(point.uptime_seconds),
			})),
		page: {
			limit: integer(page.limit),
			offset: integer(page.offset),
			next_offset: integer(page.next_offset),
		},
	};
}

function sanitizeConnectivity(ctx, value) {
	if (!isRecord(value)) return null;
	return {
		targets: listOrEmpty(value.targets)
			.filter(isRecord)
			.map((target) => ({
				server_id: ctx.server(target.server_id),
				address: ctx.ip(target.address),
				family: target.family === 6 ? 6 : 4,
				data: listOrEmpty(target.data)
					.filter(isRecord)
					.map((point) => ({
						received_at_age_seconds: ctx.age(point.received_at),
						received: integer(point.received),
						rtt_avg_ms: finite(point.rtt_avg_ms),
						rtt_min_ms: finite(point.rtt_min_ms),
						rtt_max_ms: finite(point.rtt_max_ms),
						status: oneOf(point.status, CONNECTIVITY_STATUSES),
					})),
			})),
		limit: integer(value.limit),
	};
}

function sanitizeAllowedPort(ctx, value) {
	if (!isRecord(value)) return null;
	return {
		port: integer(value.port),
		reason: "Synthetic allowlist entry",
		created_at_age_seconds: ctx.age(value.created_at),
	};
}

function sanitizeTag(value, index) {
	if (!isRecord(value)) return null;
	return {
		id: index + 1,
		name: `tag-${pad(index + 1)}`,
		color: integer(value.color),
	};
}

export function sanitizeRecording(input) {
	if (!isRecord(input)) throw new Error("recording must be an object");
	const capturedAt = integer(input.captured_at);
	if (capturedAt === null) throw new Error("recording.captured_at must be epoch seconds");
	const detail = requireRecord("server_detail", input.server_detail);
	const raw = requireRecord("server_raw", input.server_raw);
	const hourly = requireRecord("server_hourly", input.server_hourly);
	const tier2 = requireRecord("server_tier2", input.server_tier2);
	const workstationDetail = requireRecord("workstation_detail", input.workstation_detail);
	const workstationMetrics = requireRecord("workstation_metrics", input.workstation_metrics);
	const connectivity = requireRecord("workstation_connectivity", input.workstation_connectivity);
	const ports = requireList("server_ports", input.server_ports);
	const tags = requireList("server_tags", input.server_tags);
	const ctx = createContext({ ...input, server_detail: detail, server_tier2: tier2 }, capturedAt);
	return {
		schema_version: SCHEMA_VERSION,
		server: {
			detail: sanitizeDetail(ctx, detail),
			raw: sanitizeMetrics(ctx, raw, "raw"),
			hourly: sanitizeMetrics(ctx, hourly, "hourly"),
			tier2: sanitizeTier2(ctx, tier2),
			allowed_ports: ports.map((entry) => sanitizeAllowedPort(ctx, entry)).filter(Boolean),
			tags: tags.map((entry, index) => sanitizeTag(entry, index)).filter(Boolean),
		},
		workstation: {
			detail: sanitizeWorkstation(ctx, workstationDetail),
			metrics: sanitizeWorkstationMetrics(ctx, workstationMetrics),
			connectivity: sanitizeConnectivity(ctx, connectivity),
		},
		targets: ctx.targets(),
	};
}
