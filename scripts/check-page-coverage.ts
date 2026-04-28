/**
 * L3 page coverage gate.
 *
 * Statically extract every <Route path="..."> declared in packages/ui/src/App.tsx
 * and every page.goto("...") from packages/ui/tests/*.spec.ts. Fail if any declared
 * page is not visited by at least one Playwright spec.
 *
 * Like the L2 gate, this is structural: it only proves the page is reached.
 * Per-page assertion quality is the spec author's job.
 *
 * Run: `bun run scripts/check-page-coverage.ts`
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP_TSX = join(ROOT, "packages/ui/src/App.tsx");
const TESTS_DIR = join(ROOT, "packages/ui/tests");

type Page = { path: string };

// ---------------------------------------------------------------------------
// 1. Discover declared client routes from App.tsx
// ---------------------------------------------------------------------------

function discoverClientRoutes(): Page[] {
	const src = readFileSync(APP_TSX, "utf-8");
	const pages: Page[] = [];

	// Match: <Route path="/..." ...> or <Route path="..." ...>
	const re = /<Route\s+[^>]*path=["']([^"']+)["']/g;
	for (const m of src.matchAll(re)) {
		const path = m[1];
		if (path && path !== "/") {
			// Skip the redirect route
			pages.push({ path });
		}
	}
	return pages;
}

// ---------------------------------------------------------------------------
// 2. Discover Playwright targets from packages/ui/tests/*.spec.ts
// ---------------------------------------------------------------------------

function discoverPlaywrightTargets(): string[] {
	const files = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".spec.ts"));
	const targets: string[] = [];

	for (const file of files) {
		const src = readFileSync(join(TESTS_DIR, file), "utf-8");

		// Pattern 1: page.goto("/...")
		const gotoRe = /page\.goto\(\s*["'`]([^"'`]+)["'`]/g;
		for (const m of src.matchAll(gotoRe)) {
			const path = m[1];
			if (path) {
				const normalised = normalisePath(path);
				if (normalised) {
					targets.push(normalised);
				}
			}
		}

		// Pattern 2: Any "/..." string literal that looks like a route
		const literalRe = /["'`](\/[a-zA-Z0-9_\-/:]+)["'`]/g;
		for (const m of src.matchAll(literalRe)) {
			const path = m[1];
			if (path && !path.startsWith("/api/")) {
				const normalised = normalisePath(path);
				if (normalised) {
					targets.push(normalised);
				}
			}
		}

		// Pattern 3: toHaveURL regex patterns
		const hasURLRe = /toHaveURL\(\s*\/((?:\\\/|[^/\\])+)\//g;
		for (const m of src.matchAll(hasURLRe)) {
			const reSrc = m[1];
			if (!reSrc) {
				continue;
			}
			const literal = reSrc
				.replace(/\\\//g, "/")
				.replace(/\[[^\]]+\][+*?]?/g, "x")
				.replace(/\(\?:[^)]+\)[+*?]?/g, "x")
				.replace(/[\^$]/g, "");
			if (literal.startsWith("/")) {
				targets.push(literal);
			}
		}
	}
	return targets;
}

function normalisePath(path: string): string {
	// Replace template literals like ${id} with "x" and strip query/hash
	return path.replace(/\$\{[^}]+\}/g, "x").split(/[?#]/)[0] ?? "";
}

// ---------------------------------------------------------------------------
// 3. Match
// ---------------------------------------------------------------------------

function routeToRegex(path: string): RegExp {
	const escaped = path
		.split("/")
		.map((seg) => {
			if (seg.startsWith(":")) {
				return "[^/]+";
			}
			return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		})
		.join("/");
	return new RegExp(`^${escaped}$`);
}

function isCovered(page: Page, targets: string[]): boolean {
	const re = routeToRegex(page.path);
	return targets.some((t) => re.test(t));
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------

function main(): void {
	console.info("=== L3 Page Coverage Gate ===\n");

	const pages = discoverClientRoutes();
	const targets = discoverPlaywrightTargets();

	console.info(`Declared pages:     ${pages.length}`);
	console.info(`Playwright targets: ${targets.length}\n`);

	const uncovered = pages.filter((p) => !isCovered(p, targets));

	if (uncovered.length === 0) {
		console.info(`✔ All ${pages.length} pages have at least one Playwright spec.\n`);
		return;
	}

	console.error(`❌ ${uncovered.length} page(s) have NO Playwright coverage:\n`);
	for (const p of uncovered) {
		console.error(`  ${p.path}`);
	}
	console.error("\nAdd a page.goto(...) in packages/ui/tests/ for each uncovered page.\n");
	process.exit(1);
}

main();
