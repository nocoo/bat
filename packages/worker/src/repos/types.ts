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

import type { RetentionDays, WebhookConfigRow } from "@bat/shared";

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

// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface PortAllowlistRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface TagsRepository {}

/** Settings KV-style store. `retention_days` is the only key in use today. */
export interface SettingsRepository {
	/** Read retention_days. Returns DEFAULT_RETENTION_DAYS on missing/bad/error. */
	getRetentionDays(): Promise<RetentionDays>;
	/** Upsert retention_days. */
	setRetentionDays(value: RetentionDays): Promise<void>;
}

// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface MaintenanceRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface AgentsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface AssetsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface BindingsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface Tier2Repository {}
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
