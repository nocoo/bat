import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { WebhookConfig } from "@bat/shared";
import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";

interface WebhookConfigRowProps {
	config: WebhookConfig & { hostname: string };
	workerUrl: string;
	onRegenerate: (id: number) => Promise<void>;
	onDelete: (id: number) => Promise<void>;
}

function maskToken(token: string): string {
	if (token.length <= 8) return token;
	return `${token.slice(0, 4)}${"•".repeat(24)}${token.slice(-4)}`;
}

export function WebhookConfigRow({
	config,
	workerUrl,
	onRegenerate,
	onDelete,
}: WebhookConfigRowProps) {
	const [showToken, setShowToken] = useState(false);
	const [copied, setCopied] = useState<"token" | "curl" | null>(null);
	const [regenerating, setRegenerating] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const curlExample = `curl -X POST ${workerUrl}/api/events \\
  -H "Authorization: Bearer ${config.token}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"deploy completed","body":{"version":"1.0.0"},"tags":["deploy"]}'`;

	const handleCopy = useCallback(async (text: string, type: "token" | "curl") => {
		await navigator.clipboard.writeText(text);
		setCopied(type);
		setTimeout(() => setCopied(null), 2000);
	}, []);

	const handleRegenerate = useCallback(async () => {
		setRegenerating(true);
		try {
			await onRegenerate(config.id);
		} finally {
			setRegenerating(false);
		}
	}, [config.id, onRegenerate]);

	const handleDelete = useCallback(async () => {
		setDeleting(true);
		try {
			await onDelete(config.id);
		} finally {
			setDeleting(false);
		}
	}, [config.id, onDelete]);

	return (
		<div className="flex flex-col gap-2 py-3 px-1">
			<div className="flex items-center gap-3">
				{/* Hostname */}
				<span className="text-sm font-medium min-w-[120px]">{config.hostname}</span>

				{/* Token */}
				<button
					type="button"
					className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors"
					onClick={() => setShowToken(!showToken)}
				>
					{showToken ? config.token : maskToken(config.token)}
				</button>

				{/* Copy token */}
				<button
					type="button"
					onClick={() => handleCopy(config.token, "token")}
					className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
					aria-label="Copy token"
				>
					{copied === "token" ? (
						<Check className="h-3 w-3 text-green-500" strokeWidth={1.5} />
					) : (
						<Copy className="h-3 w-3" strokeWidth={1.5} />
					)}
				</button>

				<div className="flex-1" />

				{/* Rate limit */}
				<Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal tabular-nums">
					{config.rate_limit}/min
				</Badge>

				{/* Status */}
				<Badge
					variant={config.is_active ? "default" : "secondary"}
					className="text-[10px] px-1.5 py-0"
				>
					{config.is_active ? "Active" : "Inactive"}
				</Badge>

				{/* Actions */}
				<Button
					variant="ghost"
					size="sm"
					className="h-7 px-2 text-xs"
					onClick={handleRegenerate}
					disabled={regenerating}
				>
					<RefreshCw
						className={`h-3 w-3 mr-1 ${regenerating ? "animate-spin" : ""}`}
						strokeWidth={1.5}
					/>
					Regenerate
				</Button>
				<button
					type="button"
					onClick={handleDelete}
					disabled={deleting}
					className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
					aria-label={`Delete webhook for ${config.hostname}`}
				>
					<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
			</div>

			{/* Curl example (collapsed by default, toggle on token click) */}
			{showToken && (
				<div className="relative bg-muted/30 rounded-md p-3 ml-[120px]">
					<button
						type="button"
						onClick={() => handleCopy(curlExample, "curl")}
						className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
						aria-label="Copy curl command"
					>
						{copied === "curl" ? (
							<Check className="h-3 w-3 text-green-500" strokeWidth={1.5} />
						) : (
							<Copy className="h-3 w-3" strokeWidth={1.5} />
						)}
					</button>
					<pre className="text-xs font-mono whitespace-pre-wrap break-all text-muted-foreground">
						{curlExample}
					</pre>
				</div>
			)}
		</div>
	);
}
