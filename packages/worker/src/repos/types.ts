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
	AllowedPort,
	AssetItem,
	AssetMapResponse,
	AssetRow,
	AssetsOverview,
	BindingItem,
	HostTag,
	RetentionDays,
	Tier2Payload,
	Tier2Snapshot,
	WebhookConfigRow,
} from "@bat/shared";

// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface HostsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface MetricsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface AlertsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface EventsRepository {}

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
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface AgentsRepository {}
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
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface CliTokensRepository {}
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
