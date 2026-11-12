import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "json-summary", "html"],
			include: ["src/**/*.ts"],
			exclude: ["src/**/*.test.ts", "src/**/*.d.ts", "src/bat.ts"],
			thresholds: {
				lines: 95,
				branches: 95,
				functions: 95,
				statements: 95,
			},
		},
	},
});
