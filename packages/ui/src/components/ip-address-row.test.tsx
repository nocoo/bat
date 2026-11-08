import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { IpAddressRow } from "./ip-address-row";

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

async function flushAnnouncement() {
	await act(async () => {
		vi.advanceTimersByTime(0);
	});
}

describe("IpAddressRow", () => {
	test("supports right alignment for system-info rows", () => {
		render(<IpAddressRow label="Public IPv4" value="203.0.113.10" alignment="right" />);
		const row = screen.getByTestId("ip-address-row");
		expect(row.getAttribute("data-alignment")).toBe("right");
		expect(row.className).toContain("w-full");
		expect(row.className).toContain("justify-between");
	});

	test("does not render a missing value", () => {
		const view = render(<IpAddressRow label="IPv6" value={null} />);
		expect(view.queryByTestId("ip-address-row")).toBeNull();
		expect(view.queryByRole("button")).toBeNull();
	});

	test("keeps the full address in title, accessible name, copy text and live region", async () => {
		const address = "2001:db8:85a3:8d3:1319:8a2e:370:7348";
		render(<IpAddressRow label="IPv6" value={address} />);
		const button = screen.getByRole("button", { name: `Copy address ${address}` });
		expect(button.getAttribute("title")).toBe(address);

		await act(async () => {
			fireEvent.click(button);
			await Promise.resolve();
		});
		await flushAnnouncement();

		expect(navigator.clipboard.writeText).toHaveBeenCalledWith(address);
		expect(button.getAttribute("data-state")).toBe("copied");
		expect(screen.getByRole("status").textContent).toBe(`Address copied: ${address}`);
	});

	test("restarts success feedback and restores idle after 1.4 seconds", async () => {
		render(<IpAddressRow label="IPv4" value="123.123.123.123" />);
		const button = screen.getByRole("button", { name: "Copy address 123.123.123.123" });

		await act(async () => {
			fireEvent.click(button);
			await Promise.resolve();
		});
		await flushAnnouncement();
		expect(button.getAttribute("data-state")).toBe("copied");

		await act(async () => {
			vi.advanceTimersByTime(FEEDBACK_MS - 1);
		});
		expect(button.getAttribute("data-state")).toBe("copied");
		await act(async () => {
			vi.advanceTimersByTime(1);
		});
		expect(button.getAttribute("data-state")).toBe("idle");
	});

	test("shows warning feedback for refused copy", async () => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: vi.fn(() => Promise.reject(new Error("denied"))) },
		});
		render(<IpAddressRow label="IPv4" value="203.0.113.10" />);
		const button = screen.getByRole("button", { name: "Copy address 203.0.113.10" });

		await act(async () => {
			fireEvent.click(button);
			await Promise.resolve();
		});
		await flushAnnouncement();

		expect(button.getAttribute("data-state")).toBe("failed");
		expect(screen.getByRole("status").textContent).toBe("Could not copy address: 203.0.113.10");
	});

	test("keeps one live region node across repeated copies", async () => {
		render(<IpAddressRow label="IPv4" value="203.0.113.10" />);
		const button = screen.getByRole("button", { name: "Copy address 203.0.113.10" });
		const region = screen.getByRole("status");

		await act(async () => {
			fireEvent.click(button);
			await Promise.resolve();
		});
		await flushAnnouncement();
		await act(async () => {
			fireEvent.click(button);
			await Promise.resolve();
		});
		await flushAnnouncement();

		expect(screen.getByRole("status")).toBe(region);
		expect(region.textContent).toBe("Address copied: 203.0.113.10");
	});

	test("cancels feedback when unmounted", async () => {
		const clearSpy = vi.spyOn(globalThis, "clearTimeout");
		const view = render(<IpAddressRow label="IPv4" value="203.0.113.10" />);
		const button = screen.getByRole("button", { name: "Copy address 203.0.113.10" });

		await act(async () => {
			fireEvent.click(button);
			await Promise.resolve();
		});
		await flushAnnouncement();
		view.unmount();
		expect(clearSpy).toHaveBeenCalled();
	});
});
