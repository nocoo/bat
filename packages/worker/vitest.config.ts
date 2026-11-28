import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		allowOnly: false,
		passWithNoTests: false,
		globals: true,
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "json-summary", "html"],
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.d.ts",
				"src/**/index.ts",
				"src/**/types.ts",
				"src/test-helpers/**",
			],
			thresholds: {
				lines: 90,
				branches: 85,
				functions: 90,
				statements: 90,
			},
		},
	},
});
