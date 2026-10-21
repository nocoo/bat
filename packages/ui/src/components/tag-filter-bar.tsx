import type { TagItem } from "@bat/shared";
import { Button } from "@nocoo/basalt";
import { getSwatchColor } from "@/lib/palette";

interface TagFilterBarProps {
	tags: TagItem[];
	selected: number[];
	onToggle: (tagId: number) => void;
}

export function TagFilterBar({ tags, selected, onToggle }: TagFilterBarProps) {
	if (tags.length === 0) {
		return null;
	}

	return (
		<div className="flex items-center gap-1.5 flex-wrap" data-testid="tag-filter-bar">
			<span className="text-xs text-muted-foreground mr-0.5">Filter</span>
			{tags.map((tag) => (
				<Button
					key={tag.id}
					variant="outline"
					size="sm"
					aria-pressed={selected.includes(tag.id)}
					onClick={() => onToggle(tag.id)}
				>
					<span
						aria-hidden="true"
						className="size-2 rounded-full"
						style={{ backgroundColor: getSwatchColor(tag.color) }}
					/>
					{tag.name}
				</Button>
			))}
			{selected.length > 0 && (
				<Button
					type="button"
					onClick={() => {
						for (const id of selected) {
							onToggle(id);
						}
					}}
					variant="ghost"
					size="sm"
				>
					Clear
				</Button>
			)}
		</div>
	);
}
