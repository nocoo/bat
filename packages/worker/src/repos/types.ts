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

// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface HostsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface MetricsRepository {}
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
