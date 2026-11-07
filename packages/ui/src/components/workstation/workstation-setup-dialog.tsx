// The step-by-step workstation setup, as a dialog on the list page: each step
// carries one copyable command so an operator can follow it without leaving the
// dashboard or guessing absolute paths.

import { Button } from "@nocoo/basalt/components/button";
import { Code, CodeBlock } from "@nocoo/basalt/components/code";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@nocoo/basalt/components/dialog";
import { Terminal } from "lucide-react";

const STEPS = [
	{
		title: "Install the CLI",
		detail:
			"Node.js 22 or newer. The published package is a single bundle with no install scripts.",
		command: "npm install --global @nocoo/bat",
	},
	{
		title: "Authorize this machine",
		detail:
			"Run it on the laptop itself: it opens the Access consent page and returns a one-time code to a loopback listener. Only this machine's key is issued.",
		command: "bat workstation login",
	},
	{
		title: "Collect one report",
		detail:
			"Proves targets, pinging and upload before anything is scheduled. The first accepted report makes the machine appear here.",
		command: "bat workstation probe",
	},
	{
		title: "Schedule every ten minutes",
		detail:
			"The CLI installs a native per-user schedule: launchd on macOS, a systemd user timer on Linux, Task Scheduler on Windows.",
		command: "bat workstation setup",
	},
	{
		title: "Prefer cron?",
		detail:
			"POSIX systems without systemd must ask for cron explicitly. It writes one marked block with absolute node and entry paths, so cron's minimal PATH does not matter, and appends to ~/.config/bat/workstation/probe.log.",
		command: "bat workstation setup --backend cron",
	},
	{
		title: "Verify",
		detail:
			"Shows the workstation id, the ingest origin, a masked token, the schedule backend and any live probe lock.",
		command: "bat workstation status",
	},
];

const REMOVAL = "bat workstation setup --remove";

const LOGOUT = "bat workstation logout";

export function WorkstationSetupDialog() {
	return (
		<Dialog>
			<DialogTrigger asChild={true}>
				<Button variant="outline" size="sm">
					<Terminal aria-hidden="true" />
					CLI setup
				</Button>
			</DialogTrigger>
			<DialogContent size="xl" className="max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Add a workstation</DialogTitle>
					<DialogDescription>
						Run these commands on the laptop or desktop itself. The browser step is the account
						consent; the machine keeps only a dedicated <Code>batw_</Code> key under{" "}
						<Code>~/.config/bat/workstation/</Code>.
					</DialogDescription>
				</DialogHeader>

				<ol className="mt-basalt-card space-y-basalt-layout-lg">
					{STEPS.map((step, index) => (
						<li
							key={step.title}
							className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-basalt-space-md"
						>
							<span className="flex size-basalt-control-sm items-center justify-center rounded-basalt-full bg-basalt-secondary text-basalt-sm font-medium tabular-nums">
								{index + 1}
							</span>
							<div className="min-w-0 space-y-basalt-space-md">
								<div className="space-y-basalt-space-xs">
									<p className="font-medium">{step.title}</p>
									<p className="text-basalt-sm text-basalt-muted-foreground">{step.detail}</p>
								</div>
								<CodeBlock title="bash">{step.command}</CodeBlock>
							</div>
						</li>
					))}
				</ol>

				<div className="mt-basalt-layout space-y-basalt-space-md border-t border-basalt-border pt-basalt-layout">
					<p className="text-basalt-sm text-basalt-muted-foreground">
						Removing the schedule keeps the enrollment; logging out revokes the key first and
						refuses to delete it locally if the server cannot confirm.
					</p>
					<p className="text-basalt-sm text-basalt-muted-foreground">
						On macOS, if <Code>probe.log</Code> reports permission errors for a volume, grant Full
						Disk Access to <Code>/usr/sbin/cron</Code>.
					</p>
					<CodeBlock title="bash">{REMOVAL}</CodeBlock>
					<CodeBlock title="bash">{LOGOUT}</CodeBlock>
				</div>
			</DialogContent>
		</Dialog>
	);
}
