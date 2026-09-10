import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Skeleton({ className, style, ...props }: React.ComponentProps<"div">) {
	return (
		<SkeletonLine
			className={cn("w-full h-full", className)}
			style={{ width: undefined, ...style }}
			{...props}
		/>
	);
}

export { Skeleton };
