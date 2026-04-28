import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["test/e2e/**/*.test.ts"],
		testTimeout: 60_000,
		hookTimeout: 120_000,
		// Boot one wrangler dev for the whole run; per-route test files share it.
		globalSetup: ["./test/e2e/global-setup.ts"],
		// Run files sequentially so per-route D1 mutations don't race each other
		// (single shared --persist-to dir). Each file uses file-prefixed host IDs
		// so parallel-safety is not strictly required, but sequential is simpler
		// to reason about and the suite is fast enough as-is.
		fileParallelism: false,
	},
});
