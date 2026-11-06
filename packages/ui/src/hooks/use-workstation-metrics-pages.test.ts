import type { WorkstationMetricPoint, WorkstationMetricsResponse } from "@bat/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { calls, state, getAPIMock } = vi.hoisted(() => ({
	calls: [] as Array<{
		getKey: (index: number, previous: WorkstationMetricsResponse | null) => unknown;
		fetcher: (key: readonly [string, number]) => unknown;
		config: unknown;
	}>,
	state: {
		result: {
			data: undefined as WorkstationMetricsResponse[] | undefined,
			size: 1,
			setSize: vi.fn(),
			isLoading: true,
			isValidating: false,
			error: undefined as unknown,
		},
	},
	getAPIMock: vi.fn(async (..._args: unknown[]) => ({})),
}));

vi.mock("swr/infinite", () => ({
	default: (
		getKey: (index: number, previous: WorkstationMetricsResponse | null) => unknown,
		fetcher: (key: readonly [string, number]) => unknown,
		config: unknown,
	) => {
		calls.push({ getKey, fetcher, config });
		return state.result;
	},
}));
vi.mock("../api", () => ({
	getAPI: (...args: unknown[]) => getAPIMock(...args),
}));

import { useWorkstationMetricsPages } from "./queries";

function point(receivedAt: number): WorkstationMetricPoint {
	return {
		received_at: receivedAt,
		started_at: receivedAt - 2,
		finished_at: receivedAt - 1,
		cpu_usage_pct: 10,
		mem_used_pct: 20,
		mem_total_bytes: 100,
		mem_available_bytes: 80,
		uptime_seconds: 300,
	};
}

function page(values: number[], nextOffset: number | null): WorkstationMetricsResponse {
	return { data: values.map(point), page: { limit: 100, offset: 0, next_offset: nextOffset } };
}

beforeEach(() => {
	calls.length = 0;
	getAPIMock.mockClear().mockResolvedValue({});
	state.result = {
		data: undefined,
		size: 1,
		setSize: vi.fn(),
		isLoading: true,
		isValidating: false,
		error: undefined,
	};
});

describe("useWorkstationMetricsPages", () => {
	test("asks for bounded 100 sample pages and stops after a short page", async () => {
		renderHook(() => useWorkstationMetricsPages("ws-1", 100, 200));
		const call = calls.at(-1);
		if (!call) throw new Error("no infinite call");
		expect(call.config).toMatchObject({ refreshInterval: 60_000 });
		expect(call.getKey(0, null)).toEqual(["workstation-metrics-ws-1-100-200", 0]);
		expect(call.getKey(1, page([1], null))).toBeNull();
		expect(
			call.getKey(
				1,
				page(
					Array.from({ length: 100 }, (_, i) => i),
					100,
				),
			),
		).toEqual(["workstation-metrics-ws-1-100-200", 100]);
		await call.fetcher(["workstation-metrics-ws-1-100-200", 200]);
		expect(getAPIMock).toHaveBeenCalledWith("/api/workstations/ws-1/metrics", {
			from: "100",
			to: "200",
			limit: "100",
			offset: "200",
		});
	});

	test("suspends every page when the workstation id is null", () => {
		renderHook(() => useWorkstationMetricsPages(null, 100, 200));
		const call = calls.at(-1);
		if (!call) throw new Error("no infinite call");
		expect(call.getKey(0, null)).toBeNull();
	});

	test("merges loaded pages oldest first and exposes deliberate older loading", () => {
		state.result = {
			data: [page([3, 4], 100), page([1, 2], 200)],
			size: 2,
			setSize: vi.fn(),
			isLoading: false,
			isValidating: false,
			error: undefined,
		};
		const { result } = renderHook(() => useWorkstationMetricsPages("ws-1", 100, 200));
		expect(result.current.metrics.map((entry) => entry.received_at)).toEqual([1, 2, 3, 4]);
		expect(result.current.newestCount).toBe(2);
		expect(result.current.olderCount).toBe(2);
		expect(result.current.hasOlder).toBe(true);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.isLoadingOlder).toBe(false);
		result.current.loadOlder();
		expect(state.result.setSize).toHaveBeenCalledWith(3);
	});

	test("a short last page ends pagination and older loading is visible while validating", () => {
		state.result = {
			data: [page([3, 4], null)],
			size: 2,
			setSize: vi.fn(),
			isLoading: false,
			isValidating: true,
			error: undefined,
		};
		const { result } = renderHook(() => useWorkstationMetricsPages("ws-1", 100, 200));
		expect(result.current.olderCount).toBe(0);
		expect(result.current.hasOlder).toBe(false);
		expect(result.current.isLoadingOlder).toBe(true);
	});

	test("an empty first load reports loading, no pages and no older page", () => {
		const error = new Error("history unavailable");
		state.result = {
			data: undefined,
			size: 1,
			setSize: vi.fn(),
			isLoading: true,
			isValidating: false,
			error,
		};
		const { result } = renderHook(() => useWorkstationMetricsPages("ws-1", 100, 200));
		expect(result.current.metrics).toEqual([]);
		expect(result.current.hasOlder).toBe(false);
		expect(result.current.isLoading).toBe(true);
		expect(result.current.error).toBe(error);
	});
});
