import {
	ANIMATION_PROPS,
	ChartFrame,
	ChartLegend,
	type ChartTooltipItem,
	cartesianAxisProps,
	chartTooltipProps,
	getChartColor,
	RESPONSIVE_CONTAINER_PROPS,
} from "@nocoo/basalt/components/chart";
import type { ReactNode } from "react";
import {
	Line,
	LineChart as RechartsLineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

export interface LineChartSeries {
	key: string;
	label?: string;
	color?: string;
}

export interface LineChartProps {
	data: readonly object[];
	series: readonly LineChartSeries[];
	ariaLabel: string;
	className?: string;
	showAxes?: boolean;
	showLegend?: boolean;
	accessibilityLayer?: boolean;
	valueFormatter?: (value: number) => string;
	customTooltip?: (props: {
		active?: boolean;
		payload?: readonly ChartTooltipItem[];
		label?: string | number;
	}) => ReactNode;
}

export function LineChart({
	data,
	series,
	ariaLabel,
	className,
	showAxes = true,
	showLegend = true,
	accessibilityLayer,
	valueFormatter,
	customTooltip,
}: LineChartProps) {
	const tooltipConfig = chartTooltipProps({
		formatter: valueFormatter,
		cursor: "line",
		customTooltip,
	});
	const legendItems = showLegend
		? series.map((item, index) => ({
				key: item.key,
				label: item.label ?? item.key,
				color: item.color ?? getChartColor(index),
			}))
		: [];

	return (
		<ChartFrame
			ariaLabel={ariaLabel}
			className={className}
			accessibilityLayer={accessibilityLayer}
			legend={showLegend ? <ChartLegend items={legendItems} shape="line" /> : undefined}
		>
			<ResponsiveContainer {...RESPONSIVE_CONTAINER_PROPS}>
				<RechartsLineChart data={[...data]} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
					<XAxis dataKey="x" {...cartesianAxisProps(!showAxes)} />
					<YAxis {...cartesianAxisProps(!showAxes)} width={showAxes ? 36 : 0} />
					<Tooltip {...tooltipConfig} />
					{series.map((item, index) => (
						<Line
							key={item.key}
							type="monotone"
							dataKey={item.key}
							name={item.label ?? item.key}
							stroke={item.color ?? getChartColor(index)}
							strokeWidth={2}
							dot={false}
							{...ANIMATION_PROPS}
						/>
					))}
				</RechartsLineChart>
			</ResponsiveContainer>
		</ChartFrame>
	);
}
