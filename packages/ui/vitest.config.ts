import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "happy-dom",
		include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			include: ["src/lib/**/*.ts", "src/hooks/**/*.ts", "src/api.ts"],
			exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts", "src/**/index.ts"],
			// What's covered by THIS suite (UT):
			//   - src/lib/**     pure logic helpers (formatters, transforms, palettes…)
			//   - src/hooks/**   SWR query wrappers + small React hooks
			//   - src/api.ts     fetch wrapper
			//
			// What's intentionally NOT covered here:
			//   - src/components/**, src/routes/**, src/App.tsx, src/main.tsx
			//     React UI shells. Behavior is asserted by the Playwright L3
			//     suite in tests/playwright/, which exercises real browser
			//     flows against a local Wrangler. Adding a parallel jsdom UT
			//     pass for them would duplicate L3 without catching new bugs.
			thresholds: {
				lines: 95,
				branches: 90,
				functions: 95,
				statements: 95,
			},
		},
	},
});
