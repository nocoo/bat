/**
 * L2 route coverage gate.
 *
 * Statically extract every `(method, path)` declared in packages/worker/src/index.ts,
 * then statically extract every HTTP request made from packages/worker/test/e2e/*.test.ts.
 * Fail if any declared route is not exercised by at least one E2E test.
 *
 * This is a **structural** gate, not behavioural — it only verifies that the
 * route is hit at all. Per-route assertion quality is still the test author's
 * job. But it catches the "we added a new endpoint and forgot to E2E it" miss.
 *
 * Run: `bun run scripts/check-route-coverage.ts`
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_INDEX = join(ROOT, "packages/worker/src/index.ts");
const E2E_DIR = join(ROOT, "packages/worker/test/e2e");

type RouteMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
type Route = { method: RouteMethod; path: string };

// ---------------------------------------------------------------------------
// 1. Discover declared routes from packages/worker/src/index.ts
// ---------------------------------------------------------------------------

function discoverDeclaredRoutes(): Route[] {
	const src = readFileSync(WORKER_INDEX, "utf-8");
	const routes: Route[] = [];

	// Match: app.get("/api/x", ...) / app.post("/api/x", ...) etc.
	// Only include /api/* routes (skip internal health checks like "/")
	const re = /\bapp\.(get|post|put|delete|patch|head)\(\s*["']([^"']+)["']/g;
	for (const m of src.matchAll(re)) {
		const method = m[1];
		const path = m[2];
		if (method && path && path.startsWith("/api/")) {
			routes.push({ method: method.toUpperCase() as RouteMethod, path });
		}
	}
	return routes;
}

// ---------------------------------------------------------------------------
// 2. Discover exercised routes from packages/worker/test/e2e/*.test.ts
// ---------------------------------------------------------------------------

const HELPER_TO_METHOD: Record<string, RouteMethod> = {
	get: "GET",
	post: "POST",
	put: "PUT",
	delete: "DELETE",
	patch: "PATCH",
	head: "HEAD",
};

function discoverE2ERequests(): Route[] {
	const files = readdirSync(E2E_DIR).filter((f) => f.endsWith(".test.ts"));
	const requests: Route[] = [];

	for (const file of files) {
		const src = readFileSync(join(E2E_DIR, file), "utf-8");

		// Pattern 1: fetch(`${BASE}/api/x`, { method: "POST" })
		const fetchRe =
			/fetch\(\s*[`"'][^`"']*?(\/api\/[^`"'?]+)[^`"']*?[`"']\s*(?:,\s*\{([^}]*)\})?/gs;
		for (const m of src.matchAll(fetchRe)) {
			const rawPath = m[1];
			const opts = m[2] ?? "";
			if (!rawPath) {
				continue;
			}

			const methodMatch = opts.match(/method:\s*["'`](\w+)["'`]/);
			const method = (methodMatch ? methodMatch[1].toUpperCase() : "GET") as RouteMethod;
			requests.push({ method, path: normaliseRequestPath(rawPath) });
		}

		// Pattern 2: Direct helper calls like get("/api/x") or post("/api/x")
		const helperRe = /\b(get|post|put|delete|patch|head)\(\s*[`"']([^`"']+)[`"']/g;
		for (const m of src.matchAll(helperRe)) {
			const helper = m[1];
			const rawPath = m[2];
			if (!(helper && rawPath)) {
				continue;
			}
			const method = HELPER_TO_METHOD[helper];
			if (!method) {
				continue;
			}
			if (!rawPath.startsWith("/api/")) {
				continue;
			}
			requests.push({ method, path: normaliseRequestPath(rawPath) });
		}

		// Pattern 3: BASE + "/api/x" concatenation
		const concatRe = /\$\{BASE\}\s*\+?\s*[`"'](\/api\/[^`"'?]+)[`"']/g;
		for (const m of src.matchAll(concatRe)) {
			const rawPath = m[1];
			if (!rawPath) {
				continue;
			}
			requests.push({ method: "GET", path: normaliseRequestPath(rawPath) });
		}
	}
	return requests;
}

// ---------------------------------------------------------------------------
// 3. Match E2E requests against declared routes
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

function normaliseRequestPath(path: string): string {
	// Replace template literals like ${id} with "x"
	return path.replace(/\$\{[^}]+\}/g, "x");
}

function isMatch(route: Route, request: Route): boolean {
	// Hono dispatches HEAD requests to GET handlers
	const methodOk =
		route.method === request.method || (route.method === "GET" && request.method === "HEAD");
	if (!methodOk) {
		return false;
	}
	const re = routeToRegex(route.path);
	return re.test(request.path);
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------

function main(): void {
	console.info("=== L2 Route Coverage Gate ===\n");

	const declared = discoverDeclaredRoutes();
	const requests = discoverE2ERequests();

	console.info(`Declared routes: ${declared.length}`);
	console.info(`E2E requests:    ${requests.length}\n`);

	const uncovered: Route[] = [];
	for (const route of declared) {
		const hit = requests.some((req) => isMatch(route, req));
		if (!hit) {
			uncovered.push(route);
		}
	}

	if (uncovered.length === 0) {
		console.info(`✔ All ${declared.length} routes have at least one E2E request.\n`);
		return;
	}

	console.error(`❌ ${uncovered.length} route(s) have NO E2E coverage:\n`);
	for (const r of uncovered) {
		console.error(`  ${r.method.padEnd(6)} ${r.path}`);
	}
	console.error("\nAdd a request in packages/worker/test/e2e/ for each uncovered route.\n");
	process.exit(1);
}

main();
