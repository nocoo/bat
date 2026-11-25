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
			exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/**/index.ts", "src/**/types.ts"],
			thresholds: {
				lines: 80,
				branches: 80,
				functions: 80,
				statements: 80,
			},
		},
	},
});
