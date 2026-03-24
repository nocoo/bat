/**
 * Comprehensive unit tests for src/lib/ and src/hooks/ coverage.
 * Target: ≥90% line coverage across palette, proxy-logic, utils, api, and all SWR hooks.
 */
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// 1. palette.ts — pure functions, all branches
// ---------------------------------------------------------------------------
import {
	BADGE_PALETTE,
	TAG_COLORS,
	chart,
	chartAxis,
	chartMuted,
	getBadgeStyle,
	getBadgeStyleByIndex,
	getTagColor,
} from "./palette";

describe("palette", () => {
	describe("chart constants", () => {
		test("chart object has 10 entries with hsl(var(--chart-N)) format", () => {
			const keys = Object.keys(chart);
			expect(keys).toHaveLength(10);
			for (const [, value] of Object.entries(chart)) {
				expect(value).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
			}
		});

		test("chartAxis and chartMuted are hsl CSS var strings", () => {
			expect(chartAxis).toBe("hsl(var(--chart-axis))");
			expect(chartMuted).toBe("hsl(var(--chart-muted))");
		});
	});

	describe("BADGE_PALETTE", () => {
		test("has 10 entries with bg and label fields", () => {
			expect(BADGE_PALETTE).toHaveLength(10);
			for (const entry of BADGE_PALETTE) {
				expect(entry).toHaveProperty("bg");
				expect(entry).toHaveProperty("label");
				expect(entry.bg).toMatch(/^chart-\d+$/);
				expect(typeof entry.label).toBe("string");
			}
		});
	});

	describe("getBadgeStyle", () => {
		test("returns backgroundColor and color with CSS var references", () => {
			const style = getBadgeStyle("test-tag");
			expect(style).toHaveProperty("backgroundColor");
			expect(style).toHaveProperty("color");
			expect(style.backgroundColor).toMatch(/^hsl\(var\(--chart-\d+\) \/ 0\.12\)$/);
			expect(style.color).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
		});

		test("is deterministic — same input always returns same output", () => {
			const a = getBadgeStyle("hello-world");
			const b = getBadgeStyle("hello-world");
			expect(a).toEqual(b);
		});

		test("different inputs can produce different styles", () => {
			const a = getBadgeStyle("aaa");
			const b = getBadgeStyle("zzz");
			expect(typeof a.backgroundColor).toBe("string");
			expect(typeof b.backgroundColor).toBe("string");
		});

		test("handles empty string", () => {
			const style = getBadgeStyle("");
			expect(style.backgroundColor).toMatch(/^hsl\(var\(--chart-\d+\) \/ 0\.12\)$/);
		});

		test("handles Unicode / CJK strings", () => {
			const style = getBadgeStyle("你好世界");
			expect(style.backgroundColor).toMatch(/^hsl\(var\(--chart-\d+\) \/ 0\.12\)$/);
		});
	});

	describe("getBadgeStyleByIndex", () => {
		test("returns correct style for index 0", () => {
			const style = getBadgeStyleByIndex(0);
			expect(style.backgroundColor).toBe("hsl(var(--chart-1) / 0.12)");
			expect(style.color).toBe("hsl(var(--chart-1))");
		});

		test("wraps around for index >= 10", () => {
			const style10 = getBadgeStyleByIndex(10);
			const style0 = getBadgeStyleByIndex(0);
			expect(style10).toEqual(style0);
		});

		test("handles negative indices correctly", () => {
			const styleNeg1 = getBadgeStyleByIndex(-1);
			const style9 = getBadgeStyleByIndex(9);
			expect(styleNeg1).toEqual(style9);
		});

		test("handles large negative indices", () => {
			const style = getBadgeStyleByIndex(-15);
			expect(style.backgroundColor).toMatch(/^hsl\(var\(--chart-\d+\) \/ 0\.12\)$/);
		});

		test("returns correct style for each index 0-9", () => {
			for (let i = 0; i < 10; i++) {
				const style = getBadgeStyleByIndex(i);
				const expected = BADGE_PALETTE[i]?.bg;
				expect(style.backgroundColor).toBe(`hsl(var(--${expected}) / 0.12)`);
				expect(style.color).toBe(`hsl(var(--${expected}))`);
			}
		});
	});

	describe("TAG_COLORS (deprecated)", () => {
		test("has 10 entries", () => {
			expect(TAG_COLORS).toHaveLength(10);
		});

		test("each entry is an hsl CSS var string", () => {
			for (const color of TAG_COLORS) {
				expect(color).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
			}
		});
	});

	describe("getTagColor (deprecated)", () => {
		test("returns correct color for index 0", () => {
			expect(getTagColor(0)).toBe("hsl(var(--chart-1))");
		});

		test("wraps around for index >= 10", () => {
			expect(getTagColor(10)).toBe(getTagColor(0));
			expect(getTagColor(11)).toBe(getTagColor(1));
		});

		test("handles negative indices", () => {
			expect(getTagColor(-1)).toBe(getTagColor(9));
			expect(getTagColor(-10)).toBe(getTagColor(0));
		});

		test("handles large positive indices", () => {
			const color = getTagColor(999);
			expect(color).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
		});
	});
});

// ---------------------------------------------------------------------------
// 2. utils.ts — pure functions, all branches
// ---------------------------------------------------------------------------
import { cn, getAvatarColor, hashString } from "./utils";

describe("utils", () => {
	describe("cn", () => {
		test("merges class names", () => {
			expect(cn("foo", "bar")).toBe("foo bar");
		});

		test("handles falsy classes", () => {
			expect(cn("base", undefined, "visible")).toBe("base visible");
		});

		test("deduplicates tailwind classes via twMerge", () => {
			const result = cn("p-4", "p-2");
			expect(result).toBe("p-2");
		});

		test("handles empty inputs", () => {
			expect(cn()).toBe("");
		});

		test("handles undefined and null", () => {
			expect(cn(undefined, null, "real")).toBe("real");
		});
	});

	describe("hashString", () => {
		test("returns a non-negative number", () => {
			expect(hashString("test")).toBeGreaterThanOrEqual(0);
		});

		test("is deterministic", () => {
			expect(hashString("hello")).toBe(hashString("hello"));
		});

		test("different strings produce different hashes (usually)", () => {
			expect(hashString("aaa")).not.toBe(hashString("bbb"));
		});

		test("handles empty string", () => {
			expect(hashString("")).toBe(0);
		});

		test("handles CJK / Unicode strings", () => {
			const hash = hashString("你好世界");
			expect(hash).toBeGreaterThanOrEqual(0);
			expect(Number.isInteger(hash)).toBe(true);
		});

		test("handles very long strings", () => {
			const long = "a".repeat(10000);
			const hash = hashString(long);
			expect(hash).toBeGreaterThanOrEqual(0);
		});
	});

	describe("getAvatarColor", () => {
		test("returns a string starting with bg-", () => {
			expect(getAvatarColor("Alice")).toMatch(/^bg-/);
		});

		test("is deterministic — same name gives same color", () => {
			expect(getAvatarColor("Bob")).toBe(getAvatarColor("Bob"));
		});

		test("handles empty string", () => {
			const color = getAvatarColor("");
			expect(color).toMatch(/^bg-/);
		});

		test("handles Unicode names", () => {
			const color = getAvatarColor("张三");
			expect(color).toMatch(/^bg-/);
		});

		test("different names can produce different colors", () => {
			const colors = new Set(["Alice", "Bob", "Charlie", "Dave", "Eve"].map(getAvatarColor));
			expect(colors.size).toBeGreaterThanOrEqual(2);
		});
	});
});

// ---------------------------------------------------------------------------
// 3. proxy-logic.ts — all branches including proxyToWorkerWithBody
// ---------------------------------------------------------------------------
import { proxyToWorker, proxyToWorkerWithBody } from "./proxy-logic";

describe("proxyToWorkerWithBody", () => {
	const originalEnv = { ...process.env };
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		process.env.BAT_API_URL = "https://bat.test.workers.dev";
		process.env.BAT_READ_KEY = "test-read-key";
		process.env.BAT_WRITE_KEY = "test-write-key";
	});

	afterEach(() => {
		process.env = { ...originalEnv };
		globalThis.fetch = originalFetch;
		mock.restore();
	});

	test("returns 502 when BAT_API_URL is missing", async () => {
		process.env.BAT_API_URL = undefined;
		const res = await proxyToWorkerWithBody("/api/tags", "POST", '{"name":"test"}');
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("BAT_API_URL");
	});

	test("returns 502 when BAT_READ_KEY is missing (useWriteKey=false)", async () => {
		process.env.BAT_READ_KEY = undefined;
		const res = await proxyToWorkerWithBody("/api/tags", "POST", '{"name":"test"}');
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("BAT_READ_KEY");
	});

	test("returns 502 when BAT_WRITE_KEY is missing (useWriteKey=true)", async () => {
		process.env.BAT_WRITE_KEY = undefined;
		const res = await proxyToWorkerWithBody("/api/tags", "POST", '{"name":"test"}', true);
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("BAT_WRITE_KEY");
	});

	test("uses BAT_READ_KEY by default", async () => {
		let capturedAuth = "";
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		await proxyToWorkerWithBody("/api/tags", "POST", '{"name":"test"}');
		expect(capturedAuth).toBe("Bearer test-read-key");
	});

	test("uses BAT_WRITE_KEY when useWriteKey=true", async () => {
		let capturedAuth = "";
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		await proxyToWorkerWithBody("/api/tags", "POST", '{"name":"test"}', true);
		expect(capturedAuth).toBe("Bearer test-write-key");
	});

	test("sets Content-Type header when body is provided", async () => {
		let capturedHeaders: Record<string, string> = {};
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			capturedHeaders = (init?.headers as Record<string, string>) ?? {};
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		await proxyToWorkerWithBody("/api/tags", "POST", '{"name":"test"}');
		expect(capturedHeaders["Content-Type"]).toBe("application/json");
	});

	test("does NOT set Content-Type header when body is null", async () => {
		let capturedHeaders: Record<string, string> = {};
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			capturedHeaders = (init?.headers as Record<string, string>) ?? {};
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		await proxyToWorkerWithBody("/api/tags", "DELETE", null);
		expect(capturedHeaders["Content-Type"]).toBeUndefined();
	});

	test("does NOT set Content-Type header when body is undefined", async () => {
		let capturedHeaders: Record<string, string> = {};
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			capturedHeaders = (init?.headers as Record<string, string>) ?? {};
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		await proxyToWorkerWithBody("/api/tags", "DELETE");
		expect(capturedHeaders["Content-Type"]).toBeUndefined();
	});

	test("forwards correct method to Worker", async () => {
		let capturedMethod = "";
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			capturedMethod = init?.method ?? "";
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		await proxyToWorkerWithBody("/api/tags/123", "PUT", '{"name":"updated"}');
		expect(capturedMethod).toBe("PUT");
	});

	test("forwards correct URL to Worker", async () => {
		let capturedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			capturedUrl = input.toString();
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		await proxyToWorkerWithBody("/api/tags/123", "DELETE");
		expect(capturedUrl).toBe("https://bat.test.workers.dev/api/tags/123");
	});

	test("passes through Worker response status and body", async () => {
		globalThis.fetch = (async () => {
			return new Response(JSON.stringify({ id: "t1", name: "tag" }), {
				status: 201,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const res = await proxyToWorkerWithBody("/api/tags", "POST", '{"name":"tag"}');
		expect(res.status).toBe(201);
		const body = (await res.json()) as { id: string; name: string };
		expect(body).toEqual({ id: "t1", name: "tag" });
	});

	test("returns 502 when fetch throws", async () => {
		globalThis.fetch = (async () => {
			throw new Error("Network error");
		}) as unknown as typeof fetch;

		const res = await proxyToWorkerWithBody("/api/tags", "POST", "{}");
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Failed to reach Worker API");
	});

	test("response has Cache-Control: no-store header", async () => {
		globalThis.fetch = (async () => {
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as unknown as typeof fetch;

		const res = await proxyToWorkerWithBody("/api/tags", "POST", "{}");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});

	test("falls back to application/json Content-Type when Worker omits it", async () => {
		globalThis.fetch = (async () => {
			return new Response("{}", { status: 200, headers: {} });
		}) as unknown as typeof fetch;

		const res = await proxyToWorkerWithBody("/api/tags", "POST", "{}");
		expect(res.headers.get("Content-Type")).toBe("application/json");
	});
});

// proxyToWorker — all branches (env validation, search params, Content-Type fallback)
describe("proxyToWorker — all branches", () => {
	const originalEnv = { ...process.env };
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		process.env = { ...originalEnv };
		globalThis.fetch = originalFetch;
		mock.restore();
	});

	test("returns 502 when BAT_API_URL is missing", async () => {
		process.env.BAT_API_URL = undefined;
		process.env.BAT_READ_KEY = "key";
		const res = await proxyToWorker("/api/hosts");
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("BAT_API_URL");
	});

	test("returns 502 when BAT_READ_KEY is missing", async () => {
		process.env.BAT_API_URL = "https://worker.test";
		process.env.BAT_READ_KEY = undefined;
		const res = await proxyToWorker("/api/hosts");
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("BAT_READ_KEY");
	});

	test("forwards search params to Worker URL", async () => {
		process.env.BAT_API_URL = "https://bat.test.workers.dev";
		process.env.BAT_READ_KEY = "test-read-key";
		let capturedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			capturedUrl = input.toString();
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		const params = new URLSearchParams({ from: "100", to: "200" });
		await proxyToWorker("/api/hosts/h1/metrics", params);
		expect(capturedUrl).toBe("https://bat.test.workers.dev/api/hosts/h1/metrics?from=100&to=200");
	});

	test("sends correct Authorization header", async () => {
		process.env.BAT_API_URL = "https://bat.test.workers.dev";
		process.env.BAT_READ_KEY = "secret-123";
		let capturedAuth = "";
		globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
			capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? "";
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		await proxyToWorker("/api/hosts");
		expect(capturedAuth).toBe("Bearer secret-123");
	});

	test("falls back to application/json when Worker omits Content-Type", async () => {
		process.env.BAT_API_URL = "https://bat.test.workers.dev";
		process.env.BAT_READ_KEY = "test-read-key";
		globalThis.fetch = (async () => {
			return new Response("{}", { status: 200, headers: {} });
		}) as unknown as typeof fetch;

		const res = await proxyToWorker("/api/hosts");
		expect(res.headers.get("Content-Type")).toBe("application/json");
	});

	test("response has Cache-Control: no-store header", async () => {
		process.env.BAT_API_URL = "https://bat.test.workers.dev";
		process.env.BAT_READ_KEY = "test-read-key";
		globalThis.fetch = (async () => {
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as unknown as typeof fetch;

		const res = await proxyToWorker("/api/hosts");
		expect(res.headers.get("Cache-Control")).toBe("no-store");
	});

	test("returns 502 when fetch throws", async () => {
		process.env.BAT_API_URL = "https://bat.test.workers.dev";
		process.env.BAT_READ_KEY = "test-read-key";
		globalThis.fetch = (async () => {
			throw new Error("Connection refused");
		}) as unknown as typeof fetch;

		const res = await proxyToWorker("/api/hosts");
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("Failed to reach Worker API");
	});

	test("passes through Worker error status and body", async () => {
		process.env.BAT_API_URL = "https://bat.test.workers.dev";
		process.env.BAT_READ_KEY = "test-read-key";
		globalThis.fetch = (async () => {
			return new Response(JSON.stringify({ error: "Not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}) as unknown as typeof fetch;

		const res = await proxyToWorker("/api/hosts/unknown");
		expect(res.status).toBe(404);
	});

	test("handles no search params argument", async () => {
		process.env.BAT_API_URL = "https://bat.test.workers.dev";
		process.env.BAT_READ_KEY = "test-read-key";
		let capturedUrl = "";
		globalThis.fetch = (async (input: string | URL | Request) => {
			capturedUrl = input.toString();
			return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		}) as typeof fetch;

		await proxyToWorker("/api/hosts");
		expect(capturedUrl).not.toContain("?");
	});
});

// ---------------------------------------------------------------------------
// 4. SWR Hooks — mock useSWR to capture key + fetcher, verify URL patterns
// ---------------------------------------------------------------------------

// We mock `swr` and `../api` at the module level so all hook imports resolve
// to our mocks. Each hook is a thin wrapper: useSWR(key, fetcher, options).
// We capture the arguments and verify them.

let lastSwrCall: { key: unknown; fetcher: unknown; options: unknown } | null = null;

// biome-ignore lint/suspicious/noEmptyBlockStatements: mock noop function
const noopMutate = () => {};

mock.module("swr", () => ({
	default: (key: unknown, fetcher: unknown, options?: unknown) => {
		lastSwrCall = { key, fetcher, options };
		return { data: undefined, error: undefined, isLoading: false, mutate: noopMutate };
	},
}));

// Mock fetchAPI to record the call without making real network requests
const fetchAPICalls: Array<{ path: string; params?: Record<string, string> }> = [];

mock.module("./api", () => ({
	fetchAPI: (path: string, params?: Record<string, string>) => {
		fetchAPICalls.push({ path, params });
		return Promise.resolve(null);
	},
	ApiError: class ApiError extends Error {
		status: number;
		constructor(status: number, message: string) {
			super(message);
			this.name = "ApiError";
			this.status = status;
		}
	},
}));

// Mock React hooks since these are "use client" modules.
// useEffect captures callbacks so use-mobile tests can execute them.
const capturedEffects: Array<() => (() => void) | undefined> = [];
const capturedSetStates: unknown[] = [];

mock.module("react", () => ({
	useState: (init: unknown) => {
		const setter = (v: unknown) => {
			capturedSetStates.push(v);
		};
		return [init, setter];
	},
	useEffect: (fn: () => (() => void) | undefined) => {
		capturedEffects.push(fn);
	},
	useCallback: (fn: unknown) => fn,
	useMemo: (fn: () => unknown) => fn(),
}));

// Helper: safely get the lastSwrCall fields (avoids biome noNonNullAssertion)
function getSwrCall() {
	if (lastSwrCall == null) {
		throw new Error("useSWR was not called — lastSwrCall is null");
	}
	return lastSwrCall;
}

describe("SWR hooks", () => {
	beforeEach(() => {
		lastSwrCall = null;
		fetchAPICalls.length = 0;
		capturedEffects.length = 0;
		capturedSetStates.length = 0;
	});

	describe("useAlerts", () => {
		test("calls useSWR with 'alerts' key and correct fetcher", async () => {
			const { useAlerts } = await import("./hooks/use-alerts");
			useAlerts();
			const swr = getSwrCall();
			expect(swr.key).toBe("alerts");
			expect(swr.options).toEqual(
				expect.objectContaining({ refreshInterval: 30_000, keepPreviousData: true }),
			);
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/alerts", params: undefined });
		});
	});

	describe("useAllAllowedPorts", () => {
		test("calls useSWR with 'all-allowed-ports' key", async () => {
			const { useAllAllowedPorts } = await import("./hooks/use-all-allowed-ports");
			useAllAllowedPorts();
			const swr = getSwrCall();
			expect(swr.key).toBe("all-allowed-ports");
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/allowed-ports", params: undefined });
		});
	});

	describe("useAllowedPorts", () => {
		test("uses null key when hostId is null (disables fetching)", async () => {
			const { useAllowedPorts } = await import("./hooks/use-allowed-ports");
			useAllowedPorts(null);
			const swr = getSwrCall();
			expect(swr.key).toBeNull();
		});

		test("uses host-specific key when hostId is provided", async () => {
			const { useAllowedPorts } = await import("./hooks/use-allowed-ports");
			useAllowedPorts("host-abc");
			const swr = getSwrCall();
			expect(swr.key).toBe("allowed-ports-host-abc");
			expect(swr.options).toEqual(expect.objectContaining({ keepPreviousData: true }));
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({
				path: "/api/hosts/host-abc/allowed-ports",
				params: undefined,
			});
		});
	});

	describe("useEvents", () => {
		test("uses 'events' key when no hostId", async () => {
			const { useEvents } = await import("./hooks/use-events");
			useEvents();
			const swr = getSwrCall();
			expect(swr.key).toBe("events");
			expect(swr.options).toEqual(
				expect.objectContaining({ refreshInterval: 30_000, keepPreviousData: true }),
			);
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/events", params: undefined });
		});

		test("uses host-specific key and passes host_id param when hostId provided", async () => {
			const { useEvents } = await import("./hooks/use-events");
			fetchAPICalls.length = 0;
			useEvents("host-xyz");
			const swr = getSwrCall();
			expect(swr.key).toBe("events-host-xyz");
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({
				path: "/api/events",
				params: { host_id: "host-xyz" },
			});
		});
	});

	describe("useHostDetail", () => {
		test("calls useSWR with host-detail-{hid} key", async () => {
			const { useHostDetail } = await import("./hooks/use-host-detail");
			useHostDetail("h123");
			const swr = getSwrCall();
			expect(swr.key).toBe("host-detail-h123");
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/hosts/h123", params: undefined });
		});
	});

	describe("useHostMaintenance", () => {
		test("uses null key when hid is null", async () => {
			const { useHostMaintenance } = await import("./hooks/use-host-maintenance");
			useHostMaintenance(null);
			const swr = getSwrCall();
			expect(swr.key).toBeNull();
		});

		test("uses maintenance-{hid} key when hid is provided", async () => {
			const { useHostMaintenance } = await import("./hooks/use-host-maintenance");
			useHostMaintenance("h456");
			const swr = getSwrCall();
			expect(swr.key).toBe("maintenance-h456");
			expect(swr.options).toEqual(expect.objectContaining({ keepPreviousData: true }));
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({
				path: "/api/hosts/h456/maintenance",
				params: undefined,
			});
		});
	});

	describe("useHostMetrics", () => {
		test("uses null key when id is null", async () => {
			const { useHostMetrics } = await import("./hooks/use-host-metrics");
			useHostMetrics(null, 1000, 2000);
			const swr = getSwrCall();
			expect(swr.key).toBeNull();
		});

		test("uses metrics-{id}-{from}-{to} key when id is provided", async () => {
			const { useHostMetrics } = await import("./hooks/use-host-metrics");
			useHostMetrics("h789", 1000, 2000);
			const swr = getSwrCall();
			expect(swr.key).toBe("metrics-h789-1000-2000");
			expect(swr.options).toEqual(
				expect.objectContaining({ refreshInterval: 60_000, keepPreviousData: true }),
			);
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({
				path: "/api/hosts/h789/metrics",
				params: { from: "1000", to: "2000" },
			});
		});
	});

	describe("useHostTags", () => {
		test("calls useSWR with 'host-tags' key", async () => {
			const { useHostTags } = await import("./hooks/use-host-tags");
			useHostTags();
			const swr = getSwrCall();
			expect(swr.key).toBe("host-tags");
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/tags/by-hosts", params: undefined });
		});
	});

	describe("useHostTier2", () => {
		test("calls useSWR with host-tier2-{hid} key", async () => {
			const { useHostTier2 } = await import("./hooks/use-host-tier2");
			useHostTier2("hABC");
			const swr = getSwrCall();
			expect(swr.key).toBe("host-tier2-hABC");
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/hosts/hABC/tier2", params: undefined });
		});
	});

	describe("useHosts", () => {
		test("calls useSWR with 'hosts' key and refresh interval", async () => {
			const { useHosts } = await import("./hooks/use-hosts");
			useHosts();
			const swr = getSwrCall();
			expect(swr.key).toBe("hosts");
			expect(swr.options).toEqual(
				expect.objectContaining({ refreshInterval: 30_000, keepPreviousData: true }),
			);
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/hosts", params: undefined });
		});
	});

	describe("useSetup", () => {
		test("calls useSWR with 'setup' key and revalidateOnFocus false", async () => {
			const { useSetup } = await import("./hooks/use-setup");
			useSetup();
			const swr = getSwrCall();
			expect(swr.key).toBe("setup");
			expect(swr.options).toEqual(expect.objectContaining({ revalidateOnFocus: false }));
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/setup", params: undefined });
		});
	});

	describe("useSingleHostTags", () => {
		test("uses null key when hostId is null", async () => {
			const { useSingleHostTags } = await import("./hooks/use-single-host-tags");
			useSingleHostTags(null);
			const swr = getSwrCall();
			expect(swr.key).toBeNull();
		});

		test("uses host-tags-{hostId} key when hostId is provided", async () => {
			const { useSingleHostTags } = await import("./hooks/use-single-host-tags");
			useSingleHostTags("host-999");
			const swr = getSwrCall();
			expect(swr.key).toBe("host-tags-host-999");
			expect(swr.options).toEqual(expect.objectContaining({ keepPreviousData: true }));
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({
				path: "/api/hosts/host-999/tags",
				params: undefined,
			});
		});
	});

	describe("useTags", () => {
		test("calls useSWR with 'tags' key", async () => {
			const { useTags } = await import("./hooks/use-tags");
			useTags();
			const swr = getSwrCall();
			expect(swr.key).toBe("tags");
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/tags", params: undefined });
		});
	});

	describe("useWebhooks", () => {
		test("calls useSWR with 'webhooks' key and keepPreviousData", async () => {
			const { useWebhooks } = await import("./hooks/use-webhooks");
			useWebhooks();
			const swr = getSwrCall();
			expect(swr.key).toBe("webhooks");
			expect(swr.options).toEqual(expect.objectContaining({ keepPreviousData: true }));
			const fetcher = swr.fetcher as () => Promise<unknown>;
			await fetcher();
			expect(fetchAPICalls[0]).toEqual({ path: "/api/webhooks", params: undefined });
		});
	});
});

// ---------------------------------------------------------------------------
// 5. hooks/index.ts — barrel re-exports
// ---------------------------------------------------------------------------
describe("hooks/index barrel exports", () => {
	test("re-exports all hooks", async () => {
		const hooks = await import("./hooks/index");
		expect(typeof hooks.useHosts).toBe("function");
		expect(typeof hooks.useHostDetail).toBe("function");
		expect(typeof hooks.useHostMetrics).toBe("function");
		expect(typeof hooks.useHostTier2).toBe("function");
		expect(typeof hooks.useAlerts).toBe("function");
		expect(typeof hooks.useSetup).toBe("function");
		expect(typeof hooks.useTags).toBe("function");
		expect(typeof hooks.useHostTags).toBe("function");
		expect(typeof hooks.useSingleHostTags).toBe("function");
		expect(typeof hooks.useAllowedPorts).toBe("function");
		expect(typeof hooks.useAllAllowedPorts).toBe("function");
		expect(typeof hooks.useEvents).toBe("function");
		expect(typeof hooks.useWebhooks).toBe("function");
		expect(typeof hooks.useHostMaintenance).toBe("function");
	});
});

// ---------------------------------------------------------------------------
// 6. use-mobile.tsx — React hook with window/matchMedia
//    Our React mock captures useEffect callbacks. We call them manually
//    with a mocked window.matchMedia to exercise lines 16-22.
// ---------------------------------------------------------------------------
describe("useIsMobile", () => {
	const originalWindow = globalThis.window;

	beforeEach(() => {
		capturedEffects.length = 0;
		capturedSetStates.length = 0;
	});

	afterEach(() => {
		// @ts-expect-error: restore original
		globalThis.window = originalWindow;
	});

	test("module exports useIsMobile function", async () => {
		const mod = await import("../hooks/use-mobile");
		expect(typeof mod.useIsMobile).toBe("function");
	});

	test("returns undefined initially (SSR state)", async () => {
		// @ts-expect-error: partial mock
		globalThis.window = {
			innerWidth: 1024,
			matchMedia: () => ({
				addEventListener: () => {
					/* noop */
				},
				removeEventListener: () => {
					/* noop */
				},
			}),
		};
		const { useIsMobile } = await import("../hooks/use-mobile");
		const result = useIsMobile();
		expect(result).toBeUndefined();
	});

	test("useEffect registers matchMedia listener and detects mobile", async () => {
		let addedCb: (() => void) | null = null;
		let removedCb: (() => void) | null = null;

		// @ts-expect-error: partial mock
		globalThis.window = {
			innerWidth: 500, // below 768 = mobile
			matchMedia: (_q: string) => ({
				addEventListener: (_e: string, cb: () => void) => {
					addedCb = cb;
				},
				removeEventListener: (_e: string, cb: () => void) => {
					removedCb = cb;
				},
			}),
		};

		const { useIsMobile } = await import("../hooks/use-mobile");
		capturedEffects.length = 0;
		capturedSetStates.length = 0;
		useIsMobile();

		// Execute the captured useEffect callback
		expect(capturedEffects.length).toBeGreaterThanOrEqual(1);
		const lastEffect = capturedEffects[capturedEffects.length - 1];
		expect(lastEffect).toBeDefined();
		const cleanup = lastEffect?.();

		// setIsMobile should have been called with true (500 < 768)
		expect(capturedSetStates).toContain(true);

		// addEventListener should have been called
		expect(addedCb).not.toBeNull();

		// Simulate resize to desktop via the onChange callback
		// @ts-expect-error: update innerWidth
		globalThis.window.innerWidth = 1024;
		capturedSetStates.length = 0;
		if (addedCb) {
			addedCb();
		}
		expect(capturedSetStates).toContain(false);

		// Execute cleanup — calls removeEventListener
		if (typeof cleanup === "function") {
			cleanup();
		}
		expect(removedCb).not.toBeNull();
	});

	test("useEffect detects desktop when innerWidth >= 768", async () => {
		// @ts-expect-error: partial mock
		globalThis.window = {
			innerWidth: 1024,
			matchMedia: (_q: string) => ({
				addEventListener: () => {
					/* noop */
				},
				removeEventListener: () => {
					/* noop */
				},
			}),
		};

		const { useIsMobile } = await import("../hooks/use-mobile");
		capturedEffects.length = 0;
		capturedSetStates.length = 0;
		useIsMobile();

		const lastEffect = capturedEffects[capturedEffects.length - 1];
		if (lastEffect) {
			lastEffect();
		}

		expect(capturedSetStates).toContain(false);
	});
});
