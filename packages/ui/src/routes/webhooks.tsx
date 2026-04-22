import { deleteAPI, postAPI } from "@/api";
import { AppShell } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHosts, useSetup, useWebhooks } from "@/hooks";
import {
	buildCurlCommand,
	displayWebhookHostname,
	filterAvailableHosts,
} from "@/lib/webhooks-format";
import type { WebhookConfig } from "@bat/shared";
import { AlertTriangle, Copy, Plus, RefreshCw, Trash2, Webhook } from "lucide-react";
import { useCallback, useState } from "react";

export function WebhooksPage() {
	const { data: webhooks, error, isLoading, mutate } = useWebhooks();
	const { data: hosts } = useHosts();
	const { data: setupConfig } = useSetup();
	const [selectedHostId, setSelectedHostId] = useState("");
	const [creating, setCreating] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	const availableHosts = filterAvailableHosts(hosts, webhooks);

	const workerUrl = setupConfig?.worker_url ?? "";

	const handleCreate = useCallback(async () => {
		if (!selectedHostId) {
			return;
		}
		setCreating(true);
		setActionError(null);
		try {
			await postAPI("/api/webhooks", { host_id: selectedHostId });
			setSelectedHostId("");
			await mutate();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Failed to create webhook");
		} finally {
			setCreating(false);
		}
	}, [selectedHostId, mutate]);

	const handleRegenerate = useCallback(
		async (id: number) => {
			setActionError(null);
			try {
				await postAPI(`/api/webhooks/${id}/regenerate`);
				await mutate();
			} catch (err) {
				setActionError(err instanceof Error ? err.message : "Failed to regenerate token");
			}
		},
		[mutate],
	);

	const handleDelete = useCallback(
		async (id: number) => {
			setActionError(null);
			try {
				await deleteAPI(`/api/webhooks/${id}`);
				await mutate();
			} catch (err) {
				setActionError(err instanceof Error ? err.message : "Failed to delete webhook");
			}
		},
		[mutate],
	);

	return (
		<AppShell breadcrumbs={[{ label: "Settings" }, { label: "Webhooks" }]}>
			{isLoading && !webhooks ? (
				<Card>
					<CardContent className="py-6 space-y-4">
						{Array.from({ length: 3 }, (_, i) => (
							<Skeleton key={`wh-skeleton-${i.toString()}`} className="h-12 w-full" />
						))}
					</CardContent>
				</Card>
			) : error && !webhooks ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<AlertTriangle className="h-12 w-12 mb-4 text-destructive" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">Failed to load webhooks</h2>
					<p className="mt-2 text-sm">{error.message}</p>
				</div>
			) : (
				<div className="space-y-4 max-w-4xl">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">Webhooks</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Configure webhook tokens for hosts to send events via POST /api/events.
						</p>
					</div>

					{/* Action error banner */}
					{actionError && (
						<div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
							{actionError}
						</div>
					)}

					{/* Create new webhook */}
					<Card>
						<CardContent className="py-3">
							<form
								className="flex items-center gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									handleCreate();
								}}
							>
								<Plus className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
								<select
									value={selectedHostId}
									onChange={(e) => setSelectedHostId(e.target.value)}
									className="h-8 text-sm flex-1 rounded-md border border-border bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								>
									<option value="">Select a host...</option>
									{availableHosts.map((h) => (
										<option key={h.host_id} value={h.host_id}>
											{h.hostname}
										</option>
									))}
								</select>
								<button
									type="submit"
									disabled={creating || !selectedHostId}
									className="h-8 px-3 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
								>
									{creating ? "Creating..." : "Generate"}
								</button>
							</form>
						</CardContent>
					</Card>

					{/* Webhook list */}
					{!webhooks || webhooks.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
							<Webhook className="h-12 w-12 mb-4" strokeWidth={1} />
							<h2 className="text-lg font-semibold text-foreground">No webhooks configured</h2>
							<p className="mt-2 text-sm">Select a host above to generate a webhook token.</p>
						</div>
					) : (
						<Card>
							<CardContent className="py-2">
								<div className="divide-y divide-border">
									{webhooks.map((wh) => (
										<WebhookConfigRow
											key={wh.id}
											config={wh}
											workerUrl={workerUrl}
											onRegenerate={handleRegenerate}
											onDelete={handleDelete}
										/>
									))}
								</div>
							</CardContent>
						</Card>
					)}
				</div>
			)}
		</AppShell>
	);
}

interface WebhookConfigRowProps {
	config: WebhookConfig;
	workerUrl: string;
	onRegenerate: (id: number) => void;
	onDelete: (id: number) => void;
}

function WebhookConfigRow({ config, workerUrl, onRegenerate, onDelete }: WebhookConfigRowProps) {
	const { data: hosts } = useHosts();
	const displayName = displayWebhookHostname(hosts, config.host_id);
	const [copied, setCopied] = useState(false);

	const curlCommand = buildCurlCommand(workerUrl, config.token);

	const handleCopy = useCallback(async () => {
		await navigator.clipboard.writeText(curlCommand);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [curlCommand]);

	return (
		<div className="py-3 px-1">
			<div className="flex items-center justify-between mb-2">
				<span className="font-medium">{displayName}</span>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => onRegenerate(config.id)}
						className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
						aria-label="Regenerate token"
					>
						<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
					<button
						type="button"
						onClick={() => onDelete(config.id)}
						className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
						aria-label="Delete webhook"
					>
						<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				</div>
			</div>
			<div className="relative">
				<pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
					{curlCommand}
				</pre>
				<button
					type="button"
					onClick={handleCopy}
					className="absolute top-2 right-2 h-6 w-6 flex items-center justify-center rounded bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
					aria-label="Copy to clipboard"
				>
					<Copy className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
				{copied && <span className="absolute top-2 right-10 text-xs text-success">Copied!</span>}
			</div>
		</div>
	);
}
