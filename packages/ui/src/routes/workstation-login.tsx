import { Button, Field, Input } from "@nocoo/basalt";
import {
	Activity,
	AlertTriangle,
	CircleSlash,
	EyeOff,
	KeyRound,
	Laptop,
	type LucideIcon,
	Tag,
	Terminal,
} from "lucide-react";
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

const REPORTS = [
	"CPU, memory, disk capacity and network addresses.",
	"Round-trip time to your servers, three ICMP probes each.",
	"One report every 10 minutes; stale after 30, never critical.",
];

const NOT_COLLECTED = ["Shell, process list, files, credentials and remote commands."];

const ICON = "shrink-0";

function ConsentShell({ children }: { children: React.ReactNode }) {
	return (
		<main className="basalt-ui flex min-h-dvh items-center justify-center bg-basalt-background p-basalt-space-lg">
			<div
				data-basalt-surface-root=""
				className="flex w-full max-w-lg flex-col overflow-hidden rounded-basalt-lg bg-basalt-card ring-1 ring-basalt-border"
			>
				<div className="flex items-center justify-between gap-basalt-layout bg-basalt-primary px-basalt-card py-basalt-space-lg">
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

function Gutter({
	icon: Icon,
	iconClassName = "mt-basalt-space-xs size-3.5 text-basalt-muted-foreground",
	children,
}: {
	icon: LucideIcon;
	iconClassName?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex gap-basalt-space-md">
			<Icon aria-hidden="true" className={`${ICON} ${iconClassName}`} strokeWidth={1.5} />
			<div className="min-w-0 flex-1">{children}</div>
		</div>
	);
}

function RowLabel({ children }: { children: React.ReactNode }) {
	return <h2 className="text-basalt-base font-medium text-basalt-foreground">{children}</h2>;
}

function ConsentProblem({ message }: { message: string }) {
	return (
		<ConsentShell>
			<div className="flex flex-col gap-basalt-layout p-basalt-card">
				<Gutter
					icon={AlertTriangle}
					iconClassName="mt-basalt-space-md size-5 text-basalt-destructive"
				>
					<div className="space-y-basalt-space-lg">
						<h1 className="text-basalt-3xl font-semibold text-basalt-foreground">
							Authorization request rejected
						</h1>
						<p role="alert" className="text-basalt-base text-basalt-muted-foreground">
							{message}
						</p>
					</div>
				</Gutter>
				<div className="border-t border-basalt-border pt-basalt-layout">
					<Gutter icon={Terminal}>
						<div className="space-y-basalt-space-md">
							<RowLabel>Request a fresh link</RowLabel>
							<p className="text-basalt-base text-basalt-muted-foreground">
								Run <code className="font-mono text-basalt-foreground">bat workstation login</code>{" "}
								again. The browser link must come from the CLI on the machine you want to enroll.
							</p>
						</div>
					</Gutter>
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
				<div className="flex flex-col gap-basalt-layout p-basalt-card">
					<Gutter icon={CircleSlash} iconClassName="mt-basalt-space-md size-5">
						<div className="space-y-basalt-space-lg">
							<h1 className="text-basalt-3xl font-semibold text-basalt-foreground">
								Authorization cancelled
							</h1>
							<p className="text-basalt-base text-basalt-muted-foreground">
								Nothing was enrolled. You can close this tab and return to the terminal.
							</p>
						</div>
					</Gutter>
					<div className="border-t border-basalt-border pt-basalt-layout">
						<Button variant="outline" onClick={() => window.close()}>
							Close tab
						</Button>
					</div>
				</div>
			</ConsentShell>
		);
	}

	return (
		<ConsentShell>
			<form
				aria-label="Workstation enrollment"
				className="flex flex-col p-basalt-card"
				onSubmit={(event) => {
					event.preventDefault();
					void approve();
				}}
			>
				<header className="space-y-basalt-space-lg pb-basalt-layout">
					<p className="text-basalt-sm font-medium uppercase tracking-widest text-basalt-muted-foreground">
						Enrollment consent
					</p>
					<h1
						className="text-basalt-3xl font-semibold text-basalt-foreground"
						data-testid="workstation-machine-name"
					>
						{machine}
					</h1>
					<p className="text-basalt-base text-basalt-muted-foreground">
						A local <code className="font-mono text-basalt-foreground">bat</code> CLI is asking to
						add this machine to your account.
					</p>
				</header>

				<div className="divide-y divide-basalt-border border-t border-basalt-border">
					<div className="py-basalt-layout">
						<Gutter icon={Activity}>
							<div className="space-y-basalt-space-md">
								<RowLabel>Reports</RowLabel>
								<ul className="space-y-basalt-space-md text-basalt-base text-basalt-muted-foreground">
									{REPORTS.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</div>
						</Gutter>
					</div>
					<div className="py-basalt-layout">
						<Gutter icon={EyeOff}>
							<div className="space-y-basalt-space-md">
								<RowLabel>Not collected</RowLabel>
								<ul className="space-y-basalt-space-md text-basalt-base text-basalt-muted-foreground">
									{NOT_COLLECTED.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
							</div>
						</Gutter>
					</div>
					<div className="py-basalt-layout">
						<Gutter icon={Tag}>
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
						</Gutter>
					</div>
				</div>

				{error && (
					<p role="alert" className="pt-basalt-layout text-basalt-sm text-basalt-destructive">
						{error}
					</p>
				)}

				<div className="flex flex-wrap items-center justify-end gap-basalt-space-lg pt-basalt-space-sm">
					<Button
						type="button"
						variant="outline"
						onClick={() => setCancelled(true)}
						disabled={pending || approved}
					>
						Cancel
					</Button>
					<Button type="submit" loading={pending} disabled={approved || name.trim().length === 0}>
						{approved ? "Returning to the CLI…" : "Approve workstation"}
					</Button>
				</div>
			</form>

			<div className="border-t border-basalt-border px-basalt-card py-basalt-layout">
				<Gutter icon={KeyRound}>
					<p className="text-basalt-sm text-basalt-muted-foreground">
						The browser receives a one-time code, sent to{" "}
						<span className="font-mono">{callbackOrigin}</span>. The CLI exchanges it here, so the
						workstation key never reaches the browser.
					</p>
				</Gutter>
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
