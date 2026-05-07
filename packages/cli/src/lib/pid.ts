// PID file utilities for the service command.
// PID file lives at ~/.config/bat/bat-cli.pid by default.

import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { getConfigDir } from "./config.js";

const PID_FILENAME = "bat-cli.pid";

/**
 * Get the default PID file path.
 */
export function getPidFilePath(configDir?: string): string {
	return `${configDir ?? getConfigDir()}/${PID_FILENAME}`;
}

/**
 * Write a PID file.
 */
export function writePidFile(path: string, pid: number): void {
	writeFileSync(path, String(pid), { mode: 0o644 });
}

/**
 * Read the PID from a PID file. Returns null if file doesn't exist or is invalid.
 */
export function readPidFile(path: string): number | null {
	if (!existsSync(path)) {
		return null;
	}
	try {
		const content = readFileSync(path, "utf-8").trim();
		const pid = Number(content);
		if (!Number.isInteger(pid) || pid <= 0) {
			return null;
		}
		return pid;
	} catch {
		return null;
	}
}

/**
 * Remove the PID file if it exists.
 */
export function removePidFile(path: string): void {
	try {
		unlinkSync(path);
	} catch {
		// Ignore — file may already be gone
	}
}

/**
 * Check if a process with the given PID is running.
 * Uses kill(pid, 0) which checks existence without sending a signal.
 */
export function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
