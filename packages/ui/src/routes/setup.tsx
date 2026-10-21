import { Code, CodeBlock } from "@nocoo/basalt/components/code";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@nocoo/basalt/components/collapsible";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { AlertTriangle, Terminal } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetup } from "@/hooks";

export function SetupPage() {
	const { data: config, error, isLoading } = useSetup();

	// Worker URL from API, with fallback for loading state
	const workerUrl = config?.worker_url ?? "https://bat-ingest.worker.hexly.ai";
	// Write key is NOT returned by API for security — use placeholder
	const writeKeyPlaceholder = "YOUR_WRITE_KEY";

	// Install script URL (served from R2, not from this worker)
	const installScriptUrl = "https://s.zhe.to/apps/bat/latest/install.sh";

	const installCmd = `curl -fsSL ${installScriptUrl} | bash -s -- \\
  --url '${workerUrl}' \\
  --key '${writeKeyPlaceholder}'`;

	const uninstallCmd = `curl -fsSL ${installScriptUrl} | bash -s -- --uninstall`;

	return isLoading && !config ? (
		<div className="space-y-4">
			<Skeleton className="h-8 w-48" />
			<Skeleton className="h-32 w-full" />
			<Skeleton className="h-32 w-full" />
		</div>
	) : error && !config ? (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<AlertTriangle className="h-12 w-12 mb-4 text-basalt-destructive" strokeWidth={1} />
			<h2 className="text-basalt-lg font-semibold text-basalt-foreground">
				Failed to load setup configuration
			</h2>
			<p className="mt-2 text-basalt-base">{error.message}</p>
		</div>
	) : (
		<div className="space-y-6 max-w-3xl">
			<PageHeader
				title="Install Probe"
				description="Deploy the monitoring probe on your Linux servers."
			/>

			{/* Prerequisites */}
			<LayerCard>
				<LayerCard.Body>
					<div className="flex items-start gap-3 text-basalt-base text-basalt-muted-foreground">
						<Terminal className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={1.5} />
						<div>
							<p className="font-medium text-basalt-foreground">Prerequisites</p>
							<ul className="mt-1 list-disc list-inside space-y-0.5">
								<li>Linux server (x86_64 or aarch64)</li>
								<li>Root access (sudo)</li>
								<li>systemd-based init system</li>
								<li>curl installed</li>
							</ul>
						</div>
					</div>
				</LayerCard.Body>
			</LayerCard>

			{/* Step 1: Install */}
			<LayerCard>
				<LayerCard.Header>
					<h2>Step 1 — Get your write key</h2>
				</LayerCard.Header>
				<LayerCard.Body>
					<p className="text-basalt-base text-basalt-muted-foreground mb-3">
						Go to Cloudflare Dashboard → Workers &amp; Pages → bat → Settings → Variables, and copy
						the value of <Code>BAT_WRITE_KEY</Code>.
					</p>
				</LayerCard.Body>
			</LayerCard>

			{/* Step 2: Install */}
			<LayerCard>
				<LayerCard.Header>
					<h2>Step 2 — Run the install command</h2>
				</LayerCard.Header>
				<LayerCard.Body>
					<p className="text-basalt-base text-basalt-muted-foreground mb-3">
						Replace <Code>YOUR_WRITE_KEY</Code> with your actual key, then run on your server:
					</p>
					<CodeBlock title="Install command">{installCmd}</CodeBlock>
				</LayerCard.Body>
			</LayerCard>

			{/* Step 3: Verify */}
			<LayerCard>
				<LayerCard.Header>
					<h2>Step 3 — Verify the installation</h2>
				</LayerCard.Header>
				<LayerCard.Body>
					<p className="text-basalt-base text-basalt-muted-foreground mb-3">
						Check that the probe service is running.
					</p>
					<CodeBlock title="Service status">systemctl status bat-probe</CodeBlock>
				</LayerCard.Body>
			</LayerCard>

			<LayerCard>
				<LayerCard.Body>
					<Collapsible>
						<CollapsibleTrigger>Uninstall</CollapsibleTrigger>
						<CollapsibleContent unstyled>
							<p className="text-basalt-base text-basalt-muted-foreground my-3">
								Stops the service and removes the binary. Config at{" "}
								<Code>/etc/bat/config.toml</Code> is preserved.
							</p>
							<CodeBlock title="Uninstall command">{uninstallCmd}</CodeBlock>
						</CollapsibleContent>
					</Collapsible>
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}
