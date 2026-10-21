import { ChartTooltipContent } from "@nocoo/basalt/charts/tooltip";
import type { Payload } from "recharts/types/component/DefaultTooltipContent";

interface ChartTooltipProps {
	active?: boolean;
	payload?: Payload<number, string>[];
	label?: string | number;
	labelFormatter?: (label: string | number) => string;
	valueFormatter?: (value: number) => string;
}

export function ChartTooltip({
	active,
	payload,
	label,
	labelFormatter = (value) => new Date(Number(value) * 1000).toLocaleString(),
	valueFormatter = (value) => `${value.toFixed(1)}%`,
}: ChartTooltipProps) {
	return (
		<ChartTooltipContent
			active={active}
			label={label == null ? undefined : labelFormatter(label)}
			payload={payload?.map(({ name, value, color, dataKey }) => ({
				name,
				value,
				color,
				dataKey: String(dataKey),
			}))}
			formatter={valueFormatter}
		/>
	);
}
