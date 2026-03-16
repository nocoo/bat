"use client";

import { AppShell } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeBlock } from "@/components/ui/code-block";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetup } from "@/lib/hooks";
import { AlertTriangle, ChevronRight, Terminal } from "lucide-react";

/** Escape a string for use inside single quotes in a shell command. */
function shellEscape(s: string): string {
	return s.replace(/'/g, "'\\''");
}

export default function SetupPage() {
	const { data: config, error, isLoading } = useSetup();

	const installCmd =
		config &&
		`curl -fsSL ${config.dashboard_url}/api/probe/install.sh | bash -s -- \\
  --url '${shellEscape(config.worker_url)}' \\
  --key '${shellEscape(config.write_key)}'`;

	const uninstallCmd =
		config && `curl -fsSL ${config.dashboard_url}/api/probe/install.sh | bash -s -- --uninstall`;

	return (
		<AppShell breadcrumbs={[{ label: "Setup" }]}>
			{isLoading ? (
				<div className="space-y-4">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-32 w-full" />
				</div>
			) : error ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<AlertTriangle className="h-12 w-12 mb-4 text-destructive" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">
						Failed to load setup configuration
					</h2>
					<p className="mt-2 text-sm">{error.message}</p>
				</div>
			) : (
				<div className="space-y-6 max-w-3xl">
					<div>
						<h1 className="text-2xl font-semibold tracking-tight">Install Probe</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Deploy the monitoring probe on your Linux servers.
						</p>
					</div>

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
							<CardTitle className="text-base">Step 1 — Run the install command</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground mb-3">
								Copy and paste this command on your server. It downloads and installs the probe with
								your pre-filled credentials.
							</p>
							{installCmd && <CodeBlock code={installCmd} language="bash" />}
						</CardContent>
					</Card>

					{/* Step 2: Verify */}
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Step 2 — Verify the installation</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground mb-3">
								Check that the probe service is running.
							</p>
							<CodeBlock code="systemctl status bat-probe" language="bash" />
						</CardContent>
					</Card>

					{/* Uninstall (collapsible) */}
					<Collapsible>
						<Card>
							<CollapsibleTrigger asChild>
								<CardHeader className="cursor-pointer select-none hover:bg-accent/50 transition-colors rounded-t-[var(--radius-card)]">
									<CardTitle className="text-base flex items-center gap-2">
										<ChevronRight className="h-4 w-4 transition-transform [[data-state=open]>&]:rotate-90" />
										Uninstall
									</CardTitle>
								</CardHeader>
							</CollapsibleTrigger>
							<CollapsibleContent>
								<CardContent>
									<p className="text-sm text-muted-foreground mb-3">
										Stops the service and removes the binary. Config at{" "}
										<code className="text-xs bg-muted px-1 py-0.5 rounded">
											/etc/bat/config.toml
										</code>{" "}
										is preserved.
									</p>
									{uninstallCmd && <CodeBlock code={uninstallCmd} language="bash" />}
								</CardContent>
							</CollapsibleContent>
						</Card>
					</Collapsible>
				</div>
			)}
		</AppShell>
	);
}
