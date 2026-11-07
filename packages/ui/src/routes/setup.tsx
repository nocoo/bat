import { Code, CodeBlock } from "@nocoo/basalt/components/code";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@nocoo/basalt/components/collapsible";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { AlertTriangle, Terminal } from "lucide-react";
import { SkeletonCard } from "@/components/layout/page-skeleton";
import { useSetup } from "@/hooks";

const RELEASE_BASE = "https://s.zhe.to/apps/bat/latest";

/** The one URL an agent needs: version, per-architecture URLs and checksums. */
const MANIFEST_URL = `${RELEASE_BASE}/manifest.json`;

const manifestQuery = `arch=$(uname -m)
curl -fsSL ${MANIFEST_URL} | jq -r ".artifacts.\\$arch.url"`;

const installCmd = `set -euo pipefail
base=${RELEASE_BASE}
arch=$(uname -m)
work=$(mktemp -d)

curl -fsSL -o "$work/bat-probe-linux-$arch" "$base/bat-probe-linux-$arch"
curl -fsSL -o "$work/bat-probe-linux-$arch.sha256" "$base/bat-probe-linux-$arch.sha256"
(cd "$work" && sha256sum -c "bat-probe-linux-$arch.sha256")

install -m 755 "$work/bat-probe-linux-$arch" /usr/local/bin/bat-probe
id -u bat >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin bat
install -d -m 700 -o bat -g bat /etc/bat
curl -fsSL -o /etc/systemd/system/bat-probe.service "$base/bat-probe.service"`;

const configCmd = (workerUrl: string) => `cat > /etc/bat/config.toml <<'TOML'
worker_url = "${workerUrl}"
write_key = "YOUR_WRITE_KEY"
interval = 30
TOML
chown bat:bat /etc/bat/config.toml
chmod 600 /etc/bat/config.toml`;

const startCmd = `systemctl daemon-reload
systemctl enable --now bat-probe
systemctl status bat-probe`;

const uninstallCmd = `systemctl disable --now bat-probe
rm -f /etc/systemd/system/bat-probe.service
systemctl daemon-reload
rm -f /usr/local/bin/bat-probe`;

export function SetupPage() {
	const { data: config, error, isLoading } = useSetup();

	// Worker URL from API, with fallback for loading state
	const workerUrl = config?.worker_url ?? "https://bat-ingest.worker.hexly.ai";

	return isLoading && !config ? (
		<div className="space-y-basalt-layout">
			<PageHeader
				title="Install Probe"
				description="Deploy the monitoring probe on your Linux servers, or link a laptop with the bat CLI."
			/>
			<SkeletonCard lines={4} />
			<SkeletonCard lines={3} />
		</div>
	) : error && !config ? (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<AlertTriangle className="mb-4 h-12 w-12 text-basalt-destructive" strokeWidth={1} />
			<h2 className="text-basalt-xl font-semibold text-basalt-foreground">
				Failed to load setup configuration
			</h2>
			<p className="mt-2 text-basalt-base">{error.message}</p>
		</div>
	) : (
		<div className="space-y-basalt-layout">
			<PageHeader
				title="Install Probe"
				description="Deploy the monitoring probe on your Linux servers, or link a laptop with the bat CLI."
			/>

			<LayerCard>
				<LayerCard.Header>
					<h2>Machine-readable release</h2>
					<span className="text-basalt-sm text-basalt-muted-foreground">
						Always the newest published version
					</span>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-basalt-layout">
					<p className="text-basalt-base text-basalt-muted-foreground">
						Read this manifest instead of hardcoding a version. It carries the version, the
						per-architecture download URLs, their SHA-256 digests and the systemd unit URL:
					</p>
					<CodeBlock title="Manifest">{MANIFEST_URL}</CodeBlock>
					<CodeBlock title="Resolve this host's binary">{manifestQuery}</CodeBlock>
					<p className="text-basalt-sm text-basalt-muted-foreground">
						Fields: <Code>version</Code>, <Code>released_at</Code>,{" "}
						<Code>artifacts.&lt;arch&gt;.url</Code>, <Code>artifacts.&lt;arch&gt;.sha256</Code>,{" "}
						<Code>unit_url</Code>, <Code>config_path</Code> and <Code>binary_path</Code>.
					</p>
				</LayerCard.Body>
			</LayerCard>

			<LayerCard>
				<LayerCard.Header>
					<h2>Prerequisites</h2>
					<span className="text-basalt-sm text-basalt-muted-foreground">
						Linux servers only; laptops use the CLI
					</span>
				</LayerCard.Header>
				<LayerCard.Body>
					<div className="flex items-start gap-basalt-space-md text-basalt-base text-basalt-muted-foreground">
						<Terminal className="mt-basalt-space-xs size-4 shrink-0" strokeWidth={1.5} />
						<div>
							<ul className="list-inside list-disc space-y-basalt-space-xs">
								<li>Linux server (x86_64 or aarch64)</li>
								<li>Root access (sudo)</li>
								<li>systemd-based init system</li>
								<li>curl, and jq if you resolve the manifest</li>
							</ul>
						</div>
					</div>
				</LayerCard.Body>
			</LayerCard>

			<LayerCard>
				<LayerCard.Header>
					<h2>Step 1 — Get your write key</h2>
				</LayerCard.Header>
				<LayerCard.Body>
					<p className="mb-3 text-basalt-base text-basalt-muted-foreground">
						The instance maintainer holds <Code>BAT_WRITE_KEY</Code>. The API never returns it, so
						it cannot be filled in here.
					</p>
				</LayerCard.Body>
			</LayerCard>

			<LayerCard>
				<LayerCard.Header>
					<h2>Step 2 — Install the binary and the unit</h2>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-basalt-layout">
					<p className="text-basalt-base text-basalt-muted-foreground">
						Downloads the newest binary for this architecture, verifies its published checksum and
						installs the probe user, config directory and systemd unit:
					</p>
					<CodeBlock title="Install">{installCmd}</CodeBlock>
				</LayerCard.Body>
			</LayerCard>

			<LayerCard>
				<LayerCard.Header>
					<h2>Step 3 — Configure</h2>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-basalt-layout">
					<p className="text-basalt-base text-basalt-muted-foreground">
						Replace only <Code>YOUR_WRITE_KEY</Code>; the worker URL comes from this deployment. The
						command also sets the probe's owner and permissions:
					</p>
					<CodeBlock title="Config">{configCmd(workerUrl)}</CodeBlock>
				</LayerCard.Body>
			</LayerCard>

			<LayerCard>
				<LayerCard.Header>
					<h2>Step 4 — Start and verify</h2>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-basalt-layout">
					<CodeBlock title="Start">{startCmd}</CodeBlock>
					<p className="text-basalt-sm text-basalt-muted-foreground">
						The unit keeps <Code>AmbientCapabilities=CAP_DAC_READ_SEARCH</Code>, a 15M memory cap
						and a read-only system view. The host appears under Hosts once the first report arrives.
					</p>
				</LayerCard.Body>
			</LayerCard>

			<LayerCard id="workstations">
				<LayerCard.Header>
					<h2>Workstations</h2>
				</LayerCard.Header>
				<LayerCard.Body className="space-y-basalt-layout">
					<p className="text-basalt-base text-basalt-muted-foreground">
						A workstation is your own laptop or desktop. The CLI reports CPU, memory, disk and
						interface addresses, and pings the servers your account can already see. It does not
						install a remote shell or collect process lists and files.
					</p>
					<CodeBlock title="Install the bat CLI">npm install --global @nocoo/bat</CodeBlock>
					<CodeBlock title="Link this machine">bat workstation login</CodeBlock>
					<CodeBlock title="Install the ten minute schedule">bat workstation setup</CodeBlock>
					<p className="text-basalt-sm text-basalt-muted-foreground">
						<Code>bat workstation login</Code> opens a consent page in the browser. Approval returns
						a one-time code to the CLI on this machine; the CLI exchanges it for a dedicated{" "}
						<Code>batw_</Code> key. Run <Code>bat workstation status</Code> to inspect the local
						profile without printing the credential.
					</p>
				</LayerCard.Body>
			</LayerCard>

			<LayerCard>
				<LayerCard.Body>
					<Collapsible>
						<CollapsibleTrigger>Uninstall</CollapsibleTrigger>
						<CollapsibleContent unstyled>
							<p className="my-3 text-basalt-base text-basalt-muted-foreground">
								Stops the service and removes the binary and unit. Config at{" "}
								<Code>/etc/bat/config.toml</Code> is preserved.
							</p>
							<CodeBlock title="Uninstall">{uninstallCmd}</CodeBlock>
						</CollapsibleContent>
					</Collapsible>
				</LayerCard.Body>
			</LayerCard>
		</div>
	);
}
