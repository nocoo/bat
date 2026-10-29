import { type HostOverviewItem, hashHostId } from "@bat/shared";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { deleteHostMock, mutateMock } = vi.hoisted(() => ({
	deleteHostMock: vi.fn(),
	mutateMock: vi.fn(),
}));
vi.mock("../api", () => ({ deleteHostAPI: deleteHostMock }));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate: mutateMock }) }));

import { useDeleteHost } from "./use-delete-host";

beforeEach(() => {
	deleteHostMock.mockReset().mockResolvedValue({ ok: true });
	mutateMock.mockReset().mockResolvedValue(undefined);
});

describe("useDeleteHost", () => {
	test("requires the exact raw ID, not a hash, case change or surrounding whitespace", async () => {
		const { result } = renderHook(() => useDeleteHost("Host-1", "abc12345"));
		for (const confirmation of ["", "abc12345", "host-1", "Host-1 ", " Host-1"]) {
			await act(async () => expect(await result.current.deleteHost(confirmation)).toBe(false));
		}
		expect(deleteHostMock).not.toHaveBeenCalled();
		expect(mutateMock).not.toHaveBeenCalled();
	});

	test("removes the host from the fleet cache and clears affected host and aggregate data", async () => {
		const { result } = renderHook(() => useDeleteHost("host-1", "abc12345"));
		await act(async () => expect(await result.current.deleteHost("host-1")).toBe(true));
		expect(deleteHostMock).toHaveBeenCalledWith("abc12345", "host-1");
		const updateHosts = mutateMock.mock.calls[0]?.[1] as (
			current?: Partial<HostOverviewItem>[],
		) => Partial<HostOverviewItem>[] | undefined;
		expect(updateHosts([{ host_id: "host-1" }, { host_id: "host-2" }])).toEqual([
			{ host_id: "host-2" },
		]);
		expect(updateHosts(undefined)).toBeUndefined();
		expect(mutateMock.mock.calls[0]?.[2]).toEqual({ revalidate: false });
		const affected = mutateMock.mock.calls[1]?.[0] as (key: unknown) => boolean;
		for (const key of [
			"alerts",
			"host-tags",
			"all-allowed-ports",
			"webhooks",
			"events-page-1",
			"/api/connect/tokens",
			"host-detail-host-1",
			"host-detail-abc12345",
			`host-detail-${hashHostId("host-1")}`,
			"tier2-host-1",
			"host-tags-abc12345",
			"maintenance-host-1",
			"allowed-ports-host-1",
			"metrics-abc12345-100-200",
		])
			expect(affected(key)).toBe(true);
		for (const key of [null, 1, ["hosts"], "me", "hosts", "host-detail-other", "metrics-other-1-2"])
			expect(affected(key)).toBe(false);
		expect(mutateMock.mock.calls[1]?.slice(1)).toEqual([undefined, { revalidate: false }]);
		expect(result.current.deleting).toBe(false);
		expect(result.current.error).toBeNull();
	});

	test("prevents duplicate submissions while the request is pending", async () => {
		let complete: ((value: { ok: true }) => void) | undefined;
		deleteHostMock.mockReturnValue(
			new Promise<{ ok: true }>((resolve) => {
				complete = resolve;
			}),
		);
		const { result } = renderHook(() => useDeleteHost("host-1", "abc12345"));
		let first: Promise<boolean> | undefined;
		await act(async () => {
			first = result.current.deleteHost("host-1");
			expect(await result.current.deleteHost("host-1")).toBe(false);
		});
		expect(result.current.deleting).toBe(true);
		expect(deleteHostMock).toHaveBeenCalledTimes(1);
		await act(async () => {
			complete?.({ ok: true });
			expect(await first).toBe(true);
		});
		expect(result.current.deleting).toBe(false);
	});

	test("preserves caches on failure, exposes an honest retry error and can reset it", async () => {
		deleteHostMock.mockRejectedValue(new Error("network error"));
		const { result } = renderHook(() => useDeleteHost("host-1", "abc12345"));
		await act(async () => expect(await result.current.deleteHost("host-1")).toBe(false));
		expect(mutateMock).not.toHaveBeenCalled();
		expect(result.current.error).toContain("Refresh the host before retrying");
		expect(result.current.deleting).toBe(false);
		act(() => result.current.clearError());
		expect(result.current.error).toBeNull();
	});
});
