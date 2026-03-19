"use client";

import {
	formatBytes,
	formatBytesRate,
	formatUptime,
	transformTopProcessesData,
} from "@/lib/transforms";
import type { TopProcessEntry } from "@/lib/transforms";
import type { MetricsDataPoint } from "@bat/shared";
import { Activity } from "lucide-react";
import { useMemo, useState } from "react";

type SortKey =
	| "cpu_pct"
	| "mem_pct"
	| "mem_rss"
	| "num_threads"
	| "io_read_rate"
	| "io_write_rate"
	| "uptime";
type SortDir = "asc" | "desc";

function stateColor(state: string): string {
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

function cpuColor(pct: number | null): string {
	if (pct == null) return "";
	if (pct > 80) return "text-destructive";
	if (pct > 50) return "text-warning";
	return "";
}

function memPctColor(pct: number): string {
	if (pct > 30) return "text-destructive";
	if (pct > 15) return "text-warning";
	return "";
}

function threadColor(count: number): string {
	if (count > 100) return "text-destructive";
	if (count > 50) return "text-warning";
	return "";
}

function sortProcesses(procs: TopProcessEntry[], key: SortKey, dir: SortDir): TopProcessEntry[] {
	return [...procs].sort((a, b) => {
		const av = a[key] ?? -1;
		const bv = b[key] ?? -1;
		return dir === "desc" ? (bv as number) - (av as number) : (av as number) - (bv as number);
	});
}

/** Sortable column header with keyboard support */
function SortTh({
	label,
	sortKey,
	activeSortKey,
	sortDir,
	onSort,
	className,
}: {
	label: string;
	sortKey: SortKey;
	activeSortKey: SortKey;
	sortDir: SortDir;
	onSort: (key: SortKey) => void;
	className: string;
}) {
	const indicator = sortKey === activeSortKey ? (sortDir === "desc" ? " ↓" : " ↑") : "";
	return (
		<th className={className}>
			<button
				type="button"
				className="w-full text-inherit cursor-pointer select-none hover:text-foreground text-right"
				onClick={() => onSort(sortKey)}
			>
				{label}
				{indicator}
			</button>
		</th>
	);
}

export function TopProcessesTable({ data }: { data: MetricsDataPoint[] }) {
	const processes = useMemo(() => transformTopProcessesData(data), [data]);
	const [sortKey, setSortKey] = useState<SortKey>("cpu_pct");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		if (!search) return processes;
		const q = search.toLowerCase();
		return processes.filter(
			(p) =>
				p.name.toLowerCase().includes(q) ||
				p.cmd.toLowerCase().includes(q) ||
				p.user.toLowerCase().includes(q),
		);
	}, [processes, search]);

	const sorted = useMemo(
		() => sortProcesses(filtered, sortKey, sortDir),
		[filtered, sortKey, sortDir],
	);

	const handleSort = (key: SortKey) => {
		if (key === sortKey) {
			setSortDir((d) => (d === "desc" ? "asc" : "desc"));
		} else {
			setSortKey(key);
			setSortDir("desc");
		}
	};

	if (processes.length === 0) {
		return (
			<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
				<div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
					No process data
				</div>
			</div>
		);
	}

	const thBase = "px-2 py-1.5 text-right font-medium";

	return (
		<div className="rounded-[var(--radius-card)] bg-secondary p-4 md:p-5">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div className="flex items-center gap-2 text-base font-semibold">
					<Activity className="h-4 w-4" />
					Top Processes
					<span className="text-xs font-normal text-muted-foreground">({processes.length})</span>
				</div>
				<input
					type="text"
					placeholder="Filter by name, cmd, user…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="h-7 w-48 rounded border border-border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
				/>
			</div>

			<div className="overflow-x-auto">
				<table className="w-full text-xs">
					<thead>
						<tr className="border-b border-border text-muted-foreground">
							<th className="px-2 py-1.5 text-left font-medium w-[60px]">PID</th>
							<th className="px-2 py-1.5 text-left font-medium w-[120px]">Name</th>
							<th className="px-2 py-1.5 text-left font-medium w-[80px]">User</th>
							<th className="px-2 py-1.5 text-center font-medium w-[50px]">State</th>
							<SortTh
								label="CPU%"
								sortKey="cpu_pct"
								activeSortKey={sortKey}
								sortDir={sortDir}
								onSort={handleSort}
								className={`${thBase} w-[70px]`}
							/>
							<SortTh
								label="Memory"
								sortKey="mem_rss"
								activeSortKey={sortKey}
								sortDir={sortDir}
								onSort={handleSort}
								className={`${thBase} w-[80px]`}
							/>
							<SortTh
								label="Mem%"
								sortKey="mem_pct"
								activeSortKey={sortKey}
								sortDir={sortDir}
								onSort={handleSort}
								className={`${thBase} w-[60px]`}
							/>
							<SortTh
								label="Thr"
								sortKey="num_threads"
								activeSortKey={sortKey}
								sortDir={sortDir}
								onSort={handleSort}
								className={`${thBase} w-[60px]`}
							/>
							<SortTh
								label="I/O R"
								sortKey="io_read_rate"
								activeSortKey={sortKey}
								sortDir={sortDir}
								onSort={handleSort}
								className={`${thBase} w-[70px]`}
							/>
							<SortTh
								label="I/O W"
								sortKey="io_write_rate"
								activeSortKey={sortKey}
								sortDir={sortDir}
								onSort={handleSort}
								className={`${thBase} w-[70px]`}
							/>
							<SortTh
								label="Uptime"
								sortKey="uptime"
								activeSortKey={sortKey}
								sortDir={sortDir}
								onSort={handleSort}
								className={`${thBase} w-[80px]`}
							/>
						</tr>
					</thead>
					<tbody>
						{sorted.map((p) => (
							<tr key={p.pid} className="border-b border-border/50 hover:bg-muted/30">
								<td className="px-2 py-1 font-mono text-muted-foreground">{p.pid}</td>
								<td className="px-2 py-1 truncate max-w-[120px]" title={p.cmd}>
									{p.name}
								</td>
								<td className="px-2 py-1 truncate max-w-[80px] text-muted-foreground">{p.user}</td>
								<td
									className={`px-2 py-1 text-center font-mono font-semibold ${stateColor(p.state)}`}
								>
									{p.state}
								</td>
								<td className={`px-2 py-1 text-right font-mono ${cpuColor(p.cpu_pct)}`}>
									{p.cpu_pct != null ? p.cpu_pct.toFixed(1) : "—"}
								</td>
								<td className="px-2 py-1 text-right font-mono">{formatBytes(p.mem_rss)}</td>
								<td className={`px-2 py-1 text-right font-mono ${memPctColor(p.mem_pct)}`}>
									{p.mem_pct.toFixed(1)}
								</td>
								<td className={`px-2 py-1 text-right font-mono ${threadColor(p.num_threads)}`}>
									{p.num_threads}
								</td>
								<td className="px-2 py-1 text-right font-mono text-muted-foreground">
									{p.io_read_rate != null ? formatBytesRate(p.io_read_rate) : "—"}
								</td>
								<td className="px-2 py-1 text-right font-mono text-muted-foreground">
									{p.io_write_rate != null ? formatBytesRate(p.io_write_rate) : "—"}
								</td>
								<td className="px-2 py-1 text-right font-mono text-muted-foreground">
									{formatUptime(p.uptime)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
