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
			"E2E_SKIP_AUTH=1 AUTH_SECRET=e2e-secret BAT_API_URL=https://bat-ingest-test.worker.hexly.ai next dev --port 28787",
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
