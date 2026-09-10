import { SkeletonLine } from "@nocoo/basalt/components/skeleton-line";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return <SkeletonLine className={cn("w-full h-full", className)} {...props} />;
}

export { Skeleton };
