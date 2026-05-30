// D1 adapter bundle factory. Returns a `Repositories` instance backed by
// the worker's D1 binding. Each repo's concrete adapter lands in its own
// atomic commit (C2–C11); slots not yet migrated remain frozen empty
// objects so the wiring is stable across commits.

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
	TagsRepository,
	Tier2Repository,
} from "../../repos/types.js";
import { D1SettingsRepository } from "./settings.js";
import { D1WebhooksRepository } from "./webhooks.js";

const EMPTY_HOSTS: HostsRepository = Object.freeze({});
const EMPTY_METRICS: MetricsRepository = Object.freeze({});
const EMPTY_ALERTS: AlertsRepository = Object.freeze({});
const EMPTY_EVENTS: EventsRepository = Object.freeze({});
const EMPTY_PORTS: PortAllowlistRepository = Object.freeze({});
const EMPTY_TAGS: TagsRepository = Object.freeze({});
const EMPTY_MAINTENANCE: MaintenanceRepository = Object.freeze({});
const EMPTY_AGENTS: AgentsRepository = Object.freeze({});
const EMPTY_ASSETS: AssetsRepository = Object.freeze({});
const EMPTY_BINDINGS: BindingsRepository = Object.freeze({});
const EMPTY_TIER2: Tier2Repository = Object.freeze({});
const EMPTY_CLI_TOKENS: CliTokensRepository = Object.freeze({});
const EMPTY_AGGREGATION: AggregationRepository = Object.freeze({});

/**
 * Build the D1-backed `Repositories` bundle. Adapter constructors are
 * cheap (just store the db reference); per-request instantiation is fine
 * and avoids any global-state cache.
 */
export function createD1Repositories(db: D1Database): Repositories {
	return {
		hosts: EMPTY_HOSTS,
		metrics: EMPTY_METRICS,
		alerts: EMPTY_ALERTS,
		events: EMPTY_EVENTS,
		webhooks: new D1WebhooksRepository(db),
		ports: EMPTY_PORTS,
		tags: EMPTY_TAGS,
		settings: new D1SettingsRepository(db),
		maintenance: EMPTY_MAINTENANCE,
		agents: EMPTY_AGENTS,
		assets: EMPTY_ASSETS,
		bindings: EMPTY_BINDINGS,
		tier2: EMPTY_TIER2,
		cliTokens: EMPTY_CLI_TOKENS,
		aggregation: EMPTY_AGGREGATION,
	};
}
