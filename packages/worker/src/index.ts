import { Hono } from "hono";
import { apiKeyAuth } from "./middleware/api-key.js";
import { healthRoute } from "./routes/health.js";
import { hostsListRoute } from "./routes/hosts.js";
import { identityRoute } from "./routes/identity.js";
import { ingestRoute } from "./routes/ingest.js";
import { hostMetricsRoute } from "./routes/metrics.js";
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

// Global middleware
app.use("/api/*", apiKeyAuth);

// Root health check
app.get("/", (c) => c.text("bat-worker ok"));

// Public routes (no auth)
app.get("/api/health", healthRoute);

// Write routes (probe → worker)
app.post("/api/identity", identityRoute);
app.post("/api/ingest", ingestRoute);

// Read routes (dashboard → worker)
app.get("/api/hosts", hostsListRoute);
app.get("/api/hosts/:id/metrics", hostMetricsRoute);

export default app;
