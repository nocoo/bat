import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { IpAddressChip } from "./ip-address-chip";

const FEEDBACK_MS = 1400;

beforeEach(() => {
	vi.useFakeTimers();
	Object.defineProperty(navigator, "clipboard", {
		configurable: true,
		value: { writeText: vi.fn(() => Promise.resolve()) },
	});
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

/** Flush the deferred live-region announcement (a 0ms timer, so the copy
 *  feedback window is untouched). */
async function flushAnnouncement() {
	await act(async () => {
		vi.advanceTimersByTime(0);
	});
}

describe("IpAddressChip feedback", () => {
	test("keeps the full address in the accessible name and live-region result", async () => {
		render(<IpAddressChip value="2001:db8:85a3:8d3:1319:8a2e:370:7348" />);

		const chip = screen.getByRole("button", {
			name: "Copy address 2001:db8:85a3:8d3:1319:8a2e:370:7348",
		});
		expect(chip.getAttribute("title")).toBe("2001:db8:85a3:8d3:1319:8a2e:370:7348");

		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();

		expect(screen.getByRole("status").textContent).toBe(
			"Address copied: 2001:db8:85a3:8d3:1319:8a2e:370:7348",
		);
		expect(screen.getByTestId("ip-address-chip-overlay").getAttribute("aria-hidden")).toBe("true");
	});

	test("a second success restarts the feedback timer", async () => {
		render(<IpAddressChip value="203.0.113.10" />);
		const chip = screen.getByRole("button", { name: "Copy address 203.0.113.10" });

		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();
		expect(chip.getAttribute("data-state")).toBe("copied");

		await act(async () => {
			vi.advanceTimersByTime(FEEDBACK_MS - 200);
		});
		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();
		expect(chip.getAttribute("data-state")).toBe("copied");

		await act(async () => {
			vi.advanceTimersByTime(FEEDBACK_MS - 1);
		});
		expect(chip.getAttribute("data-state")).toBe("copied");
		await act(async () => {
			vi.advanceTimersByTime(1);
		});
		expect(chip.getAttribute("data-state")).toBe("idle");
	});

	test("announces a refused copy in the live region", async () => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
		});
		render(<IpAddressChip value="203.0.113.10" />);
		const chip = screen.getByRole("button", { name: "Copy address 203.0.113.10" });

		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();

		expect(screen.getByRole("status").textContent).toBe("Could not copy address: 203.0.113.10");
		expect(chip.getAttribute("data-state")).toBe("failed");
	});

	test("consecutive failures restart their own warning timer", async () => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
		});
		render(<IpAddressChip value="203.0.113.10" />);
		const chip = screen.getByRole("button", { name: "Copy address 203.0.113.10" });

		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();
		expect(chip.getAttribute("data-state")).toBe("failed");
		expect(screen.getByRole("status").textContent).toBe("Could not copy address: 203.0.113.10");

		await act(async () => {
			vi.advanceTimersByTime(FEEDBACK_MS - 200);
		});
		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();
		expect(chip.getAttribute("data-state")).toBe("failed");

		await act(async () => {
			vi.advanceTimersByTime(FEEDBACK_MS - 1);
		});
		expect(chip.getAttribute("data-state")).toBe("failed");
		await act(async () => {
			vi.advanceTimersByTime(1);
		});
		expect(chip.getAttribute("data-state")).toBe("idle");
	});

	test("keeps one live region node across repeated copies", async () => {
		render(<IpAddressChip value="203.0.113.10" />);
		const chip = screen.getByRole("button", { name: "Copy address 203.0.113.10" });
		const region = screen.getByRole("status");

		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();
		expect(region.textContent).toBe("Address copied: 203.0.113.10");

		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();

		// The same node is reused — only its text changes — so a repeated copy is
		// announced again instead of being lost with a remounted region.
		expect(screen.getByRole("status")).toBe(region);
		expect(region.textContent).toBe("Address copied: 203.0.113.10");
	});

	test("keeps one live region node across repeated copies", async () => {
		render(<IpAddressChip value="203.0.113.10" />);
		const chip = screen.getByRole("button", { name: "Copy address 203.0.113.10" });
		const region = screen.getByRole("status");

		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();

		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();

		expect(screen.getByRole("status")).toBe(region);
		expect(region.textContent).toBe("Address copied: 203.0.113.10");
	});

	test("unmount cancels the feedback timer", async () => {
		const clearSpy = vi.spyOn(globalThis, "clearTimeout");
		const view = render(<IpAddressChip value="203.0.113.10" />);
		const chip = screen.getByRole("button", { name: "Copy address 203.0.113.10" });

		await act(async () => {
			fireEvent.click(chip);
			await Promise.resolve();
		});
		await flushAnnouncement();
		view.unmount();
		expect(clearSpy).toHaveBeenCalled();
	});
});
