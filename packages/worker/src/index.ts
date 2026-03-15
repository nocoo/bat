import { Hono } from "hono";
import { apiKeyAuth } from "./middleware/api-key.js";
import type { AppEnv } from "./types.js";

const app = new Hono<AppEnv>();

// Global middleware
app.use("/api/*", apiKeyAuth);

// Root health check
app.get("/", (c) => c.text("bat-worker ok"));

export default app;
