// Disk capacity through an isolated, killable child process.
// A hung `statfs` syscall must never keep the CLI alive, so the call runs in a
// short-lived Node child that can be aborted with the run deadline.

import type { CommandExecutor } from "../scheduler/exec.js";

export interface StatfsLike {
	bsize: number;
	blocks: number;
	bavail: number;
}

/** Inline script: plain CommonJS, no imports from the CLI bundle. */
export const STATFS_SCRIPT = [
	"const { statfs } = require('node:fs');",
	"const mount = process.env.BAT_STATFS_MOUNT;",
	"statfs(mount, (error, stats) => {",
	"  if (error) {",
	"    process.stdout.write(JSON.stringify({ error: error.message }));",
	"    process.exit(1);",
	"    return;",
	"  }",
	"  process.stdout.write(JSON.stringify({ bsize: stats.bsize, blocks: stats.blocks, bavail: stats.bavail }));",
	"});",
].join("\n");

export interface StatfsOptions {
	exec: CommandExecutor;
	nodePath?: string;
	signal?: AbortSignal;
	timeoutMs?: number;
}

/** Run statfs in a child process; the child is killed when the signal aborts. */
export async function statfsInChild(mount: string, options: StatfsOptions): Promise<StatfsLike> {
	const result = await options.exec(options.nodePath ?? process.execPath, ["-e", STATFS_SCRIPT], {
		env: { BAT_STATFS_MOUNT: mount },
		timeoutMs: options.timeoutMs ?? 5000,
		...(options.signal ? { signal: options.signal } : {}),
	});
	if (result.spawnError) {
		throw new Error(`statfs child could not start: ${result.spawnError}`);
	}
	if (result.code !== 0) {
		throw new Error(result.stderr.trim() || `statfs child exited with ${result.code ?? "null"}`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(result.stdout);
	} catch {
		throw new Error("statfs child returned no result");
	}
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("statfs child returned no result");
	}
	const record = parsed as Record<string, unknown>;
	if (typeof record.error === "string") {
		throw new Error(record.error);
	}
	const { bsize, blocks, bavail } = record;
	if (typeof bsize !== "number" || typeof blocks !== "number" || typeof bavail !== "number") {
		throw new Error("statfs child returned an unusable result");
	}
	return { bsize, blocks, bavail };
}
