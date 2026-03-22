"use client";

import { TagChip } from "@/components/tag-chip";
import type { TagItem } from "@bat/shared";

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
			{tags.map((tag) => {
				const isActive = selected.includes(tag.id);
				return (
					<span
						key={tag.id}
						className={isActive ? "" : "opacity-40 hover:opacity-70 transition-opacity"}
					>
						<TagChip name={tag.name} color={tag.color} size="sm" onClick={() => onToggle(tag.id)} />
					</span>
				);
			})}
			{selected.length > 0 && (
				<button
					type="button"
					onClick={() => {
						for (const id of selected) {
							onToggle(id);
						}
					}}
					className="text-[10px] text-muted-foreground hover:text-foreground ml-1 transition-colors"
				>
					Clear
				</button>
			)}
		</div>
	);
}
