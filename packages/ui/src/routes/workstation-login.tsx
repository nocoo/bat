import { Button, Field, Input } from "@nocoo/basalt";
import { AlertTriangle, Laptop, ShieldCheck, Terminal } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { authorizeWorkstationAPI } from "@/api";
import type { WorkstationLoginParams } from "@/lib/workstation-login";
import {
	buildAuthorizeInput,
	parseWorkstationLoginQuery,
	validateWorkstationRedirect,
	workstationMachineLabel,
} from "@/lib/workstation-login";

const SCOPE = [
	"Reports CPU, memory, disk capacity and network interface addresses for this machine.",
	"Pings only the servers your account can already see, three ICMP probes each.",
	"No shell, process list, files, credentials or remote commands.",
	"One report every ten minutes. After 30 minutes without a report it is marked stale, not critical.",
];

function ConsentShell({ children }: { children: React.ReactNode }) {
	return (
		<main className="basalt-ui flex min-h-dvh items-center justify-center bg-basalt-background p-basalt-space-lg">
			<div
				data-basalt-surface-root=""
				className="flex w-full max-w-lg flex-col overflow-hidden rounded-basalt-lg bg-basalt-card ring-1 ring-basalt-border"
			>
				<div className="flex items-center justify-between gap-basalt-space-lg bg-basalt-primary px-basalt-space-lg py-basalt-space-lg">
					<span className="flex items-center gap-basalt-space-md text-basalt-base font-semibold text-basalt-primary-foreground">
						<Laptop aria-hidden="true" className="size-4" strokeWidth={1.5} />
						bat
					</span>
					<span className="text-basalt-xs font-medium uppercase tracking-widest text-basalt-primary-foreground/80">
						Workstation
					</span>
				</div>
				{children}
			</div>
		</main>
	);
}

function ConsentProblem({ message }: { message: string }) {
	return (
		<ConsentShell>
			<div className="space-y-basalt-layout px-basalt-space-lg py-basalt-space-lg">
				<div className="flex items-start gap-basalt-space-lg">
					<AlertTriangle
						aria-hidden="true"
						className="mt-0.5 size-5 shrink-0 text-basalt-destructive"
					/>
					<div className="space-y-basalt-space-sm">
						<h1 className="text-basalt-xl font-semibold">Authorization request rejected</h1>
						<p role="alert" className="text-basalt-sm text-basalt-muted-foreground">
							{message}
						</p>
					</div>
				</div>
				<div className="rounded-basalt-md bg-basalt-secondary p-basalt-layout-sm text-basalt-sm">
					<p className="flex items-center gap-basalt-space-md font-medium">
						<Terminal aria-hidden="true" className="size-4" strokeWidth={1.5} />
						Request a fresh link
					</p>
					<p className="mt-basalt-space-sm text-basalt-muted-foreground">
						Run <code className="font-mono">bat workstation login</code> again. The browser link
						must come from the CLI on the machine you want to enroll.
					</p>
				</div>
			</div>
		</ConsentShell>
	);
}

function ConsentForm({ params }: { params: WorkstationLoginParams }) {
	const [name, setName] = useState(params.name);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [approved, setApproved] = useState(false);
	const [cancelled, setCancelled] = useState(false);
	const machine = workstationMachineLabel(params);
	const callbackOrigin = new URL(params.callback).origin;

	async function approve() {
		if (pending || approved) return;
		setPending(true);
		setError(null);
		let result: Awaited<ReturnType<typeof authorizeWorkstationAPI>>;
		try {
			result = await authorizeWorkstationAPI(buildAuthorizeInput(params, name));
		} catch {
			setError(
				"The authorization request failed. Your account may not permit enrollment, or the request was rejected. Run the CLI command again to retry.",
			);
			setPending(false);
			return;
		}
		const redirect = validateWorkstationRedirect(
			params.callback,
			result.redirect_url,
			params.state,
		);
		if (!redirect.ok) {
			setError(redirect.error);
			setPending(false);
			return;
		}
		setApproved(true);
		setPending(false);
		window.location.assign(redirect.url);
	}

	if (cancelled) {
		return (
			<ConsentShell>
				<div className="space-y-basalt-layout px-basalt-space-lg py-basalt-space-lg">
					<h1 className="text-basalt-xl font-semibold">Authorization cancelled</h1>
					<p className="text-basalt-sm text-basalt-muted-foreground">
						Nothing was enrolled. You can close this tab and return to the terminal.
					</p>
					<Button variant="outline" onClick={() => window.close()}>
						Close tab
					</Button>
				</div>
			</ConsentShell>
		);
	}

	return (
		<ConsentShell>
			<div className="space-y-basalt-layout px-basalt-space-lg py-basalt-space-lg">
				<div className="space-y-basalt-space-sm">
					<p className="text-basalt-xs font-medium uppercase tracking-widest text-basalt-muted-foreground">
						Enrollment consent
					</p>
					<h1 className="text-basalt-xl font-semibold" data-testid="workstation-machine-name">
						{machine}
					</h1>
					<p className="text-basalt-sm text-basalt-muted-foreground">
						A local <code className="font-mono">bat</code> CLI is asking to add this machine to your
						account. The authorization code returns only to the loopback listener at{" "}
						<span className="font-mono">{callbackOrigin}</span>.
					</p>
				</div>

				<ul className="space-y-basalt-space-md rounded-basalt-md bg-basalt-secondary p-basalt-layout-sm text-basalt-sm">
					{SCOPE.map((item) => (
						<li key={item} className="flex gap-basalt-space-md">
							<ShieldCheck
								aria-hidden="true"
								className="mt-0.5 size-4 shrink-0 text-basalt-primary"
								strokeWidth={1.5}
							/>
							<span>{item}</span>
						</li>
					))}
				</ul>

				<Field
					label="Workstation display name"
					hint="Shown on the Workstations page. 1–64 characters."
				>
					<Input
						name="name"
						value={name}
						maxLength={64}
						onChange={(event) => setName(event.target.value)}
						disabled={pending || approved}
						autoComplete="off"
					/>
				</Field>

				{error && (
					<p role="alert" className="text-basalt-sm text-basalt-destructive">
						{error}
					</p>
				)}

				<div className="flex flex-wrap items-center justify-end gap-basalt-space-lg">
					<Button
						variant="outline"
						onClick={() => setCancelled(true)}
						disabled={pending || approved}
					>
						Cancel
					</Button>
					<Button
						onClick={() => void approve()}
						loading={pending}
						disabled={approved || name.trim().length === 0}
					>
						{approved ? "Returning to the CLI…" : "Approve workstation"}
					</Button>
				</div>

				<p className="border-t border-basalt-border pt-basalt-layout-sm text-basalt-xs text-basalt-muted-foreground">
					The browser receives a one-time authorization code only. The CLI exchanges that code on
					this machine and stores the workstation key there; the browser never receives it.
				</p>
			</div>
		</ConsentShell>
	);
}

export function WorkstationLoginPage() {
	const [searchParams] = useSearchParams();
	const parsed = parseWorkstationLoginQuery(searchParams);
	return parsed.ok ? (
		<ConsentForm params={parsed.value} />
	) : (
		<ConsentProblem message={parsed.error} />
	);
}
