import { Code, CodeBlock } from "@nocoo/basalt/components/code";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@nocoo/basalt/components/collapsible";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { AlertTriangle, Terminal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
		<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
			<AlertTriangle className="h-12 w-12 mb-4 text-destructive" strokeWidth={1} />
			<h2 className="text-lg font-semibold text-foreground">Failed to load setup configuration</h2>
			<p className="mt-2 text-sm">{error.message}</p>
		</div>
	) : (
		<div className="space-y-6 max-w-3xl">
			<PageHeader
				title="Install Probe"
				description="Deploy the monitoring probe on your Linux servers."
			/>

			{/* Prerequisites */}
			<Card>
				<CardContent className="pt-5">
					<div className="flex items-start gap-3 text-sm text-muted-foreground">
						<Terminal className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={1.5} />
						<div>
							<p className="font-medium text-foreground">Prerequisites</p>
							<ul className="mt-1 list-disc list-inside space-y-0.5">
								<li>Linux server (x86_64 or aarch64)</li>
								<li>Root access (sudo)</li>
								<li>systemd-based init system</li>
								<li>curl installed</li>
							</ul>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Step 1: Install */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Step 1 — Get your write key</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground mb-3">
						Go to Cloudflare Dashboard → Workers &amp; Pages → bat → Settings → Variables, and copy
						the value of <Code>BAT_WRITE_KEY</Code>.
					</p>
				</CardContent>
			</Card>

			{/* Step 2: Install */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Step 2 — Run the install command</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground mb-3">
						Replace <Code>YOUR_WRITE_KEY</Code> with your actual key, then run on your server:
					</p>
					<CodeBlock title="Install command">{installCmd}</CodeBlock>
				</CardContent>
			</Card>

			{/* Step 3: Verify */}
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Step 3 — Verify the installation</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground mb-3">
						Check that the probe service is running.
					</p>
					<CodeBlock title="Service status">systemctl status bat-probe</CodeBlock>
				</CardContent>
			</Card>

			<Card>
				<CardContent>
					<Collapsible>
						<CollapsibleTrigger>Uninstall</CollapsibleTrigger>
						<CollapsibleContent unstyled>
							<p className="text-sm text-muted-foreground my-3">
								Stops the service and removes the binary. Config at{" "}
								<Code>/etc/bat/config.toml</Code> is preserved.
							</p>
							<CodeBlock title="Uninstall command">{uninstallCmd}</CodeBlock>
						</CollapsibleContent>
					</Collapsible>
				</CardContent>
			</Card>
		</div>
	);
}
