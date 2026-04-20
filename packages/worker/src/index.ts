import { Hono } from "hono";
import { accessAuth } from "./middleware/access-auth.js";
import { apiKeyAuth } from "./middleware/api-key.js";
import { entryControl } from "./middleware/entry-control.js";
import { alertsListRoute } from "./routes/alerts.js";
import {
	allowedPortsAllRoute,
	hostAllowedPortsAddRoute,
	hostAllowedPortsListRoute,
	hostAllowedPortsRemoveRoute,
} from "./routes/allowed-ports.js";
import { eventsIngestRoute } from "./routes/events-ingest.js";
import { eventsListRoute } from "./routes/events-list.js";
import { fleetStatusRoute } from "./routes/fleet-status.js";
import { hostDetailRoute } from "./routes/host-detail.js";
import { hostsListRoute } from "./routes/hosts.js";
import { identityRoute } from "./routes/identity.js";
import { ingestRoute } from "./routes/ingest.js";
import { liveRoute } from "./routes/live.js";
import {
	maintenanceDeleteRoute,
	maintenanceGetRoute,
	maintenanceSetRoute,
} from "./routes/maintenance.js";
import { hostMetricsRoute } from "./routes/metrics.js";
import {
	monitoringAlertsRoute,
	monitoringGroupsRoute,
	monitoringHostDetailRoute,
	monitoringHostsRoute,
} from "./routes/monitoring.js";
import {
	hostTagsAddRoute,
	hostTagsListRoute,
	hostTagsRemoveRoute,
	hostTagsReplaceRoute,
	tagsByHostsRoute,
	tagsCreateRoute,
	tagsDeleteRoute,
	tagsListRoute,
	tagsUpdateRoute,
} from "./routes/tags.js";
import { tier2IngestRoute } from "./routes/tier2-ingest.js";
import { hostTier2Route } from "./routes/tier2-read.js";
import {
	webhooksCreateRoute,
	webhooksDeleteRoute,
	webhooksListRoute,
	webhooksRegenerateRoute,
} from "./routes/webhooks.js";
import { aggregateHour, purgeOldData } from "./services/aggregation.js";
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

// Global middleware chain:
// 1. entryControl: route requests based on hostname (whitelist machine routes)
// 2. accessAuth: verify Access JWT for browser endpoint
// 3. apiKeyAuth: verify API key (with Access JWT bypass for browser reads/writes)
app.use("*", entryControl);
app.use("/api/*", accessAuth);
app.use("/api/*", apiKeyAuth);

// Root health check
app.get("/", (c) => c.text("bat ok"));

// Public routes (no auth)
app.get("/api/live", liveRoute);

// Write routes (probe → worker)
app.post("/api/identity", identityRoute);
app.post("/api/ingest", ingestRoute);
app.post("/api/tier2", tier2IngestRoute);
app.post("/api/events", eventsIngestRoute);

// Read routes (dashboard → worker)
app.get("/api/hosts", hostsListRoute);
app.get("/api/hosts/:id/metrics", hostMetricsRoute);
app.get("/api/hosts/:id/tier2", hostTier2Route);
app.get("/api/hosts/:id/maintenance", maintenanceGetRoute);
app.put("/api/hosts/:id/maintenance", maintenanceSetRoute);
app.delete("/api/hosts/:id/maintenance", maintenanceDeleteRoute);
app.delete("/api/hosts/:id/tags/:tagId", hostTagsRemoveRoute);
app.get("/api/hosts/:id/tags", hostTagsListRoute);
app.post("/api/hosts/:id/tags", hostTagsAddRoute);
app.put("/api/hosts/:id/tags", hostTagsReplaceRoute);
app.delete("/api/hosts/:id/allowed-ports/:port", hostAllowedPortsRemoveRoute);
app.get("/api/hosts/:id/allowed-ports", hostAllowedPortsListRoute);
app.post("/api/hosts/:id/allowed-ports", hostAllowedPortsAddRoute);
app.get("/api/hosts/:id", hostDetailRoute);
app.get("/api/alerts", alertsListRoute);
app.get("/api/events", eventsListRoute);
app.get("/api/fleet/status", fleetStatusRoute);
app.get("/api/tags/by-hosts", tagsByHostsRoute);
app.get("/api/tags", tagsListRoute);
app.post("/api/tags", tagsCreateRoute);
app.put("/api/tags/:id", tagsUpdateRoute);
app.delete("/api/tags/:id", tagsDeleteRoute);
app.get("/api/allowed-ports", allowedPortsAllRoute);

// Monitoring routes (Uptime Kuma integration — read key)
app.get("/api/monitoring/hosts/:id", monitoringHostDetailRoute);
app.get("/api/monitoring/hosts", monitoringHostsRoute);
app.get("/api/monitoring/groups", monitoringGroupsRoute);
app.get("/api/monitoring/alerts", monitoringAlertsRoute);
app.get("/api/webhooks", webhooksListRoute);
app.post("/api/webhooks", webhooksCreateRoute);
app.delete("/api/webhooks/:id", webhooksDeleteRoute);
app.post("/api/webhooks/:id/regenerate", webhooksRegenerateRoute);

export default {
	fetch: app.fetch,
	async scheduled(_event: ScheduledEvent, env: AppEnv["Bindings"], _ctx: ExecutionContext) {
		const hourTs = Math.floor(Date.now() / 3600000) * 3600 - 3600;
		await aggregateHour(env.DB, hourTs);
		await purgeOldData(env.DB, Math.floor(Date.now() / 1000));
	},
};

// Export app for testing
export { app };
