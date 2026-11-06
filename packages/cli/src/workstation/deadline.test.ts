// Tests for the absolute probe deadline.

import { afterEach, describe, expect, test, vi } from "vitest";
import { createDeadline, monotonicNow } from "./deadline.js";

afterEach(() => {
	vi.useRealTimers();
});

function fakeClock(): { now: () => number; advance: (ms: number) => void } {
	let value = 1000;
	return {
		now: () => value,
		advance: (ms: number) => {
			value += ms;
		},
	};
}

describe("createDeadline", () => {
	test("exposes a monotonic remaining budget", () => {
		const clock = fakeClock();
		const deadline = createDeadline(10_000, clock.now);
		expect(deadline.remainingMs()).toBe(10_000);
		clock.advance(4_000);
		expect(deadline.remainingMs()).toBe(6_000);
		expect(deadline.expired).toBe(false);
		clock.advance(6_000);
		expect(deadline.remainingMs()).toBe(0);
		expect(deadline.expired).toBe(true);
	});

	test("caps child timeouts by the remaining budget", () => {
		const clock = fakeClock();
		const deadline = createDeadline(10_000, clock.now);
		expect(deadline.childTimeoutMs(30_000)).toBe(10_000);
		clock.advance(9_500);
		expect(deadline.childTimeoutMs(30_000)).toBe(500);
		clock.advance(10_000);
		expect(deadline.childTimeoutMs(30_000)).toBe(1);
	});

	test("aborts the shared signal when the budget ends", () => {
		vi.useFakeTimers();
		const deadline = createDeadline(1000);
		expect(deadline.signal.aborted).toBe(false);
		vi.advanceTimersByTime(1000);
		expect(deadline.signal.aborted).toBe(true);
	});

	test("sleeps for the requested time", async () => {
		vi.useFakeTimers();
		const deadline = createDeadline(10_000);
		let done = false;
		const pending = deadline.sleep(250).then(() => {
			done = true;
		});
		await vi.advanceTimersByTimeAsync(249);
		expect(done).toBe(false);
		await vi.advanceTimersByTimeAsync(1);
		await pending;
		expect(done).toBe(true);
	});

	test("never sleeps past the deadline", async () => {
		vi.useFakeTimers();
		const deadline = createDeadline(100);
		let done = false;
		const pending = deadline.sleep(10_000).then(() => {
			done = true;
		});
		await vi.advanceTimersByTimeAsync(100);
		await pending;
		expect(done).toBe(true);
	});

	test("wakes a sleeper as soon as the deadline aborts", async () => {
		const deadline = createDeadline(10_000);
		let done = false;
		const pending = deadline.sleep(5_000).then(() => {
			done = true;
		});
		deadline.signal.dispatchEvent(new Event("abort"));
		await pending;
		expect(done).toBe(true);
	});

	test("returns immediately when the signal is already aborted", async () => {
		const deadline = createDeadline(1);
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(deadline.signal.aborted).toBe(true);
		await expect(deadline.sleep(1000)).resolves.toBeUndefined();
	});

	test("uses a monotonic clock by default", () => {
		const first = monotonicNow();
		const second = monotonicNow();
		expect(second).toBeGreaterThanOrEqual(first);
	});
});
