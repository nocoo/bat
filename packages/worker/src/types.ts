// Worker environment bindings
import type { Repositories } from "./repos/types.js";

export type Bindings = {
	DB: D1Database;
	BAT_WRITE_KEY: string;
	BAT_READ_KEY: string;
	// Cloudflare Access configuration (optional, for browser endpoint)
	CF_ACCESS_TEAM_DOMAIN?: string; // e.g., "hexly.cloudflareaccess.com"
	CF_ACCESS_AUD?: string; // Access Application audience
	// Optional KV namespace for D1 query reduction (cache + sentinels).
	// Absent → all KV-backed paths transparently fall back to D1.
	BAT_KV?: KVNamespace;
};

// Variables set by middleware, passed through Hono context
export type Variables = {
	// Set by accessAuth middleware when JWT signature is verified
	accessAuthenticated?: boolean;
	// Set by reposMiddleware on every request — the typed D1 repository bundle.
	// During the C1–C11 refactor, individual repos are populated incrementally;
	// callers should treat missing methods as "this domain hasn't migrated yet".
	repos: Repositories;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
