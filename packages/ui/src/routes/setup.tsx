import { AppShell } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSetup } from "@/hooks";
import { AlertTriangle, ChevronRight, Copy, Terminal } from "lucide-react";
import { useCallback, useState } from "react";

function CodeBlock({ code, language }: { code: string; language: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		await navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [code]);

	return (
		<div className="relative">
			<pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
				<code className={`language-${language}`}>{code}</code>
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
	);
}

export function SetupPage() {
	const { data: config, error, isLoading } = useSetup();
	const [uninstallOpen, setUninstallOpen] = useState(false);

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

	return (
		<AppShell breadcrumbs={[{ label: "Setup" }]}>
			{isLoading && !config ? (
				<div className="space-y-4">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-32 w-full" />
					<Skeleton className="h-32 w-full" />
				</div>
			) : error && !config ? (
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
							<CardTitle className="text-base">Step 1 — Get your write key</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground mb-3">
								Go to Cloudflare Dashboard → Workers &amp; Pages → bat → Settings → Variables, and
								copy the value of{" "}
								<code className="text-xs bg-muted px-1 py-0.5 rounded">BAT_WRITE_KEY</code>.
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
								Replace <code className="text-xs bg-muted px-1 py-0.5 rounded">YOUR_WRITE_KEY</code>{" "}
								with your actual key, then run on your server:
							</p>
							<CodeBlock code={installCmd} language="bash" />
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
							<CodeBlock code="systemctl status bat-probe" language="bash" />
						</CardContent>
					</Card>

					{/* Uninstall (collapsible) */}
					<Card>
						<button
							type="button"
							onClick={() => setUninstallOpen(!uninstallOpen)}
							className="w-full cursor-pointer select-none hover:bg-accent/50 transition-colors rounded-t-card"
						>
							<CardHeader>
								<CardTitle className="text-base flex items-center gap-2">
									<ChevronRight
										className={`h-4 w-4 transition-transform ${uninstallOpen ? "rotate-90" : ""}`}
									/>
									Uninstall
								</CardTitle>
							</CardHeader>
						</button>
						{uninstallOpen && (
							<CardContent>
								<p className="text-sm text-muted-foreground mb-3">
									Stops the service and removes the binary. Config at{" "}
									<code className="text-xs bg-muted px-1 py-0.5 rounded">/etc/bat/config.toml</code>{" "}
									is preserved.
								</p>
								<CodeBlock code={uninstallCmd} language="bash" />
							</CardContent>
						)}
					</Card>
				</div>
			)}
		</AppShell>
	);
}
