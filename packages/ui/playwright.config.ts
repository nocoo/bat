import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for BAT UI L3 E2E tests.
 *
 * Port convention:
 *   - 7025: UI vite dev server
 *   - 37025: worker wrangler dev
 *   - 17025: L2 Worker E2E tests
 *   - 27025: L3 Playwright tests (this config)
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
	reporter: process.env.CI
		? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }]]
		: "list",
	timeout: 30_000,
	expect: {
		timeout: 5_000,
	},

	use: {
		baseURL: "http://localhost:27025",
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
		// Seed D1 + start wrangler on :27025 (separate persist dir from L2).
		// I/O goes to a file via l3-webserver.sh — do not pipe wrangler through
		// Playwright (workerd EPIPE crash: cloudflare/workers-sdk#15202).
		command: "bash ../../scripts/l3-webserver.sh",
		url: "http://localhost:27025/api/live",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		stdout: "ignore",
		stderr: "ignore",
	},
});
