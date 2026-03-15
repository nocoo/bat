import { Hono } from "hono";
import { apiKeyAuth } from "./middleware/api-key.js";
import { identityRoute } from "./routes/identity.js";
import { ingestRoute } from "./routes/ingest.js";
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

// Global middleware
app.use("/api/*", apiKeyAuth);

// Root health check
app.get("/", (c) => c.text("bat-worker ok"));

// Write routes (probe → worker)
app.post("/api/identity", identityRoute);
app.post("/api/ingest", ingestRoute);

export default app;
