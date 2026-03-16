"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

interface CodeBlockProps {
	code: string;
	language?: string;
	className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		await navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [code]);

	return (
		<div className={cn("group relative rounded-lg bg-zinc-950 dark:bg-zinc-900", className)}>
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={handleCopy}
				className="absolute right-2 top-2 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-200 hover:bg-zinc-800"
				aria-label="Copy to clipboard"
			>
				{copied ? (
					<Check className="h-3.5 w-3.5 text-green-400" />
				) : (
					<Copy className="h-3.5 w-3.5" />
				)}
			</Button>
			<pre className="overflow-x-auto p-4 text-sm leading-relaxed">
				<code className={cn("text-zinc-200", language && `language-${language}`)}>{code}</code>
			</pre>
		</div>
	);
}
