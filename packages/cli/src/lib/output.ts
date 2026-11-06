// Output formatting helpers for CLI display.
// Uses @nocoo/base-cli consola + picocolors for consistent styling.

import { consola, pc } from "@nocoo/base-cli";

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

	const columns = headers.map((header, index) => ({
		header,
		width: rows.reduce((max, row) => Math.max(max, (row[index] ?? "").length), header.length),
	}));

	console.log(pc.bold(columns.map((column) => column.header.padEnd(column.width)).join("  ")));
	console.log(pc.dim(columns.map((column) => "─".repeat(column.width)).join("──")));

	for (const row of rows) {
		const line = columns.map((column, index) => (row[index] ?? "").padEnd(column.width));
		console.log(line.join("  "));
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
