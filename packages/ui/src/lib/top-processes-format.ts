// Pure helpers for the top-processes table view.
import type { TopProcessEntry } from "./transforms";

export type SortKey =
	| "cpu_pct"
	| "mem_pct"
	| "mem_rss"
	| "num_threads"
	| "io_read_rate"
	| "io_write_rate"
	| "uptime";
export type SortDir = "asc" | "desc";

/** Tailwind class for a process state code (R/D/Z/other). */
export function stateColor(state: string): string {
	switch (state) {
		case "R":
			return "text-emerald-500";
		case "D":
			return "text-warning";
		case "Z":
			return "text-destructive";
		default:
			return "text-muted-foreground";
	}
}

/** Tailwind class for CPU%: severity above 50/80 thresholds, "" otherwise. */
export function cpuColor(pct: number | null): string {
	if (pct == null) return "";
	if (pct > 80) return "text-destructive";
	if (pct > 50) return "text-warning";
	return "";
}

/** Tailwind class for per-process memory %: 15/30 thresholds. */
export function memPctColor(pct: number): string {
	if (pct > 30) return "text-destructive";
	if (pct > 15) return "text-warning";
	return "";
}

/** Tailwind class for thread count: 50/100 thresholds. */
export function threadColor(count: number): string {
	if (count > 100) return "text-destructive";
	if (count > 50) return "text-warning";
	return "";
}

/**
 * Sort a TopProcessEntry list by the requested column. Nulls sort as -1
 * (below every real value) so missing data doesn't dominate the table.
 * Returns a fresh array — does not mutate input.
 */
export function sortProcesses(
	procs: TopProcessEntry[],
	key: SortKey,
	dir: SortDir,
): TopProcessEntry[] {
	return [...procs].sort((a, b) => {
		const av = (a[key] ?? -1) as number;
		const bv = (b[key] ?? -1) as number;
		return dir === "desc" ? bv - av : av - bv;
	});
}

/** Case-insensitive substring filter on name/cmd/user. Empty query returns input. */
export function filterProcesses(
	procs: TopProcessEntry[],
	query: string,
): TopProcessEntry[] {
	const q = query.trim().toLowerCase();
	if (q.length === 0) {
		return procs;
	}
	return procs.filter(
		(p) =>
			p.name.toLowerCase().includes(q) ||
			p.cmd.toLowerCase().includes(q) ||
			p.user.toLowerCase().includes(q),
	);
}

/**
 * Compute the next sort state when a column header is clicked.
 * - Same column: flip direction.
 * - Different column: switch to it, default to descending.
 */
export function nextSortState(
	current: { key: SortKey; dir: SortDir },
	clicked: SortKey,
): { key: SortKey; dir: SortDir } {
	if (clicked === current.key) {
		return { key: clicked, dir: current.dir === "desc" ? "asc" : "desc" };
	}
	return { key: clicked, dir: "desc" };
}
