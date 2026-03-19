import { Hono } from "hono";
import { apiKeyAuth } from "./middleware/api-key.js";
import { alertsListRoute } from "./routes/alerts.js";
import { eventsIngestRoute } from "./routes/events-ingest.js";
import { eventsListRoute } from "./routes/events-list.js";
import { hostDetailRoute } from "./routes/host-detail.js";
import { hostsListRoute } from "./routes/hosts.js";
import { identityRoute } from "./routes/identity.js";
import { ingestRoute } from "./routes/ingest.js";
import { liveRoute } from "./routes/live.js";
import { hostMetricsRoute } from "./routes/metrics.js";
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

// Global middleware
app.use("/api/*", apiKeyAuth);

// Root health check
app.get("/", (c) => c.text("bat-worker ok"));

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
app.get("/api/hosts/:id", hostDetailRoute);
app.get("/api/alerts", alertsListRoute);
app.get("/api/events", eventsListRoute);
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
