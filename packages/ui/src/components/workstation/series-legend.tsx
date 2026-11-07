// Shared legend row for the workstation charts: a colour identity, a name and
// the current reading, optionally acting as a focus control.

export interface LegendItem {
	label: string;
	color: string;
	value: string;
	active?: boolean;
	onSelect?: () => void;
}

export function SeriesLegend({ items, label }: { items: readonly LegendItem[]; label?: string }) {
	return (
		<ul
			aria-label={label}
			className="flex flex-wrap items-center gap-x-basalt-space-md gap-y-basalt-space-xs"
		>
			{items.map((item) => (
				<li key={item.label}>
					{item.onSelect ? (
						<button
							type="button"
							onClick={item.onSelect}
							aria-pressed={item.active ?? false}
							className="flex items-center gap-basalt-space-md rounded-basalt-sm px-basalt-space-sm py-basalt-space-xs text-basalt-sm transition-colors duration-150 hover:bg-basalt-hover focus-visible:bg-basalt-hover"
						>
							<span
								aria-hidden="true"
								className="size-2 shrink-0 rounded-basalt-full"
								style={{ backgroundColor: item.color }}
							/>
							<span className="max-w-40 truncate">{item.label}</span>
							<span className="font-mono tabular-nums text-basalt-muted-foreground">
								{item.value}
							</span>
						</button>
					) : (
						<span className="flex items-center gap-basalt-space-md px-basalt-space-sm text-basalt-sm">
							<span
								aria-hidden="true"
								className="size-2 shrink-0 rounded-basalt-full"
								style={{ backgroundColor: item.color }}
							/>
							<span>{item.label}</span>
							<span className="font-mono tabular-nums text-basalt-muted-foreground">
								{item.value}
							</span>
						</span>
					)}
				</li>
			))}
		</ul>
	);
}
