import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

interface MockMediaQueryList {
	matches: boolean;
	addEventListener: ReturnType<typeof vi.fn>;
	removeEventListener: ReturnType<typeof vi.fn>;
}

let mql: MockMediaQueryList;

function setViewport(width: number) {
	Object.defineProperty(window, "innerWidth", {
		configurable: true,
		writable: true,
		value: width,
	});
}

beforeEach(() => {
	mql = {
		matches: false,
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
	};
	window.matchMedia = vi.fn().mockReturnValue(mql) as typeof window.matchMedia;
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("useIsMobile", () => {
	test("returns true when viewport is below the breakpoint", () => {
		setViewport(500);
		const { result } = renderHook(() => useIsMobile());
		expect(result.current).toBe(true);
	});

	test("returns false when viewport is at or above the breakpoint", () => {
		setViewport(1024);
		const { result } = renderHook(() => useIsMobile());
		expect(result.current).toBe(false);
	});

	test("subscribes to matchMedia changes and unsubscribes on unmount", () => {
		setViewport(1024);
		const { unmount } = renderHook(() => useIsMobile());
		expect(mql.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

		unmount();
		expect(mql.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
	});

	test("recomputes on resize via the change handler", () => {
		setViewport(1024);
		const { result } = renderHook(() => useIsMobile());
		expect(result.current).toBe(false);

		const handler = mql.addEventListener.mock.calls[0][1] as () => void;
		setViewport(400);
		act(() => {
			handler();
		});
		expect(result.current).toBe(true);
	});
});
