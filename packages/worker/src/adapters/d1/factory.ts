// D1 adapter bundle factory. Returns a `Repositories` instance backed by
// the worker's D1 binding. Each repo's concrete adapter lands in its own
// atomic commit (C2–C11); for now this returns frozen empty objects so
// `c.var.repos` and the scheduled handler can be wired without coupling
// to any single domain refactor.

import type {
	AgentsRepository,
	AggregationRepository,
	AlertsRepository,
	AssetsRepository,
	BindingsRepository,
	CliTokensRepository,
	EventsRepository,
	HostsRepository,
	MaintenanceRepository,
	MetricsRepository,
	PortAllowlistRepository,
	Repositories,
	SettingsRepository,
	TagsRepository,
	Tier2Repository,
	WebhooksRepository,
} from "../../repos/types.js";

const EMPTY_HOSTS: HostsRepository = Object.freeze({});
const EMPTY_METRICS: MetricsRepository = Object.freeze({});
const EMPTY_ALERTS: AlertsRepository = Object.freeze({});
const EMPTY_EVENTS: EventsRepository = Object.freeze({});
const EMPTY_WEBHOOKS: WebhooksRepository = Object.freeze({});
const EMPTY_PORTS: PortAllowlistRepository = Object.freeze({});
const EMPTY_TAGS: TagsRepository = Object.freeze({});
const EMPTY_SETTINGS: SettingsRepository = Object.freeze({});
const EMPTY_MAINTENANCE: MaintenanceRepository = Object.freeze({});
const EMPTY_AGENTS: AgentsRepository = Object.freeze({});
const EMPTY_ASSETS: AssetsRepository = Object.freeze({});
const EMPTY_BINDINGS: BindingsRepository = Object.freeze({});
const EMPTY_TIER2: Tier2Repository = Object.freeze({});
const EMPTY_CLI_TOKENS: CliTokensRepository = Object.freeze({});
const EMPTY_AGGREGATION: AggregationRepository = Object.freeze({});

/**
 * Build the D1-backed `Repositories` bundle.
 *
 * The `db` parameter is currently unused because no concrete adapter has
 * landed yet — keeping it in the signature now means every subsequent
 * commit (C2+) just plugs its adapter in here without changing call sites.
 */
export function createD1Repositories(_db: D1Database): Repositories {
	return {
		hosts: EMPTY_HOSTS,
		metrics: EMPTY_METRICS,
		alerts: EMPTY_ALERTS,
		events: EMPTY_EVENTS,
		webhooks: EMPTY_WEBHOOKS,
		ports: EMPTY_PORTS,
		tags: EMPTY_TAGS,
		settings: EMPTY_SETTINGS,
		maintenance: EMPTY_MAINTENANCE,
		agents: EMPTY_AGENTS,
		assets: EMPTY_ASSETS,
		bindings: EMPTY_BINDINGS,
		tier2: EMPTY_TIER2,
		cliTokens: EMPTY_CLI_TOKENS,
		aggregation: EMPTY_AGGREGATION,
	};
}
