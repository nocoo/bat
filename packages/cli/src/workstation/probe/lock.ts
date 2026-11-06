// Single-instance lock for probe runs.
// Uses proper-lockfile: mkdir-atomic acquisition, mtime heartbeat, bounded stale
// recovery, and compromise detection. A compromised lock aborts the whole run.

import { lock as lockFile } from "proper-lockfile";

/** Longer than one probe run (120 s), so a live run is never considered stale. */
export const PROBE_LOCK_STALE_MS = 180_000;
/** Heartbeat interval; the lock is refreshed while the probe runs. */
export const PROBE_LOCK_UPDATE_MS = 30_000;

export interface LockHandle {
	/** Aborts when the lock is compromised (stolen or heartbeat lost). */
	readonly signal: AbortSignal;
	release: () => Promise<void>;
	compromised: () => Error | null;
}

export interface LockOptions {
	staleMs?: number;
	updateMs?: number;
}

/**
 * Try to take the probe lock. Returns null when another process holds it.
 * The lock path is the lock directory itself (`.../probe.lock`), so `status`
 * and the probe error can name it directly.
 */
export async function acquireProbeLock(
	path: string,
	options: LockOptions = {},
): Promise<LockHandle | null> {
	const controller = new AbortController();
	let compromised: Error | null = null;

	try {
		const release = await lockFile(path, {
			lockfilePath: path,
			realpath: false,
			stale: options.staleMs ?? PROBE_LOCK_STALE_MS,
			update: options.updateMs ?? PROBE_LOCK_UPDATE_MS,
			retries: 0,
			onCompromised: (err: Error) => {
				compromised = err;
				controller.abort(err);
			},
		});
		return {
			signal: controller.signal,
			compromised: () => compromised,
			release: async () => {
				await release();
			},
		};
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ELOCKED") {
			return null;
		}
		throw err;
	}
}
