// D1 adapter bundle factory. Returns a `Repositories` instance backed by
// the worker's D1 binding. Each repo's concrete adapter lands in its own
// atomic commit (C2–C11); slots not yet migrated remain frozen empty
// objects so the wiring is stable across commits.

import type { AggregationRepository, MetricsRepository, Repositories } from "../../repos/types.js";
import { D1AgentsRepository } from "./agents.js";
import { D1AlertsRepository } from "./alerts.js";
import { D1PortAllowlistRepository } from "./allowed-ports.js";
import { D1AssetsRepository } from "./assets.js";
import { D1BindingsRepository } from "./bindings.js";
import { D1CliTokensRepository } from "./cli-tokens.js";
import { D1EventsRepository } from "./events.js";
import { D1HostsRepository } from "./hosts.js";
import { D1MaintenanceRepository } from "./maintenance.js";
import { D1SettingsRepository } from "./settings.js";
import { D1TagsRepository } from "./tags.js";
import { D1Tier2Repository } from "./tier2.js";
import { D1WebhooksRepository } from "./webhooks.js";

const EMPTY_METRICS: MetricsRepository = Object.freeze({});
const EMPTY_AGGREGATION: AggregationRepository = Object.freeze({});

/**
 * Build the D1-backed `Repositories` bundle. Adapter constructors are
 * cheap (just store the db reference); per-request instantiation is fine
 * and avoids any global-state cache.
 */
export function createD1Repositories(db: D1Database): Repositories {
	return {
		hosts: new D1HostsRepository(db),
		metrics: EMPTY_METRICS,
		alerts: new D1AlertsRepository(db),
		events: new D1EventsRepository(db),
		webhooks: new D1WebhooksRepository(db),
		ports: new D1PortAllowlistRepository(db),
		tags: new D1TagsRepository(db),
		settings: new D1SettingsRepository(db),
		maintenance: new D1MaintenanceRepository(db),
		agents: new D1AgentsRepository(db),
		assets: new D1AssetsRepository(db),
		bindings: new D1BindingsRepository(db),
		tier2: new D1Tier2Repository(db),
		cliTokens: new D1CliTokensRepository(db),
		aggregation: EMPTY_AGGREGATION,
	};
}
