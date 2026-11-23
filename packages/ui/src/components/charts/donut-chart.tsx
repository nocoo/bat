import {
	ANIMATION_PROPS,
	ChartFrame,
	ChartLegend,
	chartTooltipProps,
	getChartColor,
	RESPONSIVE_CONTAINER_PROPS,
} from "@nocoo/basalt/components/chart";
import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutChartDatum {
	name: string;
	value: number;
}

export interface DonutChartSeries {
	key: string;
	label?: string;
	color?: string;
}

export interface DonutChartProps {
	data: readonly DonutChartDatum[];
	series?: readonly DonutChartSeries[];
	ariaLabel: string;
	className?: string;
	showLegend?: boolean;
	summary?: ReactNode;
	valueFormatter?: (value: number) => string;
	accessibilityLayer?: boolean;
}

export function DonutChart({
	data,
	series,
	ariaLabel,
	className,
	showLegend = false,
	summary,
	valueFormatter,
	accessibilityLayer,
}: DonutChartProps) {
	const tooltipConfig = chartTooltipProps({
		formatter: valueFormatter,
		cursor: false,
	});
	const legendItems = showLegend
		? data.map((entry, index) => ({
				key: entry.name,
				label: series?.[index]?.label ?? entry.name,
				color: series?.[index]?.color ?? getChartColor(index),
			}))
		: [];

	return (
		<ChartFrame
			ariaLabel={ariaLabel}
			className={className}
			summary={summary}
			accessibilityLayer={accessibilityLayer}
			legend={showLegend ? <ChartLegend items={legendItems} shape="bar" /> : undefined}
		>
			<ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
				<PieChart>
					<Pie
						data={[...data]}
						dataKey="value"
						nameKey="name"
						innerRadius="62%"
						outerRadius="88%"
						strokeWidth={0}
						{...ANIMATION_PROPS}
					>
						{data.map((entry, index) => (
							<Cell key={entry.name} fill={series?.[index]?.color ?? getChartColor(index)} />
						))}
					</Pie>
					<Tooltip {...tooltipConfig} />
				</PieChart>
			</ResponsiveContainer>
		</ChartFrame>
	);
}
