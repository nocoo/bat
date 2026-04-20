// Worker environment bindings
export type Bindings = {
	DB: D1Database;
	BAT_WRITE_KEY: string;
	BAT_READ_KEY: string;
	// Cloudflare Access configuration (optional, for browser endpoint)
	CF_ACCESS_TEAM_DOMAIN?: string; // e.g., "hexly.cloudflareaccess.com"
	CF_ACCESS_AUD?: string; // Access Application audience
};

export type AppEnv = { Bindings: Bindings };
