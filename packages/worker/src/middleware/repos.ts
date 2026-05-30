// Per-request `Repositories` factory middleware.
//
// Mounted before any domain middleware (api-key, access-auth) so that
// downstream middleware and route handlers can read `c.var.repos`
// without ever touching `c.env.DB` directly. See
// docs/20-d1-to-kv-migration.md v6 §4.

import type { MiddlewareHandler } from "hono";
import { createD1Repositories } from "../adapters/d1/factory.js";
import type { AppEnv } from "../types.js";

export const reposMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
	c.set("repos", createD1Repositories(c.env.DB));
	await next();
};
