import type { WorkstationRecord } from "@bat/shared";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { deleteMock, mutateMock } = vi.hoisted(() => ({
	deleteMock: vi.fn(),
	mutateMock: vi.fn(),
}));
vi.mock("../api", () => ({ deleteWorkstationAPI: deleteMock }));
vi.mock("swr", () => ({ useSWRConfig: () => ({ mutate: mutateMock }) }));

import { useDeleteWorkstation } from "./use-delete-workstation";

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
	deleteMock.mockReset().mockResolvedValue({ ok: true });
	mutateMock.mockReset().mockResolvedValue(undefined);
});

describe("useDeleteWorkstation", () => {
	test("removes only this workstation from the list and clears its history keys", async () => {
		const { result } = renderHook(() => useDeleteWorkstation(id));
		await act(async () => expect(await result.current.deleteWorkstation()).toBe(true));
		expect(deleteMock).toHaveBeenCalledWith(id);
		const update = mutateMock.mock.calls[0]?.[1] as (
			current?: Partial<WorkstationRecord>[],
		) => Partial<WorkstationRecord>[] | undefined;
		expect(update([{ id }, { id: "other" }])).toEqual([{ id: "other" }]);
		expect(update(undefined)).toBeUndefined();
		expect(mutateMock.mock.calls[0]?.[2]).toEqual({ revalidate: false });
		const affected = mutateMock.mock.calls[1]?.[0] as (key: unknown) => boolean;
		for (const key of [
			`workstation-${id}`,
			`workstation-metrics-${id}-1-2-100-0`,
			`workstation-connectivity-${id}-1-2-100`,
		]) {
			expect(affected(key)).toBe(true);
		}
		for (const key of [
			null,
			1,
			"workstations",
			"workstation-other",
			`workstation-metrics-other-1-2`,
		]) {
			expect(affected(key)).toBe(false);
		}
		expect(mutateMock.mock.calls[1]?.slice(1)).toEqual([undefined, { revalidate: false }]);
		expect(result.current.deleting).toBe(false);
		expect(result.current.error).toBeNull();
	});

	test("blocks duplicate submissions while pending", async () => {
		let complete: ((value: { ok: true }) => void) | undefined;
		deleteMock.mockReturnValue(
			new Promise<{ ok: true }>((resolve) => {
				complete = resolve;
			}),
		);
		const { result } = renderHook(() => useDeleteWorkstation(id));
		let first: Promise<boolean> | undefined;
		await act(async () => {
			first = result.current.deleteWorkstation();
			expect(await result.current.deleteWorkstation()).toBe(false);
		});
		expect(deleteMock).toHaveBeenCalledTimes(1);
		expect(result.current.deleting).toBe(true);
		await act(async () => {
			complete?.({ ok: true });
			expect(await first).toBe(true);
		});
		expect(result.current.deleting).toBe(false);
	});

	test("keeps caches on failure, reports an honest error and can reset it", async () => {
		deleteMock.mockRejectedValue(new Error("network"));
		const { result } = renderHook(() => useDeleteWorkstation(id));
		await act(async () => expect(await result.current.deleteWorkstation()).toBe(false));
		expect(mutateMock).not.toHaveBeenCalled();
		expect(result.current.error).toContain("belong to another account");
		act(() => result.current.clearError());
		expect(result.current.error).toBeNull();
	});
});
