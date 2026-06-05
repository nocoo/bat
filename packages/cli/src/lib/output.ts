// Output formatting helpers for CLI display.
// Uses @nocoo/cli-base consola + picocolors for consistent styling.

import { consola, pc } from "@nocoo/cli-base";

/** Print a success message (green checkmark) */
export function success(msg: string): void {
	consola.success(msg);
}

/** Print an error message (red cross) */
export function error(msg: string): void {
	consola.error(msg);
}

/** Print an info message */
export function info(msg: string): void {
	consola.info(msg);
}

/** Print a warning message */
export function warn(msg: string): void {
	consola.warn(msg);
}

/**
 * Print a simple table with headers and rows.
 * Columns are padded to the widest value.
 */
export function table(headers: string[], rows: string[][]): void {
	if (rows.length === 0) {
		return;
	}

	// Calculate column widths
	const widths = headers.map((h, i) => {
		let max = h.length;
		for (const row of rows) {
			const cell = row[i] ?? "";
			if (cell.length > max) {
				max = cell.length;
			}
		}
		return max;
	});

	// Header line
	const headerLine = headers.map((h, i) => h.padEnd(widths[i] ?? 0)).join("  ");
	console.log(pc.bold(headerLine));

	// Separator
	const sepLine = widths.map((w) => "─".repeat(w)).join("──");
	console.log(pc.dim(sepLine));

	// Data rows
	for (const row of rows) {
		const line = row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ");
		console.log(line);
	}
}

/**
 * Truncate a string to max length, adding "…" if truncated.
 */
export function truncate(str: string, maxLen: number): string {
	if (str.length <= maxLen) {
		return str;
	}
	return `${str.slice(0, maxLen - 1)}…`;
}
