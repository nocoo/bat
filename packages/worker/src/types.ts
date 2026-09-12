// Worker environment bindings

import type { ConnectTokenRow } from "./domain/connect.js";
import type { Repositories } from "./repos/types.js";

export type Bindings = Pick<Cloudflare.Env, "DB" | "BAT_WRITE_KEY" | "BAT_READ_KEY"> &
	Partial<Omit<Cloudflare.Env, "DB" | "BAT_WRITE_KEY" | "BAT_READ_KEY">> & {
		// Cloudflare Access configuration (optional, for browser endpoint)
		CF_ACCESS_TEAM_DOMAIN?: string; // e.g., "hexly.cloudflareaccess.com"
		CF_ACCESS_AUD?: string; // Access Application audience
		// Optional KV namespace for D1 query reduction (cache + sentinels).
		// Absent → all KV-backed paths transparently fall back to D1.
		// "development" / "production" — wrangler.toml sets this. Used to skip
		// the dashboard short-TTL cache in dev/e2e where snapshots assume each
		// request hits the handler.
		CONNECT_TOKEN_KEYS?: string;
		CONNECT_MANAGERS?: string;
		/** Internal execution state, overwritten at the public Worker entry. Never a request header. */
		CONNECT_COORDINATED?: boolean;
	};

// Variables set by middleware, passed through Hono context
export type Variables = {
	// Set by accessAuth middleware when JWT signature is verified
	accessAuthenticated?: boolean;
	accessPrincipal?: string;
	connectToken?: ConnectTokenRow;
	connectRequestId?: string;
	connectOperation?: string;
	connectErrorCode?: string;
	connectAudited?: boolean;
	connectBody?: Record<string, unknown>;
	connectStarted?: number;
	// Set by reposMiddleware on every request — the typed D1 repository bundle.
	// During the C1–C11 refactor, individual repos are populated incrementally;
	// callers should treat missing methods as "this domain hasn't migrated yet".
	repos: Repositories;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
