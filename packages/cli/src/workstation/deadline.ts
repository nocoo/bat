// One absolute deadline for a probe run.
// Everything that can block — HTTP, child processes, sleeps, retries — is bounded
// by the same monotonic budget and cancelled through one abort signal.

export interface Deadline {
	/** Aborts when the budget is exhausted. */
	readonly signal: AbortSignal;
	/** Milliseconds left, never negative. */
	remainingMs(): number;
	/** True once the budget is exhausted. */
	readonly expired: boolean;
	/** Sleep that ends early when the budget is exhausted. */
	sleep(ms: number): Promise<void>;
	/** Timeout for a child process, capped by the remaining budget. */
	childTimeoutMs(cap: number): number;
}

/** Monotonic clock; wall clock jumps must not extend or shorten a run. */
export function monotonicNow(): number {
	return performance.now();
}

export function createDeadline(totalMs: number, now: () => number = monotonicNow): Deadline {
	const expiresAt = now() + totalMs;
	const controller = new AbortController();
	const timer = setTimeout(() => {
		controller.abort();
	}, totalMs);
	timer.unref?.();

	const deadline: Deadline = {
		signal: controller.signal,
		remainingMs: () => Math.max(0, expiresAt - now()),
		get expired() {
			return now() >= expiresAt;
		},
		sleep: (ms: number) =>
			new Promise<void>((resolve) => {
				if (controller.signal.aborted) {
					resolve();
					return;
				}
				const wait = Math.min(ms, Math.max(0, expiresAt - now()));
				const sleepTimer = setTimeout(() => {
					controller.signal.removeEventListener("abort", onAbort);
					resolve();
				}, wait);
				function onAbort(): void {
					clearTimeout(sleepTimer);
					resolve();
				}
				controller.signal.addEventListener("abort", onAbort, { once: true });
			}),
		childTimeoutMs: (cap: number) => Math.max(1, Math.min(cap, Math.max(1, expiresAt - now()))),
	};

	return deadline;
}
