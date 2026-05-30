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

import type { AllowedPort, RetentionDays, WebhookConfigRow } from "@bat/shared";

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
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface TagsRepository {}

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
