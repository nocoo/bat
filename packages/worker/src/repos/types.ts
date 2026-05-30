// Domain repository contracts. Implementations live in `adapters/d1/`.
//
// Each repo's methods are filled in by its own atomic commit (C2–C11);
// this file declares the slots and bundles them as `Repositories` so
// `c.var.repos` and the cron `createD1Repositories(env.DB)` factory can
// be wired before any individual repo lands.
//
// Acceptance contract for the wider refactor (docs/20-d1-to-kv-migration.md
// v6 §3.4): once C11 ships, no SQL/`c.env.DB`/`db.prepare` reference exists
// outside `adapters/d1/**`. Routes/middleware/cron consume only these
// interfaces.

import type {
	AgentHeartbeatEntry,
	AgentHeartbeatResponse,
	AgentItem,
	AgentRow,
	AllowedPort,
	AssetItem,
	AssetMapResponse,
	AssetRow,
	AssetsOverview,
	BindingItem,
	CliTokenRow,
	CliTokenScope,
	EventRow,
	HostTag,
	MetricsPayload,
	RetentionDays,
	Tier2Payload,
	Tier2Snapshot,
	WebhookConfigRow,
} from "@bat/shared";

/**
 * Host inventory + read-model primitives. Powers `/api/hosts`,
 * `/api/hosts/:id`, the four `/api/monitoring/*` endpoints, the
 * `/api/live` DB probe, and `/api/fleet/status`. Plus the cross-route
 * `host_id` / `hid` resolver. All write paths (metrics raw insert,
 * heartbeat/host upsert, host_description PATCH, retirement) remain
 * for C10 — see `docs/20-d1-to-kv-migration.md` v6 §3.4.
 */
export interface HostsRepository {
	/** SELECT 1 — used by `/api/live` to confirm the binding is reachable. */
	probe(): Promise<void>;

	/** Active-host scan; the resolver compares `hashHostId(row.host_id)` against
	 *  the 8-char hid hash. Used when the route param looks like a hid. */
	listActiveHostIds(): Promise<{ host_id: string }[]>;

	/** All-hosts scan (active + retired); used by the maintenance / retire
	 *  routes that need to 403 a known-but-retired host. */
	listAllHostIdsWithActive(): Promise<{ host_id: string; is_active: number }[]>;

	/** Look up a single host's `(host_id, is_active)` by raw host_id. */
	getActiveFlag(hostId: string): Promise<{ host_id: string; is_active: number } | null>;

	/** Active-host inventory used by `/api/hosts` list. */
	listOverviewRows(): Promise<HostOverviewRow[]>;

	/** Active-host inventory used by `/api/fleet/status` and the four
	 *  monitoring routes (only the small status-derivation columns). */
	listStatusRows(): Promise<HostStatusRow[]>;

	/** Single active host with the full inventory required by
	 *  `/api/hosts/:id`. Returns null when missing or retired. */
	getDetailRow(hostId: string): Promise<HostDetailRow | null>;

	/** Single active host with just the columns the monitoring host-detail
	 *  route needs. Returns null when missing or retired. */
	getStatusRow(hostId: string): Promise<HostStatusRow | null>;

	/** Latest metrics_raw row for the hosts list / host-detail page. */
	getLatestMetricsBatch(hostIds: string[]): Promise<HostLatestMetricsRow[]>;

	/** Latest uptime_seconds for the monitoring host-detail route. */
	getLatestUptime(hostId: string): Promise<number | null>;

	/** 24h hourly sparkline rows for the hosts list. */
	listSparklineRowsSince(hostIds: string[], sinceSeconds: number): Promise<HostSparklineRow[]>;

	/** Read `(is_active, maintenance_start, maintenance_end)` for the ingest
	 *  hot path: a single SELECT covering retired check + maintenance window
	 *  + host existence. Returns null for unknown hosts. */
	getActiveAndMaintenance(hostId: string): Promise<{
		is_active: number;
		maintenance_start: string | null;
		maintenance_end: string | null;
	} | null>;
	/** Upsert host identity (hostname/os/kernel/arch/cpu_model/boot_time +
	 *  last_seen + identity_updated_at + probe_version) used by `/api/identity`.
	 *  ON CONFLICT(host_id) refreshes all listed columns. */
	upsertIdentity(params: {
		hostId: string;
		hostname: string;
		os: string;
		kernel: string;
		arch: string;
		cpuModel: string;
		bootTime: number;
		probeVersion: string | null;
		nowSeconds: number;
	}): Promise<void>;
	/** Partial update of inventory columns. Caller passes only fields that
	 *  were present on the wire. Empty `fields` is a no-op. */
	updateInventory(hostId: string, fields: HostInventoryUpdate): Promise<void>;
	/** Partial update of tier-2 slow-drift inventory (timezone / dns_*).
	 *  Empty `fields` is a no-op. */
	updateTier2Inventory(hostId: string, fields: HostTier2Inventory): Promise<void>;
	/** Update the host's free-form description (or clear it with null). */
	updateDescription(hostId: string, description: string | null): Promise<void>;
	/** Ensure a host row exists for FK targets (no last_seen bump if it
	 *  already does). Used by `/api/tier2` before its alert/inventory
	 *  writes. `nowSeconds` is only consumed on the first-seen path. */
	ensureExists(hostId: string, hostname: string, nowSeconds: number): Promise<void>;
	/** Refresh `last_seen` for an existing host. Used by `/api/tier2`
	 *  after a fresh snapshot is inserted. */
	touchLastSeen(hostId: string, nowSeconds: number): Promise<void>;
}

/** Optional fields touched by `POST /api/identity` inventory merge. Each
 *  field corresponds to a wire-payload key; absence means "leave unchanged". */
export interface HostInventoryUpdate {
	cpu_logical?: number | null;
	cpu_physical?: number | null;
	mem_total_bytes?: number | null;
	swap_total_bytes?: number | null;
	virtualization?: string | null;
	net_interfaces?: unknown;
	disks?: unknown;
	boot_mode?: string | null;
	public_ip?: string | null;
}

/** Optional fields touched by `POST /api/tier2` slow-drift inventory merge. */
export interface HostTier2Inventory {
	timezone?: string | null;
	dns_resolvers?: unknown;
	dns_search?: unknown;
}

/** Subset of `hosts` columns required by the `/api/hosts` overview list. */
export interface HostOverviewRow {
	host_id: string;
	hostname: string;
	os: string | null;
	kernel: string | null;
	arch: string | null;
	cpu_model: string | null;
	boot_time: number | null;
	last_seen: number;
	cpu_logical: number | null;
	cpu_physical: number | null;
	mem_total_bytes: number | null;
	virtualization: string | null;
	public_ip: string | null;
	probe_version: string | null;
	maintenance_start: string | null;
	maintenance_end: string | null;
	maintenance_reason: string | null;
}

/** Subset used for status derivation (fleet + monitoring). */
export interface HostStatusRow {
	host_id: string;
	hostname: string;
	last_seen: number;
	maintenance_start: string | null;
	maintenance_end: string | null;
}

/** Full row required by `/api/hosts/:id` detail. */
export interface HostDetailRow {
	host_id: string;
	hostname: string;
	os: string | null;
	kernel: string | null;
	arch: string | null;
	cpu_model: string | null;
	boot_time: number | null;
	last_seen: number;
	probe_version: string | null;
	cpu_logical: number | null;
	cpu_physical: number | null;
	mem_total_bytes: number | null;
	swap_total_bytes: number | null;
	virtualization: string | null;
	net_interfaces: string | null;
	disks: string | null;
	boot_mode: string | null;
	timezone: string | null;
	dns_resolvers: string | null;
	dns_search: string | null;
	public_ip: string | null;
	description: string | null;
	maintenance_start: string | null;
	maintenance_end: string | null;
	maintenance_reason: string | null;
}

export interface HostLatestMetricsRow {
	host_id: string;
	cpu_usage_pct: number | null;
	mem_used_pct: number | null;
	uptime_seconds: number | null;
	cpu_load1: number | null;
	swap_used_pct: number | null;
	disk_json: string | null;
	net_json: string | null;
}

export interface HostSparklineRow {
	host_id: string;
	ts: number;
	cpu: number | null;
	mem: number | null;
	net: number | null;
}

/**
 * Metrics raw + hourly read/write. Powers `/api/hosts/:id/metrics` reads
 * (raw vs hourly auto-resolution) and `/api/ingest` writes (raw insert
 * batched with host upsert). Hourly aggregation writes belong to the
 * cron path and stay with C11.
 */
export interface MetricsRepository {
	/** Read raw metrics rows (full column projection) for the metrics query
	 *  route. Caller still owns ext_json unpacking and DTO shaping. */
	queryRaw(hostId: string, from: number, to: number): Promise<MetricsRawRow[]>;
	/** Read hourly aggregate rows for the metrics query route. */
	queryHourly(hostId: string, from: number, to: number): Promise<MetricsHourlyRow[]>;
	/** Atomic batch: host upsert + metrics_raw INSERT OR IGNORE.
	 *  Returns whether the metrics row was newly inserted (false on duplicate).
	 *  `mode = "first-seen"` issues an INSERT … ON CONFLICT … last_seen update
	 *  for the host; `mode = "existing"` issues a plain UPDATE. */
	insertRawWithHostUpsert(
		hostId: string,
		hostname: string,
		payload: MetricsPayload,
		nowSeconds: number,
		mode: "first-seen" | "existing",
	): Promise<{ inserted: boolean }>;
}

/** Raw metrics row as projected by the /api/hosts/:id/metrics raw query.
 *  ext_json is built server-side from the underlying scalar columns and
 *  unpacked by the route. */
export interface MetricsRawRow extends Record<string, unknown> {
	ext_json: string | null;
}

/** Hourly metrics row as projected by the same query when range > the
 *  AUTO_RESOLUTION threshold. */
export interface MetricsHourlyRow extends Record<string, unknown> {
	ext_json: string | null;
}
/**
 * Alert state read + reconciliation. Pure rule evaluators live in
 * `domain/alerts/{evaluate,tier2}.ts`; this repo only owns the D1 persistence
 * (alert_states + alert_pending) and the joined-with-hosts read for the list
 * route. Maintenance-window filtering stays in the route since it depends on
 * wall-clock semantics.
 */
export interface AlertsRepository {
	/** Active alerts joined with host inventory + maintenance window for the
	 *  /api/alerts list route; ordered by triggered_at desc. */
	listActiveJoinedHosts(): Promise<AlertActiveJoinedRow[]>;
	/** Evaluate tier-1 / signal-expansion / tier-3 rules and reconcile
	 *  alert_states + alert_pending in a single batch. No-op when nothing
	 *  changed. */
	evaluateAndApply(hostId: string, payload: MetricsPayload, now: number): Promise<void>;
	/** Evaluate tier-2 rules (uses the host's per-host port allowlist) and
	 *  reconcile alert_states + alert_pending in a single batch. */
	evaluateAndApplyTier2(hostId: string, payload: Tier2Payload, now: number): Promise<void>;
	/**
	 * Clear all pending duration-rule timers for a host. Used by ingest when a
	 * host enters its maintenance window — we suppress alert evaluation but
	 * still need to drop accumulated `alert_pending.first_seen` so the
	 * post-maintenance baseline is clean. Does not touch `alert_states`
	 * (already-fired alerts persist; the maintenance filter on the list route
	 * hides them).
	 */
	clearPendingForHost(hostId: string): Promise<void>;
	/** Read-model: alerts for the given hosts, used by hosts list, host
	 *  detail, fleet-status, and the monitoring routes. Empty input → empty
	 *  output without a DB call. */
	listForHosts(hostIds: string[]): Promise<AlertReadRow[]>;
	/** Per-host alert counts (`COUNT(*) GROUP BY host_id`) for the hosts
	 *  list. Hosts with zero alerts are absent from the returned map. */
	countByHost(hostIds: string[]): Promise<Map<string, number>>;
}

/** Subset of `alert_states` consumed by the read-model routes. `value` and
 *  `triggered_at` are always selected so the same SELECT serves the
 *  monitoring routes too; the hosts/host-detail/fleet-status callers ignore
 *  those fields. */
export interface AlertReadRow {
	host_id: string;
	severity: string;
	rule_id: string;
	message: string | null;
	value: number | null;
	triggered_at: number;
}

export interface AlertActiveJoinedRow {
	host_id: string;
	hostname: string;
	rule_id: string;
	severity: string;
	value: number | null;
	triggered_at: number;
	message: string | null;
	maintenance_start: string | null;
	maintenance_end: string | null;
}
/**
 * Webhook event ingest + read. Powers `POST /api/events` (token lookup,
 * IP validation, rate limit, event insert) and `GET /api/events`
 * (paginated list). Webhook config CRUD itself is owned by
 * `WebhooksRepository`.
 */
export interface EventsRepository {
	/** Look up an active webhook config by token. */
	findActiveWebhookByToken(token: string): Promise<WebhookConfigRow | null>;
	/** Read a host's `public_ip` for the ingest IP-match check. Cross-domain
	 *  read kept here to keep the ingest path's SQL inside `adapters/d1/`. */
	getHostPublicIp(hostId: string): Promise<string | null>;
	/** Sliding-window rate limiter. Returns true when the call is within
	 *  the configured per-minute limit. */
	checkRateLimit(configId: number, rateLimit: number, nowSeconds: number): Promise<boolean>;
	/** Persist a new event row. */
	insertEvent(
		hostId: string,
		configId: number,
		title: string,
		body: string,
		tags: string[],
		sourceIp: string,
		nowSeconds: number,
	): Promise<void>;
	/** Total event count, optionally filtered by host_id. */
	count(hostId: string | undefined): Promise<number>;
	/** List events with hostname join, ordered by created_at desc. */
	list(hostId: string | undefined, limit: number, offset: number): Promise<EventRow[]>;
}

/**
 * Webhook config CRUD. Each method touches `webhook_configs`; FK existence
 * checks (host present) are handled inside the adapter so routes never
 * reach into other domains via raw SQL.
 */
export interface WebhooksRepository {
	/** List configs joined with hostname, ordered by created_at desc. */
	list(): Promise<(WebhookConfigRow & { hostname: string })[]>;

	/**
	 * Create a config for `hostId`. Result discriminator:
	 * - `{ ok: true, row }` on success.
	 * - `{ ok: "host_not_found" }` if the FK target host doesn't exist.
	 * - `{ ok: "duplicate" }` if a config already exists for this host
	 *   (UNIQUE constraint on host_id).
	 */
	create(
		hostId: string,
		nowSeconds: number,
	): Promise<{ ok: true; row: WebhookConfigRow } | { ok: "host_not_found" } | { ok: "duplicate" }>;

	/** Delete by id. Returns true on hit, false when missing. */
	delete(configId: number): Promise<boolean>;

	/** Rotate the token. Returns the new token, or null when id is missing. */
	regenerateToken(configId: number, nowSeconds: number): Promise<string | null>;
}

/**
 * Port allowlist CRUD. Host existence is enforced inside the adapter so
 * routes never run cross-domain SQL. Per-host routes accept raw `host_id`
 * (not the 8-char `hid` hash) by design — see `routes/allowed-ports.ts`.
 */
export interface PortAllowlistRepository {
	/** All ports across all hosts, grouped by host_id, ordered by host_id then port. */
	listAllByHost(): Promise<Record<string, number[]>>;

	/**
	 * List ports for a single host.
	 * - `{ ok: true, rows }` on success.
	 * - `{ ok: "host_not_found" }` if the host id doesn't exist.
	 */
	listForHost(
		hostId: string,
	): Promise<{ ok: true; rows: AllowedPort[] } | { ok: "host_not_found" }>;

	/**
	 * Add a port to a host's allowlist. Idempotent.
	 * - `{ ok: true, row, created }` on success; `created` distinguishes
	 *   "freshly inserted" from "already present".
	 * - `{ ok: "host_not_found" }` if the host id doesn't exist.
	 * - `{ ok: "limit_exceeded", max }` when the host already has the
	 *   maximum number of ports and the request is for a new port.
	 */
	addToHost(
		hostId: string,
		port: number,
		reason: string,
	): Promise<
		| { ok: true; row: AllowedPort; created: boolean }
		| { ok: "host_not_found" }
		| { ok: "limit_exceeded"; max: number }
	>;

	/** Remove a port from a host's allowlist. Returns true on hit, false on miss. */
	removeFromHost(hostId: string, port: number): Promise<boolean>;
	/** Read-model: ports for the given hosts, grouped by host_id, ordered by
	 *  `(host_id, port)`. Used by hosts list / host-detail / fleet-status /
	 *  monitoring for status derivation. Empty input → empty map without a
	 *  DB call. */
	listForHosts(hostIds: string[]): Promise<Map<string, Set<number>>>;
}
/**
 * Tags + host-tag edges. Host existence is enforced inside the adapter so
 * routes never run cross-domain SQL. Per-host routes accept raw `host_id`
 * (not the 8-char hid hash) by design — see `routes/tags.ts`.
 */
export interface TagsRepository {
	/** All tags with a derived host_count, ordered by name. */
	list(): Promise<Array<{ id: number; name: string; color: number; host_count: number }>>;

	/**
	 * Create a tag. Color rotates when null.
	 * - `{ ok: true, row }` on success.
	 * - `{ ok: "duplicate" }` on UNIQUE name conflict.
	 */
	create(
		name: string,
		color: number | null,
	): Promise<{ ok: true; row: { id: number; name: string; color: number } } | { ok: "duplicate" }>;

	/**
	 * Partial update (rename / recolor). Both fields optional but the
	 * caller must already have validated that at least one is provided.
	 * - `{ ok: true, row }` on success.
	 * - `{ ok: "not_found" }` if the id doesn't exist.
	 * - `{ ok: "duplicate" }` on UNIQUE name conflict.
	 */
	update(
		id: number,
		fields: { name?: string; color?: number },
	): Promise<
		| { ok: true; row: { id: number; name: string; color: number } }
		| { ok: "not_found" }
		| { ok: "duplicate" }
	>;

	/** Delete by id (cascades host_tags via FK). Returns true on hit, false on miss. */
	delete(id: number): Promise<boolean>;

	/** All host→tags mappings grouped by host_id, tags ordered by name. */
	byHostsAll(): Promise<Record<string, HostTag[]>>;

	/** Tags assigned to a single host, ordered by name. */
	listForHost(hostId: string): Promise<HostTag[]>;

	/**
	 * Add a tag to a host's tag set. Idempotent.
	 * - `{ ok: true, tag }` on success.
	 * - `{ ok: "host_not_found" }` if the host id doesn't exist.
	 * - `{ ok: "tag_not_found" }` if the tag id doesn't exist.
	 * - `{ ok: "limit_exceeded", max }` when the host already has the
	 *   maximum number of tags.
	 */
	addToHost(
		hostId: string,
		tagId: number,
	): Promise<
		| { ok: true; tag: HostTag }
		| { ok: "host_not_found" }
		| { ok: "tag_not_found" }
		| { ok: "limit_exceeded"; max: number }
	>;

	/**
	 * Replace a host's tag set (DELETE then INSERT semantics).
	 * - `{ ok: true, tags }` on success (returns updated list).
	 * - `{ ok: "host_not_found" }` if the host id doesn't exist.
	 * - `{ ok: "tags_not_found", missing }` if any tag id is unknown.
	 */
	replaceForHost(
		hostId: string,
		tagIds: number[],
	): Promise<
		| { ok: true; tags: HostTag[] }
		| { ok: "host_not_found" }
		| { ok: "tags_not_found"; missing: number[] }
	>;

	/** Remove an edge. Returns true on hit, false on miss. */
	removeFromHost(hostId: string, tagId: number): Promise<boolean>;
	/** Read-model: tag names for the given hosts, grouped by host_id, ordered
	 *  by name. Used by the monitoring routes. Empty input → empty map
	 *  without a DB call. */
	listNamesForHosts(hostIds: string[]): Promise<Map<string, string[]>>;
}

/** Settings KV-style store. `retention_days` is the only key in use today. */
export interface SettingsRepository {
	/** Read retention_days. Returns DEFAULT_RETENTION_DAYS on missing/bad/error. */
	getRetentionDays(): Promise<RetentionDays>;
	/** Upsert retention_days. */
	setRetentionDays(value: RetentionDays): Promise<void>;
}

/**
 * Maintenance window read/write for a host's `maintenance_*` columns.
 * Callers pass an already-resolved raw `host_id`; hid resolution still
 * lives in `lib/resolve-host.ts` until C9 folds it into HostsRepository.
 */
export interface MaintenanceRepository {
	/** Returns the window for `hostId`, or null when no window is set. */
	getForHost(hostId: string): Promise<MaintenanceWindow | null>;
	/** Upsert the window for `hostId`. */
	setForHost(hostId: string, window: MaintenanceWindow): Promise<void>;
	/** Clear the window (sets all three columns to NULL). */
	clearForHost(hostId: string): Promise<void>;
}

export interface MaintenanceWindow {
	start: string;
	end: string;
	reason: string | null;
}
/**
 * Agent CRUD + agent_tags edges + heartbeat. Atomic upsert via
 * INSERT ... ON CONFLICT(source_key, match_key) preserves race-safe
 * behaviour from the previous services/agents.ts. Host FK existence
 * is exposed so routes never inline a hosts SELECT.
 */
export interface AgentsRepository {
	/** All agents with hostname join + tags, ordered by created_at desc. */
	list(): Promise<AgentItem[]>;
	/** Single agent with hostname + tags, or null. */
	getById(id: string): Promise<AgentItem | null>;
	/** Hard delete. */
	delete(id: string): Promise<boolean>;
	/** Partial update; returns updated row or null. */
	update(
		id: string,
		fields: {
			host_id?: string | null | undefined;
			nickname?: string | null | undefined;
			role?: string | null | undefined;
			runtime_app?: string | null | undefined;
			runtime_version?: string | null | undefined;
			status?: string | undefined;
			metadata?: string | undefined;
		},
	): Promise<AgentRow | null>;
	/**
	 * Race-safe upsert keyed on `(source_key, match_key)`. Returns the
	 * agent id and a `created` flag (true when this call inserted the row).
	 */
	upsertBy(
		createParams: {
			source_key: string;
			match_key: string;
			host_id?: string | null;
			nickname?: string | null;
			role?: string | null;
			runtime_app?: string | null;
			runtime_version?: string | null;
			status?: string;
			metadata?: string;
		},
		updateFields: {
			host_id?: string | null | undefined;
			nickname?: string | null | undefined;
			role?: string | null | undefined;
			runtime_app?: string | null | undefined;
			runtime_version?: string | null | undefined;
			status?: string | undefined;
			metadata?: string | undefined;
		},
	): Promise<{ id: string; created: boolean }>;
	/** Replace agent_tags edges; missing returns the missing list. */
	replaceTags(
		agentId: string,
		tagIds: number[],
	): Promise<{ ok: true } | { ok: "tags_not_found"; missing: number[] }>;
	/** FK helper. */
	hostExists(hostId: string): Promise<boolean>;
	/**
	 * Apply a CLI heartbeat report keyed by `source_key`. Atomic batch:
	 * updates reported agents, ON-CONFLICT-creates new ones, marks
	 * unreported existing agents as `missing`.
	 */
	processHeartbeat(
		sourceKey: string,
		agents: AgentHeartbeatEntry[],
		nowSeconds: number,
	): Promise<AgentHeartbeatResponse>;
}
/**
 * Asset CRUD + asset_tags edges. Host FK existence is exposed as a
 * dedicated method so routes never inline a hosts SELECT.
 */
export interface AssetsRepository {
	/** All assets with hostname join + tags, ordered by created_at desc. */
	list(): Promise<AssetItem[]>;
	/** Single asset with hostname + tags, or null. */
	getById(id: string): Promise<AssetItem | null>;
	/**
	 * Create. The caller has already validated payload shape. Returns the
	 * raw inserted row (route re-reads through `getById` for the wire DTO).
	 */
	create(params: {
		id: string;
		host_id?: string | null;
		type: string;
		subtype?: string | null;
		name: string;
		provider?: string | null;
		status?: string;
		metadata?: string;
	}): Promise<AssetRow>;
	/**
	 * Partial update; bumps `updated_at`. Returns the updated row or null
	 * when the id doesn't exist. Falls back to the current row when no
	 * fields are provided (legacy behaviour preserved).
	 */
	update(
		id: string,
		fields: {
			host_id?: string | null | undefined;
			name?: string | undefined;
			subtype?: string | null | undefined;
			provider?: string | null | undefined;
			status?: string | undefined;
			metadata?: string | undefined;
		},
	): Promise<AssetRow | null>;
	/** Hard delete. Returns true on hit. */
	delete(id: string): Promise<boolean>;
	/**
	 * Replace asset_tags edges. Validates all tag ids exist; returns the
	 * missing list otherwise. Empty list clears the edge set.
	 */
	replaceTags(
		assetId: string,
		tagIds: number[],
	): Promise<{ ok: true } | { ok: "tags_not_found"; missing: number[] }>;
	/** FK helper: is this host_id present? Used by create/update validation. */
	hostExists(hostId: string): Promise<boolean>;
}
/**
 * Agent ↔ Asset bindings + the read-model views (`/assets/map`,
 * `/assets/overview`). FK existence helpers are exposed so routes
 * stay free of inline SQL.
 */
export interface BindingsRepository {
	/** All bindings with denormalized agent nickname + asset name/type. */
	list(): Promise<BindingItem[]>;
	/**
	 * Idempotent create. `{ created: true }` on insert, `{ created: false }`
	 * on UNIQUE conflict.
	 */
	create(agentId: string, assetId: string): Promise<{ created: boolean }>;
	/** Delete a binding. Returns true on hit. */
	delete(agentId: string, assetId: string): Promise<boolean>;
	/** Full graph view for visualisation. */
	getAssetMap(): Promise<AssetMapResponse>;
	/** Lightweight counters. */
	getOverview(): Promise<AssetsOverview>;
	/** FK helper: agent presence. */
	agentExists(agentId: string): Promise<boolean>;
	/** FK helper: asset presence. */
	assetExists(assetId: string): Promise<boolean>;
}
/**
 * Tier 2 snapshot insert + read. Snapshot inserts are idempotent on
 * `(host_id, ts)`. The latest read joins host inventory columns
 * (timezone / dns) into the returned snapshot.
 */
export interface Tier2Repository {
	/** Insert a new tier 2 snapshot; returns true on insert, false on duplicate. */
	insertSnapshot(hostId: string, payload: Tier2Payload): Promise<boolean>;
	/** Latest snapshot for a host, or null. */
	getLatestForHost(hostId: string): Promise<Tier2Snapshot | null>;
}
/**
 * CLI token CRUD + token verification. Tokens are stored as SHA-256
 * hashes; pure helpers for plaintext generation and hashing live in
 * `domain/cli-token.ts`.
 */
export interface CliTokensRepository {
	create(tokenHash: string, label: string, scope: CliTokenScope): Promise<CliTokenRow>;
	list(): Promise<CliTokenRow[]>;
	delete(id: number): Promise<boolean>;
	/**
	 * Look up a token by hash. On hit, also bumps `last_used_at` to the
	 * current unixepoch. Returns null on miss.
	 */
	findByHashAndTouch(tokenHash: string): Promise<CliTokenRow | null>;
}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface AggregationRepository {}

export interface Repositories {
	hosts: HostsRepository;
	metrics: MetricsRepository;
	alerts: AlertsRepository;
	events: EventsRepository;
	webhooks: WebhooksRepository;
	ports: PortAllowlistRepository;
	tags: TagsRepository;
	settings: SettingsRepository;
	maintenance: MaintenanceRepository;
	agents: AgentsRepository;
	assets: AssetsRepository;
	bindings: BindingsRepository;
	tier2: Tier2Repository;
	cliTokens: CliTokensRepository;
	aggregation: AggregationRepository;
}
