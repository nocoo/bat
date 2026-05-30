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

// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface HostsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface MetricsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface AlertsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface EventsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface WebhooksRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface PortAllowlistRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface TagsRepository {}
// biome-ignore lint/suspicious/noEmptyInterface: methods land in their own atomic commits
export interface SettingsRepository {}
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
