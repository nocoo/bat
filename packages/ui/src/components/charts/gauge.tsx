import {
	ANIMATION_PROPS,
	ChartShell,
	chartMuted,
	chartTooltipProps,
	getChartColor,
	RESPONSIVE_CONTAINER_PROPS,
} from "@nocoo/basalt/components/chart";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface GaugeProps {
	value: number;
	max?: number;
	ariaLabel: string;
	className?: string;
	series?: readonly { key: string; color?: string }[];
	valueFormatter?: (value: number) => string;
}

export function Gauge({
	value,
	max = 100,
	ariaLabel,
	className,
	series,
	valueFormatter,
}: GaugeProps) {
	const clamped = Math.min(Math.max(value, 0), max);
	const remainder = Math.max(max - clamped, 0);
	const fillColor = series?.[0]?.color ?? getChartColor(0);
	const tooltipConfig = chartTooltipProps({
		formatter: valueFormatter,
		cursor: false,
	});

	return (
		<ChartShell ariaLabel={ariaLabel} className={className}>
			<ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
				<PieChart>
					<Pie
						data={[
							{ name: "Value", value: clamped },
							{ name: "Remaining", value: remainder },
						]}
						dataKey="value"
						nameKey="name"
						startAngle={90}
						endAngle={-270}
						innerRadius="68%"
						outerRadius="92%"
						strokeWidth={0}
						{...ANIMATION_PROPS}
					>
						<Cell fill={fillColor} />
						<Cell fill={chartMuted} />
					</Pie>
					<Tooltip {...tooltipConfig} />
				</PieChart>
			</ResponsiveContainer>
		</ChartShell>
	);
}
