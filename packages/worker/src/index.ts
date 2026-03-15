import { Hono } from "hono";
import type { AppEnv } from "./types.js";
import { apiKeyAuth } from "./middleware/api-key.js";

const app = new Hono<AppEnv>();

// Global middleware
app.use("/api/*", apiKeyAuth);

// Root health check
app.get("/", (c) => c.text("bat-worker ok"));

export default app;
