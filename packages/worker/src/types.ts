// Worker environment bindings
export type Bindings = {
	DB: D1Database;
	BAT_WRITE_KEY: string;
	BAT_READ_KEY: string;
	// Cloudflare Access configuration (optional, for browser endpoint)
	CF_ACCESS_TEAM_DOMAIN?: string; // e.g., "hexly.cloudflareaccess.com"
	CF_ACCESS_AUD?: string; // Access Application audience
};

// Variables set by middleware, passed through Hono context
export type Variables = {
	// Set by accessAuth middleware when JWT signature is verified
	accessAuthenticated?: boolean;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };
