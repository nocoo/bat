import type { MetricsResolution } from "@bat/shared";
import { Input, LayerCard } from "@nocoo/basalt";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
	TableSortableHeader,
} from "@nocoo/basalt/components/table";
import { Activity } from "lucide-react";
import { useMemo, useState } from "react";
import {
	cpuColor,
	filterProcesses,
	memPctColor,
	nextSortState,
	type SortDir,
	type SortKey,
	sortProcesses,
	stateColor,
	threadColor,
} from "@/lib/top-processes-format";
import {
	formatBytes,
	formatBytesRate,
	formatUptime,
	transformTopProcessesData,
} from "@/lib/transforms";

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
	const sorted = sortKey === activeSortKey ? sortDir : undefined;
	return (
		<TableHead
			className={className}
			textAlign="end"
			aria-sort={sorted ? (sorted === "asc" ? "ascending" : "descending") : "none"}
		>
			<TableSortableHeader sorted={sorted} textAlign="end" onClick={() => onSort(sortKey)}>
				{label}
			</TableSortableHeader>
		</TableHead>
	);
}

export function TopProcessesTable({
	topProcessesJson,
	resolution,
}: {
	topProcessesJson: string | null;
	resolution?: MetricsResolution;
}) {
	const processes = useMemo(() => transformTopProcessesData(topProcessesJson), [topProcessesJson]);
	const [sortKey, setSortKey] = useState<SortKey>("cpu_pct");
	const [sortDir, setSortDir] = useState<SortDir>("desc");
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => filterProcesses(processes, search), [processes, search]);

	const sorted = useMemo(
		() => sortProcesses(filtered, sortKey, sortDir),
		[filtered, sortKey, sortDir],
	);

	const handleSort = (key: SortKey) => {
		const next = nextSortState({ key: sortKey, dir: sortDir }, key);
		setSortKey(next.key);
		setSortDir(next.dir);
	};

	if (processes.length === 0) {
		const isHourly = resolution === "hourly";
		return (
			<LayerCard className="p-4 md:p-5" padding="none">
				<div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm gap-1">
					<span>
						{isHourly
							? "Process snapshots are not available in aggregated views"
							: "No process data"}
					</span>
					{isHourly && <span className="text-xs">Switch to 1h or 6h to see live process data</span>}
				</div>
			</LayerCard>
		);
	}

	const thBase = "text-right";

	return (
		<LayerCard className="p-4 md:p-5" padding="none">
			<div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
				<div className="flex items-center gap-2 text-base font-semibold">
					<Activity className="h-4 w-4" />
					Top Processes
					<span className="text-xs font-normal text-muted-foreground">({processes.length})</span>
				</div>
				<Input
					type="text"
					placeholder="Filter by name, cmd, user…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					className="w-64 max-w-full"
					aria-label="Filter processes"
				/>
			</div>

			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="text-left font-medium w-[60px]">PID</TableHead>
							<TableHead className="text-left font-medium w-[120px]">Name</TableHead>
							<TableHead className="text-left font-medium w-[80px]">User</TableHead>
							<TableHead className="text-center font-medium w-[50px]">State</TableHead>
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
						</TableRow>
					</TableHeader>
					<TableBody>
						{sorted.map((p) => (
							<TableRow key={p.pid}>
								<TableCell className="font-mono tabular-nums text-muted-foreground">
									{p.pid}
								</TableCell>
								<TableCell className="truncate max-w-[120px]" title={p.cmd}>
									{p.name}
								</TableCell>
								<TableCell className="truncate max-w-[80px] text-muted-foreground">
									{p.user}
								</TableCell>
								<TableCell className={`text-center font-mono font-semibold ${stateColor(p.state)}`}>
									{p.state}
								</TableCell>
								<TableCell className={`text-right font-mono tabular-nums ${cpuColor(p.cpu_pct)}`}>
									{p.cpu_pct != null ? p.cpu_pct.toFixed(1) : "—"}
								</TableCell>
								<TableCell className="text-right font-mono tabular-nums">
									{formatBytes(p.mem_rss)}
								</TableCell>
								<TableCell
									className={`text-right font-mono tabular-nums ${memPctColor(p.mem_pct)}`}
								>
									{p.mem_pct.toFixed(1)}
								</TableCell>
								<TableCell
									className={`text-right font-mono tabular-nums ${threadColor(p.num_threads)}`}
								>
									{p.num_threads}
								</TableCell>
								<TableCell className="text-right font-mono tabular-nums text-muted-foreground">
									{p.io_read_rate != null ? formatBytesRate(p.io_read_rate) : "—"}
								</TableCell>
								<TableCell className="text-right font-mono tabular-nums text-muted-foreground">
									{p.io_write_rate != null ? formatBytesRate(p.io_write_rate) : "—"}
								</TableCell>
								<TableCell className="text-right font-mono tabular-nums text-muted-foreground">
									{formatUptime(p.uptime)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</LayerCard>
	);
}
