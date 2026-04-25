import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["test/e2e/**/*.test.ts"],
		testTimeout: 60_000,
		hookTimeout: 120_000,
	},
});
