import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for BAT UI L3 E2E tests.
 *
 * Port convention:
 *   - 7025: UI vite dev server
 *   - 8787: worker wrangler dev
 *   - 18787: L2 Worker E2E tests
 *   - 27787: L3 Playwright tests (this config)
 *
 * Auth strategy: Cloudflare Access is external, so localhost bypasses auth.
 * Tests run against local Wrangler where /api/me returns authenticated: false.
 * UI works in "anonymous" mode for E2E.
 */
export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "github" : "list",
	timeout: 30_000,
	expect: {
		timeout: 5_000,
	},

	use: {
		baseURL: "http://localhost:27787",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],

	webServer: {
		// Start local Wrangler serving Worker + static assets on port 27787
		// First apply migrations, then start wrangler
		// Uses a separate persist dir to avoid conflicts with L2 tests
		command:
			"cd ../worker && bash ../../scripts/l3-setup.sh && bunx wrangler dev --port 27787 --local --persist-to .wrangler/e2e-pw",
		url: "http://localhost:27787/api/live",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: "pipe",
		stderr: "pipe",
	},
});
