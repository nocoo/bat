// Command execution without a shell.
// Every scheduler, probe helper and ACL step goes through this interface so tests
// can replace the machine side effects with a fake executor.

import { spawn } from "node:child_process";

export interface ExecOptions {
	/** Bounded wall clock for the child process. */
	timeoutMs?: number;
	/** Written to stdin and closed. */
	input?: string;
	/** Extra environment entries for the child only. */
	env?: Record<string, string>;
	/** Aborts (and kills) the child when it fires. */
	signal?: AbortSignal;
}

export interface ExecResult {
	code: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
	/** The executor's own timeout killed the child. */
	timedOut: boolean;
	/** The caller's abort signal killed the child. */
	aborted: boolean;
	/** Set when the process could not be started at all (ENOENT, EACCES, ...). */
	spawnError?: string;
}

export type CommandExecutor = (
	command: string,
	args: string[],
	options: ExecOptions,
) => Promise<ExecResult>;

const MAX_CAPTURE_BYTES = 64 * 1024;

/**
 * Default executor: no shell, bounded output, bounded time, killable.
 * A missing binary is reported as `spawnError`, not as an exit code.
 */
export const runCommand: CommandExecutor = (command, args, options) =>
	new Promise((resolve) => {
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(command, args, {
				shell: false,
				stdio: ["pipe", "pipe", "pipe"],
				env: { ...process.env, ...options.env },
			});
		} catch (err) {
			resolve({
				code: null,
				signal: null,
				stdout: "",
				stderr: "",
				timedOut: false,
				aborted: false,
				spawnError: err instanceof Error ? err.message : String(err),
			});
			return;
		}

		let stdout = "";
		let stderr = "";
		let settled = false;
		let timedOut = false;
		let aborted = false;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const finish = (result: ExecResult): void => {
			if (settled) {
				return;
			}
			settled = true;
			if (timer !== undefined) {
				clearTimeout(timer);
			}
			options.signal?.removeEventListener("abort", onAbort);
			resolve(result);
		};

		const kill = (): void => {
			child.kill("SIGTERM");
			setTimeout(() => child.kill("SIGKILL"), 500).unref();
		};

		const onAbort = (): void => {
			aborted = true;
			kill();
		};

		if (options.signal) {
			if (options.signal.aborted) {
				onAbort();
			} else {
				options.signal.addEventListener("abort", onAbort, { once: true });
			}
		}

		if (options.timeoutMs !== undefined) {
			timer = setTimeout(() => {
				timedOut = true;
				kill();
			}, options.timeoutMs);
		}

		child.on("error", (err: NodeJS.ErrnoException) => {
			finish({
				code: null,
				signal: null,
				stdout,
				stderr,
				timedOut,
				aborted,
				spawnError: err.code ?? err.message,
			});
		});

		child.stdout?.on("data", (chunk: Buffer) => {
			if (stdout.length < MAX_CAPTURE_BYTES) {
				stdout += chunk.toString("utf-8");
			}
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			if (stderr.length < MAX_CAPTURE_BYTES) {
				stderr += chunk.toString("utf-8");
			}
		});

		child.on("close", (code, signal) => {
			finish({ code, signal, stdout, stderr, timedOut, aborted });
		});

		if (options.input !== undefined) {
			child.stdin?.on("error", () => {
				// The child may exit before reading stdin; that is not a spawn failure.
			});
			child.stdin?.end(options.input);
		} else {
			child.stdin?.end();
		}
	});
