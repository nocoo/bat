// Reachability topology: the workstation as the hub and every authorized server
// as a spoke. Built on React Flow (@xyflow/react) so panning, zooming, edge
// routing and accessibility are library-owned. Colours identify targets, the
// badges carry the honest ICMP result, and answering links carry a travelling
// pulse. The table above remains the accessible, exact source of the numbers.

import {
	Background,
	BackgroundVariant,
	BaseEdge,
	Controls,
	type Edge,
	type EdgeProps,
	getBezierPath,
	Handle,
	type Node,
	type NodeProps,
	Position,
	ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkstationConnectivityStatus } from "@bat/shared";
import { Laptop, Server } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { chartMuted } from "@/lib/palette";
import type { TargetRow } from "@/lib/workstation-detail";
import { statusColor, statusLabel } from "@/lib/workstation-detail";
import { formatRtt } from "@/lib/workstation-format";

const ROW_HEIGHT = 64;
const COLUMN_WIDTH = 320;
const FIRST_COLUMN_X = 330;
const ROWS_PER_COLUMN = 8;

const ANSWERING = new Set<WorkstationConnectivityStatus>(["reachable", "partial"]);

interface WorkstationNodeData extends Record<string, unknown> {
	name: string;
	detail: string;
	reachable: number;
	total: number;
}

interface ServerNodeData extends Record<string, unknown> {
	name: string;
	address: string | null;
	family: 4 | 6 | null;
	status: WorkstationConnectivityStatus;
	rtt: number | null;
	loss: number | null;
	color: string;
	focused: boolean;
}

type ServerNode = Node<ServerNodeData, "server">;
type WorkstationNode = Node<WorkstationNodeData, "workstation">;

function WorkstationNodeView({ data }: NodeProps<WorkstationNode>) {
	return (
		<div className="w-56 rounded-basalt-lg bg-basalt-card p-basalt-space-md shadow-basalt-card ring-1 ring-basalt-border">
			<div className="flex items-center gap-basalt-space-md">
				<span className="flex size-7 items-center justify-center rounded-basalt-md bg-basalt-primary/10 text-basalt-primary">
					<Laptop aria-hidden="true" className="size-4" strokeWidth={1.5} />
				</span>
				<div className="min-w-0">
					<p className="truncate text-basalt-base font-medium">{data.name}</p>
					<p className="truncate text-basalt-sm text-basalt-muted-foreground">{data.detail}</p>
				</div>
			</div>
			<p className="mt-basalt-space-md flex items-baseline justify-between border-t border-basalt-border pt-basalt-space-sm text-basalt-sm">
				<span className="text-basalt-muted-foreground">Answering</span>
				<span className="font-mono tabular-nums">
					{data.reachable}/{data.total}
				</span>
			</p>
			<Handle type="source" position={Position.Right} className="!opacity-0" />
		</div>
	);
}

function ServerNodeView({ data }: NodeProps<ServerNode>) {
	const answering = ANSWERING.has(data.status);
	return (
		<div
			className={[
				"w-64 rounded-basalt-md bg-basalt-card px-basalt-space-md py-basalt-space-sm ring-1 transition-shadow duration-150",
				data.focused ? "ring-basalt-primary" : "ring-basalt-border",
				data.focused ? "shadow-basalt-popover" : "shadow-basalt-card",
				answering ? "" : "opacity-90",
			].join(" ")}
		>
			<Handle type="target" position={Position.Left} className="!opacity-0" />
			<div className="flex items-center gap-basalt-space-md">
				<span
					aria-hidden="true"
					className="size-2 shrink-0 rounded-basalt-full"
					style={{ backgroundColor: data.color }}
				/>
				<p className="min-w-0 flex-1 truncate text-basalt-base font-medium" title={data.name}>
					{data.name}
				</p>
				<span className="font-mono text-basalt-sm tabular-nums">{formatRtt(data.rtt)}</span>
			</div>
			<div className="mt-basalt-space-xs flex items-center justify-between gap-basalt-space-md text-basalt-sm">
				<span className="flex min-w-0 items-center gap-basalt-space-sm text-basalt-muted-foreground">
					<Server aria-hidden="true" className="size-3 shrink-0" strokeWidth={1.5} />
					<span className="truncate font-mono">
						{data.address ?? "no address"}
						{data.family !== null ? ` v${data.family}` : ""}
					</span>
				</span>
				<span className="flex shrink-0 items-center gap-basalt-space-sm">
					<span
						className="size-1.5 rounded-basalt-full"
						style={{ backgroundColor: statusColor(data.status) }}
						aria-hidden="true"
					/>
					<span className="text-basalt-muted-foreground">
						{statusLabel(data.status)}
						{data.loss !== null && data.loss > 0 ? ` · ${Math.round(data.loss)}%` : ""}
					</span>
				</span>
			</div>
		</div>
	);
}

interface PulseEdgeData extends Record<string, unknown> {
	color: string;
	status: WorkstationConnectivityStatus;
	loss: number | null;
	rtt: number | null;
}

type PulseEdgeType = Edge<PulseEdgeData, "pulse">;

function PulseEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data,
	selected,
}: EdgeProps<PulseEdgeType>) {
	const [path] = getBezierPath({
		sourceX,
		sourceY,
		sourcePosition,
		targetX,
		targetY,
		targetPosition,
		curvature: 0.25,
	});
	const status = data?.status ?? "unsupported";
	const answering = ANSWERING.has(status);
	const color = data?.color ?? "currentColor";
	const dashed = !answering;
	const [animated, setAnimated] = useState(true);

	useEffect(() => {
		const media = window.matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => setAnimated(!media.matches);
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	return (
		<>
			<BaseEdge
				id={id}
				path={path}
				style={{
					stroke: color,
					strokeWidth: selected ? 2.4 : 1.6,
					strokeDasharray: dashed ? "5 4" : undefined,
					strokeOpacity: answering ? 0.85 : 0.4,
				}}
			/>
			{answering && animated && (
				<circle r={3.2} fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }}>
					<animateMotion dur="2.6s" repeatCount="indefinite" path={path} rotate="auto" />
				</circle>
			)}
		</>
	);
}

/** React Flow paints its own `light`/`dark` class, and a stray `light` would
 * re-declare the Basalt palette inside the canvas. Follow the document instead. */
function useDocumentTheme(): "light" | "dark" {
	const [dark, setDark] = useState(false);
	useEffect(() => {
		const root = document.documentElement;
		const update = () => setDark(root.classList.contains("dark"));
		update();
		const observer = new MutationObserver(update);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);
	return dark ? "dark" : "light";
}

const nodeTypes = { workstation: WorkstationNodeView, server: ServerNodeView };
const edgeTypes = { pulse: PulseEdge };

export function TopologyGraph({
	name,
	rows,
	detail,
	focusedServerId,
	onFocus,
}: {
	name: string;
	rows: readonly TargetRow[];
	detail: string;
	focusedServerId: string | null;
	onFocus: (serverId: string) => void;
}) {
	const answering = rows.filter((row) => ANSWERING.has(row.status)).length;
	const colorMode = useDocumentTheme();
	const { nodes, edges } = useMemo(() => {
		const hubY = (Math.min(rows.length, ROWS_PER_COLUMN) - 1) * (ROW_HEIGHT / 2);
		const nodeList: (WorkstationNode | ServerNode)[] = [
			{
				id: "workstation",
				type: "workstation",
				position: { x: 0, y: Math.max(0, hubY) },
				data: { name, detail, reachable: answering, total: rows.length },
				draggable: false,
			},
			...rows.map((row, index) => ({
				id: row.serverId,
				type: "server" as const,
				position: {
					x: FIRST_COLUMN_X + Math.floor(index / ROWS_PER_COLUMN) * COLUMN_WIDTH,
					y: (index % ROWS_PER_COLUMN) * ROW_HEIGHT,
				},
				data: {
					name: row.name,
					address: row.address,
					family: row.family,
					status: row.status,
					rtt: row.last,
					loss: row.lossPct,
					color: row.color,
					focused: row.serverId === focusedServerId,
				},
				draggable: false,
			})),
		];
		const edgeList: PulseEdgeType[] = rows.map((row) => ({
			id: `edge-${row.serverId}`,
			source: "workstation",
			target: row.serverId,
			type: "pulse" as const,
			data: {
				color: ANSWERING.has(row.status) ? row.color : chartMuted,
				status: row.status,
				loss: row.lossPct,
				rtt: row.last,
			},
		}));
		return { nodes: nodeList, edges: edgeList };
	}, [rows, name, detail, answering, focusedServerId]);

	return (
		<div className="basalt-topology h-[380px] w-full overflow-hidden rounded-basalt-md bg-basalt-secondary/40 sm:h-[520px]">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				colorMode={colorMode}
				fitView={true}
				fitViewOptions={{ padding: 0.14 }}
				minZoom={0.3}
				maxZoom={1.4}
				zoomOnScroll={false}
				zoomOnDoubleClick={false}
				nodesConnectable={false}
				nodesDraggable={false}
				nodesFocusable={false}
				edgesFocusable={false}
				elementsSelectable={false}
				onNodeClick={(_, node) => {
					if (node.type === "server") {
						onFocus(node.id);
					}
				}}
				aria-label="Workstation to server reachability graph"
			>
				<Background variant={BackgroundVariant.Dots} gap={16} size={1} />
				<Controls showInteractive={false} />
			</ReactFlow>
		</div>
	);
}
