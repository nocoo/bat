import {
	CONNECT_API_ORIGIN,
	type ConnectScope,
	type ConnectSensitiveAction,
	type ConnectServer,
	type ConnectToken,
} from "@bat/shared";
import {
	Badge,
	Button,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
} from "@nocoo/basalt";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	ArrowUpRight,
	Check,
	Clock3,
	Copy,
	Eye,
	EyeOff,
	KeyRound,
	LockKeyhole,
	Pencil,
	Plug,
	Plus,
	RefreshCw,
	ShieldCheck,
	Terminal,
	Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { AppShell } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { connectDate, connectExamples, connectRequest, connectTokenStatus } from "@/lib/connect";

interface Action {
	token: ConnectToken;
	kind: ConnectSensitiveAction | "rename";
}
const actionLabels = {
	reveal: "Reveal key",
	rotate: "Rotate key",
	revoke: "Revoke token",
	rename: "Rename token",
};
const actionDescriptions = {
	reveal:
		"This key grants access to the selected server. Confirm that your screen is private. The key hides after 30 seconds or when you leave this window.",
	rotate:
		"The current key stops working immediately. The replacement keeps the same server, scope and expiry. Reveal it again to update your agent.",
	revoke:
		"This token stops working immediately. Agents using it will lose access to this server. Revocation cannot be undone.",
	rename: "Choose a name that helps you recognize the agent or integration using this token.",
};

export function ConnectPage() {
	const servers = useSWR<{ data: ConnectServer[]; apiBaseUrl: string }>(
		"/api/connect/servers",
		connectRequest,
	);
	const [selected, setSelected] = useState("");
	const serverId = selected || servers.data?.data[0]?.id || "";
	const serverName = servers.data?.data.find((server) => server.id === serverId)?.name ?? "";
	const listUrl = serverId ? `/api/connect/servers/${encodeURIComponent(serverId)}/tokens` : null;
	const tokens = useSWR<{ data: ConnectToken[] }>(listUrl, connectRequest, {
		refreshInterval: 30_000,
	});
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [scope, setScope] = useState<ConnectScope>("read");
	const [expiry, setExpiry] = useState("");
	const [action, setAction] = useState<Action | null>(null);
	const [confirmation, setConfirmation] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [secret, setSecret] = useState<{ id: string; value: string } | null>(null);
	const [example, setExample] = useState<"curl" | "agent">("curl");
	const opener = useRef<HTMLElement | null>(null);
	const generation = useRef(0);
	const baseUrl =
		servers.data?.apiBaseUrl ??
		`${window.location.hostname === "bat.hexly.ai" ? CONNECT_API_ORIGIN : window.location.origin}/api/v1`;
	const examples = connectExamples(baseUrl, serverId);
	const active =
		tokens.data?.data.filter((token) => connectTokenStatus(token) === "Active").length ?? 0;

	useEffect(() => {
		if (!secret) return;
		const timeout = window.setTimeout(() => setSecret(null), 30_000);
		return () => window.clearTimeout(timeout);
	}, [secret]);

	useEffect(() => {
		const hide = () => {
			generation.current++;
			setSecret(null);
		};
		const visibility = () => {
			if (document.hidden) hide();
		};
		window.addEventListener("blur", hide);
		document.addEventListener("visibilitychange", visibility);
		return () => {
			generation.current++;
			window.removeEventListener("blur", hide);
			document.removeEventListener("visibilitychange", visibility);
		};
	}, []);

	function openAction(token: ConnectToken, kind: Action["kind"]) {
		opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		setSecret(null);
		setError("");
		setConfirmation(kind === "rename" ? token.name : "");
		setAction({ token, kind });
	}

	function changeServer(id: string) {
		generation.current++;
		setSelected(id);
		setSecret(null);
		setAction(null);
		setCreating(false);
		setError("");
		setNotice("");
	}

	async function copy(value: string, label: string) {
		try {
			await navigator.clipboard.writeText(value);
			setNotice(`${label} copied.`);
		} catch {
			setError("Clipboard access was denied. Select and copy the visible text manually.");
		}
	}

	async function create() {
		if (!listUrl) return;
		setBusy(true);
		setError("");
		try {
			await connectRequest(listUrl, {
				method: "POST",
				body: { name, scope, expiresAt: expiry ? new Date(expiry).toISOString() : null },
			});
			setCreating(false);
			setName("");
			setExpiry("");
			setScope("read");
			setNotice("Token created. Reveal its key when you are ready to connect your agent.");
			await tokens.mutate();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Token could not be created.");
		} finally {
			setBusy(false);
		}
	}

	async function confirmAction() {
		if (!action || !listUrl) return;
		const current = generation.current;
		const path = `${listUrl}/${action.token.id}`;
		setBusy(true);
		setError("");
		try {
			if (action.kind === "rename") {
				await connectRequest(path, {
					method: "PATCH",
					body: { name: confirmation },
					token: action.token,
				});
				setNotice("Token renamed.");
			} else {
				const challenge = await connectRequest<{ challenge: string }>(`${path}/challenge`, {
					method: "POST",
					body: { action: action.kind },
					token: action.token,
				});
				if (current !== generation.current) return;
				const result = await connectRequest<{ token?: string }>(`${path}/${action.kind}`, {
					method: "POST",
					body: { challenge: challenge.challenge, confirmation },
					token: action.token,
				});
				if (current !== generation.current) return;
				if (action.kind === "reveal" && result.token) {
					setSecret({ id: action.token.id, value: result.token });
					setNotice("Key revealed for 30 seconds. This action was recorded in the audit trail.");
				} else
					setNotice(
						action.kind === "rotate"
							? "Key rotated. The old key no longer works. Reveal the replacement to reconnect your agent."
							: "Token revoked. Its key no longer works.",
					);
			}
			setAction(null);
			setConfirmation("");
			await tokens.mutate();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "The action could not be completed.");
			await tokens.mutate();
		} finally {
			setBusy(false);
		}
	}

	const loadError = servers.error ?? tokens.error;
	return (
		<AppShell breadcrumbs={[{ label: "Connect" }]}>
			<div className="mx-auto w-full max-w-6xl space-y-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<PageHeader title="Connect" description="Give your agents a secure connection to Bat." />
					<Badge variant="outline" className="gap-2">
						<Plug className="size-3.5" aria-hidden="true" /> API v1
					</Badge>
				</div>
				{(error || loadError) && (
					<div
						role="alert"
						className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
					>
						{error || loadError?.message}
					</div>
				)}
				<div
					role="status"
					aria-live="polite"
					className={notice ? "flex items-center gap-2 text-sm text-foreground" : "sr-only"}
				>
					{notice && <Check className="size-4 text-success" aria-hidden="true" />}
					{notice}
				</div>
				<Card>
					<CardContent className="flex flex-col gap-5 py-2 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-start gap-4">
							<div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
								<ShieldCheck className="size-5" aria-hidden="true" />
							</div>
							<div>
								<h2 className="text-sm font-semibold">One server. Explicit permissions.</h2>
								<p className="mt-1 max-w-lg text-sm text-muted-foreground">
									Every token stays bound to its server. Choose read access for observation, or
									write access for authorized changes.
								</p>
							</div>
						</div>
						<div className="w-full shrink-0 space-y-2 sm:w-64">
							<Label htmlFor="connect-server">Server</Label>
							<select
								id="connect-server"
								value={serverId}
								onChange={(event) => changeServer(event.target.value)}
								disabled={busy || servers.isLoading || !servers.data?.data.length}
								className="h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
							>
								{!servers.data?.data.length && (
									<option value="">
										{servers.isLoading ? "Loading servers…" : "No authorized servers"}
									</option>
								)}
								{servers.data?.data.map((server) => (
									<option key={server.id} value={server.id}>
										{server.name}
									</option>
								))}
							</select>
						</div>
					</CardContent>
				</Card>
				<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
					<section aria-labelledby="tokens-heading" className="min-w-0 space-y-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<h2 id="tokens-heading" className="text-lg font-semibold tracking-tight">
									Access tokens
								</h2>
								<Badge variant="secondary">{active} active</Badge>
							</div>
							<Button
								onClick={() => {
									opener.current = document.activeElement as HTMLElement;
									setError("");
									setCreating(true);
								}}
								disabled={!serverId || busy}
							>
								<Plus className="size-4" aria-hidden="true" /> Create token
							</Button>
						</div>
						{tokens.isLoading || servers.isLoading ? (
							<Card>
								<CardContent className="space-y-4">
									<Skeleton className="h-6 w-40" />
									<Skeleton className="h-16 w-full" />
									<Skeleton className="h-6 w-56" />
								</CardContent>
							</Card>
						) : !tokens.data?.data.length ? (
							<Card>
								<CardContent className="flex flex-col items-center py-12 text-center">
									<KeyRound
										className="mb-4 size-8 text-muted-foreground"
										strokeWidth={1.5}
										aria-hidden="true"
									/>
									<h3 className="font-medium">Your next connection starts here</h3>
									<p className="mt-2 max-w-xs text-sm text-muted-foreground">
										{serverId
											? "Create a token for an agent, script or integration. Start with read access."
											: "A server administrator must grant you access before you can manage tokens."}
									</p>
								</CardContent>
							</Card>
						) : (
							tokens.data.data.map((token) => {
								const status = connectTokenStatus(token);
								return (
									<Card key={token.id}>
										<CardContent className="space-y-4" data-testid="connect-token-row">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div className="min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<h3 className="break-all font-semibold">{token.name}</h3>
														<Badge variant={token.scope === "write" ? "purple" : "teal"}>
															{token.scope === "write" ? "Read + write" : "Read only"}
														</Badge>
														{status !== "Active" && <Badge variant="outline">{status}</Badge>}
													</div>
													<p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
														<span>{serverName}</span>
														<span aria-hidden="true">·</span>
														<span className="font-mono">{token.prefix}</span>
													</p>
												</div>
												<Button
													variant="ghost"
													size="icon"
													aria-label={`Rename ${token.name}`}
													disabled={busy || status === "Revoked"}
													onClick={() => openAction(token, "rename")}
												>
													<Pencil className="size-3.5" aria-hidden="true" />
												</Button>
											</div>
											<dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
												<div>
													<dt className="text-muted-foreground">Created</dt>
													<dd className="mt-1">{connectDate(token.createdAt)}</dd>
												</div>
												<div>
													<dt className="text-muted-foreground">Last used</dt>
													<dd className="mt-1">{connectDate(token.lastUsedAt)}</dd>
												</div>
												<div>
													<dt className="text-muted-foreground">Expires</dt>
													<dd className="mt-1 flex items-center gap-1.5">
														{token.expiresAt ? (
															connectDate(token.expiresAt)
														) : (
															<>
																<Clock3 className="size-3" aria-hidden="true" /> Never
															</>
														)}
													</dd>
												</div>
											</dl>
											{secret?.id === token.id && (
												<div
													className="space-y-2 rounded-lg border border-border bg-secondary p-3"
													data-private="true"
												>
													<Label htmlFor={`key-${token.id}`}>Bearer key</Label>
													<div className="flex gap-2">
														<Input
															id={`key-${token.id}`}
															readOnly
															value={secret.value}
															className="min-w-0 font-mono text-xs"
															autoComplete="off"
															spellCheck={false}
															passwordManagerIgnore
														/>
														<Button
															size="icon"
															variant="outline"
															aria-label="Copy revealed key"
															onClick={() => copy(secret.value, "Key")}
														>
															<Copy className="size-4" aria-hidden="true" />
														</Button>
														<Button
															size="icon"
															variant="ghost"
															aria-label="Hide key"
															onClick={() => setSecret(null)}
														>
															<EyeOff className="size-4" aria-hidden="true" />
														</Button>
													</div>
													<p className="text-xs text-muted-foreground">
														Visible briefly. Your clipboard keeps its copy until you clear it.
													</p>
												</div>
											)}
											<div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
												<Button
													size="sm"
													variant="outline"
													aria-label={`Reveal ${token.name}`}
													disabled={busy || status === "Revoked"}
													onClick={() => openAction(token, "reveal")}
												>
													<Eye className="size-3.5" aria-hidden="true" /> Reveal key
												</Button>
												<Button
													size="sm"
													variant="ghost"
													aria-label={`Rotate ${token.name}`}
													disabled={busy || status !== "Active"}
													onClick={() => openAction(token, "rotate")}
												>
													<RefreshCw className="size-3.5" aria-hidden="true" /> Rotate
												</Button>
												<Button
													size="sm"
													variant="ghost"
													className="ml-auto text-destructive"
													aria-label={`Revoke ${token.name}`}
													disabled={busy || status === "Revoked"}
													onClick={() => openAction(token, "revoke")}
												>
													<Trash2 className="size-3.5" aria-hidden="true" /> Revoke
												</Button>
											</div>
										</CardContent>
									</Card>
								);
							})
						)}
					</section>
					<aside className="min-w-0 space-y-4" aria-label="Connection guide">
						<Card>
							<CardContent className="space-y-4">
								<div className="flex items-center gap-2">
									<Terminal className="size-4 text-muted-foreground" aria-hidden="true" />
									<h2 className="font-semibold">Make the connection</h2>
								</div>
								<div className="space-y-2">
									<Label htmlFor="connect-base">API base URL</Label>
									<div className="flex gap-2">
										<Input
											id="connect-base"
											value={baseUrl}
											readOnly
											className="min-w-0 font-mono text-xs"
										/>
										<Button
											variant="outline"
											size="icon"
											aria-label="Copy API base URL"
											onClick={() => copy(baseUrl, "API URL")}
										>
											<Copy className="size-4" aria-hidden="true" />
										</Button>
									</div>
								</div>
								<fieldset className="flex flex-wrap items-center gap-2">
									<legend className="sr-only">Example format</legend>
									<Button
										size="sm"
										variant={example === "curl" ? "secondary" : "ghost"}
										aria-pressed={example === "curl"}
										onClick={() => setExample("curl")}
									>
										curl
									</Button>
									<Button
										size="sm"
										variant={example === "agent" ? "secondary" : "ghost"}
										aria-pressed={example === "agent"}
										onClick={() => setExample("agent")}
									>
										Agent instructions
									</Button>
									<Button
										className="ml-auto"
										size="icon"
										variant="ghost"
										aria-label="Copy example"
										onClick={() => copy(examples[example], "Example")}
									>
										<Copy className="size-3.5" aria-hidden="true" />
									</Button>
								</fieldset>
								<pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-secondary p-4 font-mono text-xs leading-relaxed">
									{examples[example]}
								</pre>
								<p className="text-xs leading-relaxed text-muted-foreground">
									Discover available operations at <code>/capabilities</code>. The machine-readable
									contract is at <code>/openapi.json</code>. Both require your Bearer token.
								</p>
								<a
									className="inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
									href="https://github.com/nocoo/bat/blob/main/docs/22-connect.md"
									target="_blank"
									rel="noreferrer"
								>
									API guide
									<ArrowUpRight className="size-3.5" aria-hidden="true" />
								</a>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="space-y-3">
								<div className="flex items-center gap-2">
									<LockKeyhole className="size-4 text-muted-foreground" aria-hidden="true" />
									<h2 className="text-sm font-semibold">Keep access intentional</h2>
								</div>
								<p className="text-sm leading-relaxed text-muted-foreground">
									Tokens never expire by default. Anyone holding a key retains its access until you
									revoke it. Set an expiry for temporary work.
								</p>
								<p className="text-sm leading-relaxed text-muted-foreground">
									Use one token per integration, keep it in a secret store, and prefer read access.
									Reveals and changes are audited. Rotation invalidates the previous key
									immediately.
								</p>
							</CardContent>
						</Card>
					</aside>
				</div>
			</div>
			<Dialog
				open={creating}
				onOpenChange={(open) => {
					if (!busy) setCreating(open);
				}}
			>
				<DialogContent
					size="lg"
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						opener.current?.focus();
					}}
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void create();
						}}
						className="space-y-5"
					>
						<DialogHeader>
							<DialogTitle>Create access token</DialogTitle>
							<DialogDescription>
								Connect an agent to {serverName}. Its key will be encrypted and can be revealed
								again.
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-2">
							<Label htmlFor="token-name">Token name</Label>
							<Input
								id="token-name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								placeholder="e.g. Daily health report"
								required
								maxLength={64}
								autoComplete="off"
							/>
						</div>
						<fieldset className="space-y-2">
							<legend className="mb-2 text-sm font-medium">Permissions</legend>
							{(["read", "write"] as const).map((choice) => (
								<label
									key={choice}
									className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${scope === choice ? "border-primary bg-accent" : "border-border"}`}
								>
									<input
										className="mt-1 accent-primary focus-visible:outline-2 focus-visible:outline-ring"
										type="radio"
										name="connect-scope"
										value={choice}
										checked={scope === choice}
										onChange={() => setScope(choice)}
									/>
									<span>
										<span className="block text-sm font-medium">
											{choice === "read" ? "Read only" : "Read + write"}
										</span>
										<span className="mt-0.5 block text-xs text-muted-foreground">
											{choice === "read"
												? "Read server data and discover available operations."
												: "Also create, update, delete and perform server actions."}
										</span>
									</span>
								</label>
							))}
						</fieldset>
						<div className="space-y-2">
							<Label htmlFor="token-expiry">
								Expiry{" "}
								<span className="font-normal text-muted-foreground">
									(optional, your local time)
								</span>
							</Label>
							<Input
								id="token-expiry"
								type="datetime-local"
								value={expiry}
								onChange={(event) => setExpiry(event.target.value)}
							/>
							<p className="text-xs leading-relaxed text-muted-foreground">
								Leave blank for no expiry. This grants ongoing access until you revoke the token.
							</p>
						</div>
						{error && (
							<p role="alert" className="text-sm text-destructive">
								{error}
							</p>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								disabled={busy}
								onClick={() => setCreating(false)}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={busy || !name.trim()}>
								{busy ? "Creating…" : "Create token"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
			<Dialog
				open={!!action}
				onOpenChange={(open) => {
					if (!open && !busy) {
						generation.current++;
						setAction(null);
						setConfirmation("");
					}
				}}
			>
				<DialogContent
					size="lg"
					onCloseAutoFocus={(event) => {
						event.preventDefault();
						opener.current?.focus();
					}}
				>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void confirmAction();
						}}
						className="space-y-5"
					>
						<DialogHeader>
							<DialogTitle>{action ? actionLabels[action.kind] : "Confirm action"}</DialogTitle>
							<DialogDescription>{action ? actionDescriptions[action.kind] : ""}</DialogDescription>
						</DialogHeader>
						{action && (
							<>
								<div className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm">
									<span className="font-medium">{action.token.name}</span>
									<span className="ml-2 text-muted-foreground">
										· {serverName} · {action.token.scope === "write" ? "Read + write" : "Read only"}
									</span>
								</div>
								<div className="space-y-2">
									<Label htmlFor="token-confirmation">
										{action.kind === "rename"
											? "New token name"
											: `Type ${action.token.name} to confirm`}
									</Label>
									<Input
										id="token-confirmation"
										value={confirmation}
										onChange={(event) => setConfirmation(event.target.value)}
										autoComplete="off"
										spellCheck={false}
										passwordManagerIgnore
										maxLength={64}
										required
									/>
								</div>
							</>
						)}
						{error && (
							<p role="alert" className="text-sm text-destructive">
								{error}
							</p>
						)}
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								disabled={busy}
								onClick={() => {
									generation.current++;
									setAction(null);
								}}
							>
								Cancel
							</Button>
							<Button
								type="submit"
								variant={action?.kind === "revoke" ? "destructive" : "default"}
								disabled={
									busy ||
									!action ||
									(action.kind === "rename"
										? !confirmation.trim()
										: confirmation !== action.token.name)
								}
							>
								{busy ? "Working…" : action ? actionLabels[action.kind] : "Confirm"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</AppShell>
	);
}
