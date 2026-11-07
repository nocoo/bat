// Current utilisation as rings: one value each for CPU, memory and the root
// volume. A platform that reports no CPU usage shows a dash, never a 0 ring.

import { Gauge } from "@nocoo/basalt/charts/gauge";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { chart } from "@/lib/palette";
import { formatPercent } from "@/lib/workstation-format";

interface Ring {
	label: string;
	value: number | null;
	detail: string;
	color: string;
}

function RingCell({ ring }: { ring: Ring }) {
	return (
		<div className="flex flex-col items-center gap-basalt-space-xs text-center">
			{ring.value === null ? (
				<div className="flex h-20 w-20 items-center justify-center font-mono text-basalt-xl text-basalt-muted-foreground">
					—
				</div>
			) : (
				<Gauge
					value={ring.value}
					max={100}
					ariaLabel={`${ring.label} utilisation`}
					className="h-20 w-20"
					series={[{ key: "value", color: ring.color }]}
					valueFormatter={(value) => `${Math.round(value)}%`}
				/>
			)}
			<span className="text-basalt-sm font-medium">{ring.label}</span>
			<span className="font-mono text-basalt-sm tabular-nums text-basalt-muted-foreground">
				{formatPercent(ring.value)}
			</span>
			<span className="text-basalt-sm text-basalt-muted-foreground">{ring.detail}</span>
		</div>
	);
}

export function UtilizationCard({
	cpu,
	memory,
	disk,
	memoryDetail,
	diskDetail,
	cpuDetail,
}: {
	cpu: number | null;
	memory: number | null;
	disk: number | null;
	memoryDetail: string;
	diskDetail: string;
	cpuDetail: string;
}) {
	const rings: Ring[] = [
		{ label: "CPU", value: cpu, detail: cpuDetail, color: chart.pink },
		{ label: "Memory", value: memory, detail: memoryDetail, color: chart.sky },
		{ label: "Root disk", value: disk, detail: diskDetail, color: chart.teal },
	];

	return (
		<LayerCard>
			<LayerCard.Header>
				<h2>Utilisation</h2>
			</LayerCard.Header>
			<LayerCard.Body>
				<div className="grid grid-cols-3 gap-basalt-space-md">
					{rings.map((ring) => (
						<RingCell key={ring.label} ring={ring} />
					))}
				</div>
			</LayerCard.Body>
		</LayerCard>
	);
}
