import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./e2e",
	timeout: 30_000,
	retries: 0,
	use: {
		baseURL: "http://localhost:28787",
		trace: "on-first-retry",
	},
	webServer: {
		command:
			"E2E_SKIP_AUTH=1 AUTH_SECRET=e2e-secret BAT_API_URL=https://bat-ingest-test.worker.hexly.ai BAT_READ_KEY=a765dcf8ed4727d0f26aa753339c26e1b002ee88fcdcfd84e0b0d4055950a632 next dev --port 28787",
		port: 28787,
		timeout: 60_000,
		reuseExistingServer: !process.env.CI,
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
});
