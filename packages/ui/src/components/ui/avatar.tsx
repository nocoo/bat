import { Fallback, Image, Root } from "@radix-ui/react-avatar";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: ComponentProps<typeof Root>) {
	return (
		<Root
			data-slot="avatar"
			className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
			{...props}
		/>
	);
}

function AvatarImage({ className, ...props }: ComponentProps<typeof Image>) {
	return (
		<Image
			data-slot="avatar-image"
			className={cn("aspect-square h-full w-full", className)}
			{...props}
		/>
	);
}

function AvatarFallback({ className, ...props }: ComponentProps<typeof Fallback>) {
	return (
		<Fallback
			data-slot="avatar-fallback"
			className={cn(
				"flex h-full w-full items-center justify-center rounded-full bg-muted",
				className,
			)}
			{...props}
		/>
	);
}

export { Avatar, AvatarImage, AvatarFallback };
