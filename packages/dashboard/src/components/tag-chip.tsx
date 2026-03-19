"use client";

import { getBadgeStyleByIndex } from "@/lib/palette";
import { X } from "lucide-react";

interface TagChipProps {
	name: string;
	color: number;
	onRemove?: () => void;
	onClick?: () => void;
	size?: "sm" | "md";
}

export function TagChip({ name, color, onRemove, onClick, size = "sm" }: TagChipProps) {
	const style = getBadgeStyleByIndex(color);

	return (
		<span
			className={`inline-flex items-center gap-1 rounded-full font-medium ${
				size === "sm" ? "text-xs px-2 py-0.5" : "text-xs px-2.5 py-0.5"
			} ${onClick ? "cursor-pointer hover:opacity-80" : ""}`}
			style={style}
			onClick={onClick}
			onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
			role={onClick ? "button" : undefined}
			tabIndex={onClick ? 0 : undefined}
		>
			{name}
			{onRemove && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					className="hover:opacity-70 -mr-0.5"
					aria-label={`Remove tag ${name}`}
				>
					<X className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} strokeWidth={2} />
				</button>
			)}
		</span>
	);
}
