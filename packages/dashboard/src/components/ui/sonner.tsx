"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster({ ...props }: ToasterProps) {
	return (
		<Sonner
			className="toaster group"
			style={
				{
					"--normal-bg": "hsl(var(--popover))",
					"--normal-text": "hsl(var(--popover-foreground))",
					"--normal-border": "hsl(var(--border))",
					"--success-bg": "hsl(var(--success))",
					"--success-text": "hsl(var(--success-foreground))",
					"--success-border": "hsl(var(--success) / 0.2)",
					"--error-bg": "hsl(var(--destructive))",
					"--error-text": "hsl(var(--destructive-foreground))",
					"--error-border": "hsl(var(--destructive) / 0.2)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
}

export { Toaster };
