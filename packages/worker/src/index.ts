import { Hono } from "hono";
import { createD1Repositories } from "./adapters/d1/factory.js";
import { isConnectPath, isVersionedPath } from "./domain/connect.js";
import { errorCategory } from "./lib/error-category.js";
import { accessAuth } from "./middleware/access-auth.js";
import { apiKeyAuth } from "./middleware/api-key.js";
import {
	connectBearer,
	connectEnvelope,
	connectError,
	connectManager,
} from "./middleware/connect.js";
import { entryControl } from "./middleware/entry-control.js";
import { reposMiddleware } from "./middleware/repos.js";
import {
	agentsCreateRoute,
	agentsDeleteRoute,
	agentsGetRoute,
	agentsListRoute,
	agentsTagsReplaceRoute,
	agentsUpdateRoute,
} from "./routes/agents.js";
import { alertsListRoute } from "./routes/alerts.js";
import {
	allowedPortsAllRoute,
	hostAllowedPortsAddRoute,
	hostAllowedPortsListRoute,
	hostAllowedPortsRemoveRoute,
} from "./routes/allowed-ports.js";
import {
	assetsCreateRoute,
	assetsDeleteRoute,
	assetsGetRoute,
	assetsListRoute,
	assetsTagsReplaceRoute,
	assetsUpdateRoute,
} from "./routes/assets.js";
import {
	assetsMapRoute,
	assetsOverviewRoute,
	bindingsCreateRoute,
	bindingsDeleteRoute,
	bindingsListRoute,
} from "./routes/bindings.js";
import { cliAuthBridgeRoute, cliAuthRoute } from "./routes/cli-auth.js";
import { cliTokensDeleteRoute, cliTokensListRoute } from "./routes/cli-tokens.js";
import { registerConnectApi } from "./routes/connect-api.js";
import {
	connectAuditRoute,
	connectServersRoute,
	connectTokenChallengeRoute,
	connectTokenRenameRoute,
	connectTokenRevealRoute,
	connectTokenRevokeRoute,
	connectTokenRotateRoute,
	connectTokensCreateRoute,
	connectTokensListRoute,
} from "./routes/connect-management.js";
import { eventsIngestRoute } from "./routes/events-ingest.js";
import { eventsListRoute } from "./routes/events-list.js";
import { fleetStatusRoute } from "./routes/fleet-status.js";
import { agentsHeartbeatRoute } from "./routes/heartbeat.js";
import { hostDescriptionPatchRoute } from "./routes/host-description.js";
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
import { meRoute } from "./routes/me.js";
import { hostMetricsRoute } from "./routes/metrics.js";
import {
	monitoringAlertsRoute,
	monitoringGroupsRoute,
	monitoringHostDetailRoute,
	monitoringHostsRoute,
} from "./routes/monitoring.js";
import { settingsGetRoute, settingsPutRoute } from "./routes/settings.js";
import { setupRoute } from "./routes/setup.js";
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
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

// Global middleware chain:
// 0. reposMiddleware: build per-request `c.var.repos` D1 adapter bundle
// 1. entryControl: route requests based on hostname (whitelist machine routes)
// 2. accessAuth: verify Access JWT for browser endpoint
// 3. apiKeyAuth: verify API key (with Access JWT bypass for browser reads/writes)
app.use("*", reposMiddleware);
app.use("*", async (c, next) => {
	await next();
	if (!c.req.path.startsWith("/api/") && c.res.headers.get("Content-Type")?.includes("text/html")) {
		c.header("Cache-Control", "no-store, private");
		c.header(
			"Content-Security-Policy",
			"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
		);
		c.header("Referrer-Policy", "no-referrer");
		c.header("X-Frame-Options", "DENY");
		c.header("X-Content-Type-Options", "nosniff");
	}
});
app.use("/api/*", connectEnvelope);
app.use("*", entryControl);
app.use("*", accessAuth);
app.use("/api/*", apiKeyAuth);
app.use("/api/*", (c, next) =>
	isVersionedPath(c.req.path)
		? connectBearer(c, next)
		: isConnectPath(c.req.path)
			? connectManager(c, next)
			: next(),
);

app.onError((error, c) => {
	if (c.env?.ENVIRONMENT === "development") c.header("X-Bat-Diagnostic", errorCategory(error));
	if (isConnectPath(c.req.path)) return connectError(c, error);
	// Never log request bodies, authorization headers or exception SQL bindings.
	return c.json({ error: "Internal server error" }, 500);
});

app.get("/api/connect/servers", connectServersRoute);
app.get("/api/connect/servers/:serverId/tokens", connectTokensListRoute);
app.post("/api/connect/servers/:serverId/tokens", connectTokensCreateRoute);
app.patch("/api/connect/servers/:serverId/tokens/:tokenId", connectTokenRenameRoute);
app.post("/api/connect/servers/:serverId/tokens/:tokenId/challenge", connectTokenChallengeRoute);
app.post("/api/connect/servers/:serverId/tokens/:tokenId/reveal", connectTokenRevealRoute);
app.post("/api/connect/servers/:serverId/tokens/:tokenId/rotate", connectTokenRotateRoute);
app.post("/api/connect/servers/:serverId/tokens/:tokenId/revoke", connectTokenRevokeRoute);
app.get("/api/connect/servers/:serverId/audit", connectAuditRoute);
registerConnectApi(app);

// Root health check
app.get("/", async (c) => (c.env.ASSETS ? c.env.ASSETS.fetch(c.req.raw) : c.text("bat ok")));

// Public routes (no auth)
app.get("/api/live", liveRoute);

// User info route (requires auth via Access JWT or localhost bypass)
app.get("/api/me", meRoute);

// Write routes (probe → worker)
app.post("/api/identity", identityRoute);
app.post("/api/ingest", ingestRoute);
app.post("/api/tier2", tier2IngestRoute);
app.post("/api/events", eventsIngestRoute);

// Read routes (dashboard → worker)
app.get("/api/setup", setupRoute);
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
app.patch("/api/hosts/:id/description", hostDescriptionPatchRoute);
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
app.get("/api/settings", settingsGetRoute);
app.put("/api/settings", settingsPutRoute);

// CLI auth and token management (require CF Access JWT — browser only)
app.get("/api/auth/cli", cliAuthBridgeRoute);
app.post("/api/auth/cli", cliAuthRoute);
app.get("/api/cli-tokens", cliTokensListRoute);
app.delete("/api/cli-tokens/:id", cliTokensDeleteRoute);

// Agent CRUD (CLI token scope: assets)
app.post("/api/agents/heartbeat", agentsHeartbeatRoute);
app.get("/api/agents", agentsListRoute);
app.post("/api/agents", agentsCreateRoute);
app.get("/api/agents/:id", agentsGetRoute);
app.patch("/api/agents/:id", agentsUpdateRoute);
app.delete("/api/agents/:id", agentsDeleteRoute);
app.put("/api/agents/:id/tags", agentsTagsReplaceRoute);

// Asset CRUD (CLI token scope: assets)
// Static routes MUST be before /:id to avoid param capture
app.get("/api/assets/map", assetsMapRoute);
app.get("/api/assets/overview", assetsOverviewRoute);
app.get("/api/assets", assetsListRoute);
app.post("/api/assets", assetsCreateRoute);
app.get("/api/assets/:id", assetsGetRoute);
app.patch("/api/assets/:id", assetsUpdateRoute);
app.delete("/api/assets/:id", assetsDeleteRoute);
app.put("/api/assets/:id/tags", assetsTagsReplaceRoute);

// Binding CRUD (CLI token scope: assets)
app.get("/api/bindings", bindingsListRoute);
app.post("/api/bindings", bindingsCreateRoute);
app.delete("/api/bindings/:agentId/:assetId", bindingsDeleteRoute);

app.get("*", async (c) => {
	if (c.req.path.startsWith("/api/") || !c.env.ASSETS) return c.json({ error: "Not found" }, 404);
	return c.env.ASSETS.fetch(c.req.raw);
});

export default {
	fetch: app.fetch,
	async scheduled(_event: ScheduledController, env: AppEnv["Bindings"], _ctx: ExecutionContext) {
		// Composition root for the cron path: build the per-run repositories
		// bundle and hand it to the aggregation entry point. Cron body never
		// touches `env.DB` directly.
		const repos = createD1Repositories(env.DB);
		const hourTs = Math.floor(Date.now() / 3600000) * 3600 - 3600;
		await repos.aggregation.aggregateHour(hourTs);
		await repos.aggregation.runScheduledMaintenance(Math.floor(Date.now() / 1000));
		await repos.connect.maintenance(Math.floor(Date.now() / 1000));
	},
};

// Export app for testing
export { app };
