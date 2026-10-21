import type { WebhookConfig } from "@bat/shared";
import { Button } from "@nocoo/basalt";
import { CodeBlock } from "@nocoo/basalt/components/code";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import { AlertTriangle, Plus, RefreshCw, Trash2, Webhook } from "lucide-react";
import { useCallback, useState } from "react";
import { deleteAPI, postAPI } from "@/api";
import { Skeleton } from "@/components/ui/skeleton";
import { useHosts, useSetup, useWebhooks } from "@/hooks";
import {
	buildCurlCommand,
	displayWebhookHostname,
	filterAvailableHosts,
} from "@/lib/webhooks-format";

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

	return isLoading && !webhooks ? (
		<LayerCard>
			<LayerCard.Body className="py-6 space-y-4">
				{Array.from({ length: 3 }, (_, i) => (
					<Skeleton key={`wh-skeleton-${i.toString()}`} className="h-12 w-full" />
				))}
			</LayerCard.Body>
		</LayerCard>
	) : error && !webhooks ? (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<AlertTriangle className="h-12 w-12 mb-4 text-basalt-destructive" strokeWidth={1} />
			<h2 className="text-basalt-lg font-semibold text-basalt-foreground">
				Failed to load webhooks
			</h2>
			<p className="mt-2 text-basalt-base">{error.message}</p>
		</div>
	) : (
		<div className="space-y-4 max-w-4xl" data-bat-dirty={!!selectedHostId}>
			<PageHeader
				title="Webhooks"
				description="Configure webhook tokens for hosts to send events via POST /api/events."
			/>

			{/* Action error banner */}
			{actionError && (
				<div className="rounded-md border border-basalt-destructive/50 bg-basalt-destructive/10 px-4 py-3 text-basalt-base text-basalt-destructive">
					{actionError}
				</div>
			)}

			{/* Create new webhook */}
			<LayerCard>
				<LayerCard.Body>
					<form
						className="flex items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							handleCreate();
						}}
					>
						<Plus className="h-4 w-4 text-basalt-muted-foreground shrink-0" strokeWidth={1.5} />
						<Select value={selectedHostId} onValueChange={setSelectedHostId} disabled={creating}>
							<SelectTrigger aria-label="Webhook host" className="flex-1 min-w-0">
								<SelectValue placeholder="Select a host..." />
							</SelectTrigger>
							<SelectContent>
								{availableHosts.map((h) => (
									<SelectItem key={h.host_id} value={h.host_id}>
										{h.hostname}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button type="submit" disabled={creating || !selectedHostId}>
							{creating ? "Creating..." : "Generate"}
						</Button>
					</form>
				</LayerCard.Body>
			</LayerCard>

			{/* Webhook list */}
			{!webhooks || webhooks.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
					<Webhook className="h-12 w-12 mb-4" strokeWidth={1} />
					<h2 className="text-basalt-lg font-semibold text-basalt-foreground">
						No webhooks configured
					</h2>
					<p className="mt-2 text-basalt-base">Select a host above to generate a webhook token.</p>
				</div>
			) : (
				<LayerCard>
					<LayerCard.Body>
						<div className="divide-y divide-basalt-border">
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
					</LayerCard.Body>
				</LayerCard>
			)}
		</div>
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

	const curlCommand = buildCurlCommand(workerUrl, config.token);

	return (
		<div className="py-3 px-1" data-testid="webhook-row">
			<div className="flex items-center justify-between mb-2">
				<span className="font-medium">{displayName}</span>
				<div className="flex items-center gap-1">
					<Button
						type="button"
						onClick={() => onRegenerate(config.id)}
						variant="ghost"
						size="icon"
						aria-label="Regenerate token"
					>
						<RefreshCw className="h-3.5 w-3.5" strokeWidth={1.5} />
					</Button>
					<Button
						type="button"
						onClick={() => onDelete(config.id)}
						variant="ghost"
						size="icon"
						aria-label="Delete webhook"
					>
						<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
					</Button>
				</div>
			</div>
			<CodeBlock title="Webhook command">{curlCommand}</CodeBlock>
		</div>
	);
}
