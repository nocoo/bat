import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Capture the fetcher and config passed to useSWR so we can assert on them
// without a real network round-trip.
const swrCalls: Array<{
	key: unknown;
	fetcher: ((...args: unknown[]) => unknown) | null;
	config?: unknown;
}> = [];

vi.mock("swr", () => ({
	default: vi.fn((key: unknown, fetcher: unknown, config?: unknown) => {
		swrCalls.push({
			key,
			fetcher: (fetcher as ((...args: unknown[]) => unknown) | null) ?? null,
			config,
		});
		return { data: undefined, error: undefined, isLoading: true };
	}),
}));

const getAPIMock = vi.fn(async (..._args: unknown[]) => ({}));
vi.mock("../api", () => ({
	getAPI: (...args: unknown[]) => getAPIMock(...args),
}));

import {
	EVENTS_PAGE_SIZE,
	useAlerts,
	useEvents,
	useHostDetail,
	useHostMetrics,
	useHostTags,
	useHosts,
	useMe,
	useSetup,
	useTags,
	useWebhooks,
} from "./queries";

beforeEach(() => {
	swrCalls.length = 0;
	getAPIMock.mockClear();
});

afterEach(() => {
	vi.clearAllMocks();
});

function lastCall() {
	const c = swrCalls.at(-1);
	if (!c) {
		throw new Error("no swr call recorded");
	}
	return c;
}

describe("query hooks — keys, configs, and fetcher routes", () => {
	test("useHosts → key 'hosts', polls every 30s, fetches /api/hosts", async () => {
		renderHook(() => useHosts());
		const c = lastCall();
		expect(c.key).toBe("hosts");
		expect(c.config).toMatchObject({ refreshInterval: 30_000, keepPreviousData: true });
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/hosts");
	});

	test("useAlerts → key 'alerts', polls every 30s", async () => {
		renderHook(() => useAlerts());
		const c = lastCall();
		expect(c.key).toBe("alerts");
		expect(c.config).toMatchObject({ refreshInterval: 30_000 });
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/alerts");
	});

	test("useTags → key 'tags', no extra config", async () => {
		renderHook(() => useTags());
		const c = lastCall();
		expect(c.key).toBe("tags");
		expect(c.config).toBeUndefined();
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/tags");
	});

	test("useHostTags → key 'host-tags', fetches /api/tags/by-hosts", async () => {
		renderHook(() => useHostTags());
		const c = lastCall();
		expect(c.key).toBe("host-tags");
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/tags/by-hosts");
	});

	test("useWebhooks → key 'webhooks', keepPreviousData", async () => {
		renderHook(() => useWebhooks());
		const c = lastCall();
		expect(c.key).toBe("webhooks");
		expect(c.config).toMatchObject({ keepPreviousData: true });
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/webhooks");
	});

	test("useMe → STATIC config (no focus/reconnect revalidate)", async () => {
		renderHook(() => useMe());
		const c = lastCall();
		expect(c.key).toBe("me");
		expect(c.config).toMatchObject({
			revalidateOnFocus: false,
			revalidateOnReconnect: false,
		});
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/me");
	});

	test("useSetup → no focus refetch", async () => {
		renderHook(() => useSetup());
		const c = lastCall();
		expect(c.key).toBe("setup");
		expect(c.config).toMatchObject({ revalidateOnFocus: false });
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/setup");
	});

	test("useHostDetail keys per hid and fetches /api/hosts/<hid>", async () => {
		renderHook(() => useHostDetail("h-42"));
		const c = lastCall();
		expect(c.key).toBe("host-detail-h-42");
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/hosts/h-42");
	});

	test("useHostMetrics with id keys uniquely on (id, from, to) and polls 60s", async () => {
		renderHook(() => useHostMetrics("h-1", 100, 200));
		const c = lastCall();
		expect(c.key).toBe("metrics-h-1-100-200");
		expect(c.config).toMatchObject({ refreshInterval: 60_000 });
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/hosts/h-1/metrics", {
			from: "100",
			to: "200",
		});
	});

	test("useHostMetrics passes null key when id is null (suspended fetch)", () => {
		renderHook(() => useHostMetrics(null, 100, 200));
		const c = lastCall();
		expect(c.key).toBeNull();
	});

	test("useEvents without hostId computes offset from page", async () => {
		renderHook(() => useEvents(undefined, 3));
		const c = lastCall();
		expect(c.key).toBe("events-page-3");
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/events", {
			limit: String(EVENTS_PAGE_SIZE),
			offset: String((3 - 1) * EVENTS_PAGE_SIZE),
		});
	});

	test("useEvents with hostId scopes the key and adds host_id param", async () => {
		renderHook(() => useEvents("h-9", 1));
		const c = lastCall();
		expect(c.key).toBe("events-h-9-page-1");
		await c.fetcher?.();
		expect(getAPIMock).toHaveBeenCalledWith("/api/events", {
			limit: String(EVENTS_PAGE_SIZE),
			offset: "0",
			host_id: "h-9",
		});
	});

	test("useEvents defaults to page 1 when no page argument is passed", () => {
		renderHook(() => useEvents("h-1"));
		const c = lastCall();
		expect(c.key).toBe("events-h-1-page-1");
	});
});
