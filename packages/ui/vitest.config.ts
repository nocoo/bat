import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		allowOnly: false,
		passWithNoTests: false,
		globals: true,
		environment: "happy-dom",
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "json-summary", "html"],
			include: ["src/lib/**/*.ts", "src/hooks/**/*.ts", "src/api.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.d.ts",
				"src/**/index.ts",
				"src/**/types.ts",
				"src/components/**",
				"src/views/**",
				"src/pages/**",
				"src/routes/**",
				"src/App.tsx",
				"src/main.tsx",
			],
			// What's covered by THIS suite (UT):
			//   - src/lib/**     pure logic helpers (formatters, transforms, palettes…)
			//   - src/hooks/**   SWR query wrappers + small React hooks
			//   - src/api.ts     fetch wrapper
			//
			// What's intentionally NOT covered here:
			//   - src/components/**, src/routes/**, src/App.tsx, src/main.tsx
			//     React UI shells. Behavior is asserted by the Playwright L4
			//     suite in tests/playwright/, which exercises real browser
			//     flows against a local Wrangler. Adding a parallel jsdom UT
			//     pass for them would duplicate L3 without catching new bugs.
			thresholds: {
				lines: 90,
				branches: 85,
				functions: 90,
				statements: 90,
			},
		},
	},
});
