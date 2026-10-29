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
	Checkbox,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	Label,
	SegmentControl,
} from "@nocoo/basalt";
import { CodeBlock } from "@nocoo/basalt/components/code";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { Radio } from "@nocoo/basalt/components/radio";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
	connectDate,
	connectExamples,
	connectExpiryInput,
	connectRequest,
	connectTokenStatus,
} from "@/lib/connect";

interface Action {
	token: ConnectToken;
	kind: ConnectSensitiveAction | "edit";
}
const actionLabels = {
	reveal: "Reveal key",
	rotate: "Rotate key",
	revoke: "Revoke token",
	edit: "Edit token",
};
const actionDescriptions = {
	reveal:
		"This key grants access to its authorized servers. Confirm that your screen is private. The key hides after 30 seconds or when you leave this window.",
	rotate:
		"The current key stops working immediately. The replacement keeps the same authorized servers, scope and expiry. Reveal it again to update your agent.",
	revoke:
		"This token stops working immediately. Agents using it will lose access to all its authorized servers. Revocation cannot be undone.",
	edit: "Update the name, authorized servers, permissions and expiry. Changes take effect immediately; the key stays the same.",
};

function ServerSelection({
	servers,
	serverIds,
	onChange,
	disabled,
}: {
	servers: ConnectServer[];
	serverIds: string[];
	onChange: (ids: string[]) => void;
	disabled: boolean;
}) {
	const options = [
		...servers,
		...serverIds
			.filter((id) => !servers.some((server) => server.id === id))
			.map((id) => ({ id, name: "Unavailable server (remove this authorization)" })),
	];
	return (
		<Checkbox.Group
			value={serverIds}
			onValueChange={(ids) => onChange(ids.sort())}
			disabled={disabled}
		>
			<Checkbox.Legend>Authorized servers</Checkbox.Legend>
			<p className="text-basalt-sm leading-relaxed text-basalt-muted-foreground">
				Select the servers this key can access. No selection means no server access. Each server can
				be authorized for multiple keys.
			</p>
			<div className="max-h-44 space-y-3 overflow-y-auto p-1">
				{options.map((server) => (
					<Checkbox.Item key={server.id} value={server.id}>
						<span className="min-w-0 break-all">
							<span className="block text-basalt-base font-medium">{server.name}</span>
							<span className="block font-mono text-basalt-sm text-basalt-muted-foreground">
								{server.id}
							</span>
						</span>
					</Checkbox.Item>
				))}
				{!options.length && (
					<p className="p-2 text-basalt-base text-basalt-muted-foreground">
						No servers available to authorize.
					</p>
				)}
			</div>
			<p className="text-basalt-sm text-basalt-muted-foreground">
				{serverIds.length ? `${serverIds.length} selected` : "No server access"}
			</p>
		</Checkbox.Group>
	);
}

export function ConnectPage() {
	const servers = useSWR<{ data: ConnectServer[]; apiBaseUrl: string }>(
		"/api/connect/servers",
		connectRequest,
	);
	const listUrl = "/api/connect/tokens";
	const tokens = useSWR<{ data: ConnectToken[] }>(listUrl, connectRequest, {
		refreshInterval: 30_000,
	});
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [scope, setScope] = useState<ConnectScope>("read");
	const [expiry, setExpiry] = useState("");
	const [serverIds, setServerIds] = useState<string[]>([]);
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
	const examples = connectExamples(baseUrl);
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
		generation.current++;
		setSecret(null);
		setError("");
		setConfirmation(kind === "edit" ? token.name : "");
		setServerIds(token.serverIds);
		setScope(token.scope);
		setExpiry(connectExpiryInput(token.expiresAt));
		setAction({ token, kind });
	}

	function serverNames(ids: string[]) {
		return ids.length
			? ids
					.map(
						(id) =>
							servers.data?.data.find((server) => server.id === id)?.name ?? `${id} (unavailable)`,
					)
					.join(", ")
			: "No server access";
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
		setBusy(true);
		setError("");
		try {
			await connectRequest(listUrl, {
				method: "POST",
				body: { name, serverIds, scope, expiresAt: expiry ? new Date(expiry).toISOString() : null },
			});
			setCreating(false);
			setName("");
			setExpiry("");
			setScope("read");
			setServerIds([]);
			setNotice("Token created. Reveal its key when you are ready to connect your agent.");
			await tokens.mutate();
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Token could not be created.");
		} finally {
			setBusy(false);
		}
	}

	async function confirmAction() {
		if (!action) return;
		const current = generation.current;
		const path = `${listUrl}/${encodeURIComponent(action.token.id)}`;
		setBusy(true);
		setError("");
		try {
			if (action.kind === "edit") {
				await connectRequest(path, {
					method: "PATCH",
					body: {
						name: confirmation,
						serverIds,
						scope,
						// Preserve the original instant when local time is unchanged, including DST overlaps.
						...(expiry === connectExpiryInput(action.token.expiresAt)
							? {}
							: { expiresAt: expiry ? new Date(expiry).toISOString() : null }),
					},
					token: action.token,
				});
				setNotice(
					"Token updated. Its current permissions and expiry are now in effect; its key is unchanged.",
				);
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

	const accessControls = (
		<>
			<ServerSelection
				servers={servers.data?.data ?? []}
				serverIds={serverIds}
				onChange={setServerIds}
				disabled={busy}
			/>
			<Radio.Group
				value={scope}
				onValueChange={(value) => setScope(value as ConnectScope)}
				disabled={busy}
			>
				<Radio.Legend>Permissions</Radio.Legend>
				{(["read", "write"] as const).map((choice) => (
					<label
						key={choice}
						htmlFor={`connect-scope-${choice}`}
						className="flex items-center gap-2"
					>
						<Radio.Item id={`connect-scope-${choice}`} value={choice} />
						<span>
							<span className="block text-basalt-base font-medium">
								{choice === "read" ? "Read only" : "Read + write"}
							</span>
							<span className="mt-0.5 block text-basalt-sm text-basalt-muted-foreground">
								{choice === "read"
									? "Read server data and discover available operations."
									: "Also create, update, delete and perform server actions."}
							</span>
						</span>
					</label>
				))}
			</Radio.Group>
			<div className="space-y-2">
				<Label htmlFor="token-expiry">
					Expiry{" "}
					<span className="font-normal text-basalt-muted-foreground">
						(optional, your local time)
					</span>
				</Label>
				<Input
					id="token-expiry"
					type="datetime-local"
					step={1}
					disabled={busy}
					value={expiry}
					onChange={(event) => setExpiry(event.target.value)}
				/>
				<p className="text-basalt-sm leading-relaxed text-basalt-muted-foreground">
					Leave blank for no expiry. This grants ongoing access until you revoke the token.
				</p>
			</div>
		</>
	);
	const loadError = servers.error ?? tokens.error;
	return (
		<>
			<div className="space-y-basalt-layout" data-bat-dirty={creating || !!action}>
				<PageHeader
					title="Connect"
					description="Give your agents a secure connection to Bat."
					actions={
						<Badge variant="outline" className="gap-2">
							<Plug className="size-3.5" aria-hidden="true" /> API v1
						</Badge>
					}
				/>
				{(error || loadError) && (
					<div
						role="alert"
						className="rounded-lg border border-basalt-destructive/30 bg-basalt-destructive/10 p-4 text-basalt-base text-basalt-destructive"
					>
						{error || loadError?.message}
					</div>
				)}
				<div
					role="status"
					aria-live="polite"
					className={
						notice ? "flex items-center gap-2 text-basalt-base text-basalt-foreground" : "sr-only"
					}
				>
					{notice && <Check className="size-4 text-basalt-success" aria-hidden="true" />}
					{notice}
				</div>
				<LayerCard>
					<LayerCard.Body>
						<div className="flex items-start gap-4">
							<div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-basalt-accent text-basalt-primary">
								<ShieldCheck className="size-5" aria-hidden="true" />
							</div>
							<div>
								<h2 className="text-basalt-base font-semibold">
									One key. Your authorized servers.
								</h2>
								<p className="mt-1 max-w-lg text-basalt-base text-basalt-muted-foreground">
									Choose which servers each key can access. Multiple keys can access the same
									server, each with its own read or write permission.
								</p>
							</div>
						</div>
					</LayerCard.Body>
				</LayerCard>
				<div className="grid items-start gap-basalt-layout xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
					<section aria-labelledby="tokens-heading" className="min-w-0 space-y-4">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div className="flex items-center gap-2">
								<h2 id="tokens-heading" className="text-basalt-lg font-semibold tracking-tight">
									Access tokens
								</h2>
								<Badge variant="secondary">{active} active</Badge>
							</div>
							<Button
								onClick={() => {
									opener.current = document.activeElement as HTMLElement;
									generation.current++;
									setSecret(null);
									setError("");
									setName("");
									setScope("read");
									setExpiry("");
									setServerIds([]);
									setCreating(true);
								}}
								disabled={!servers.data || !tokens.data || !!loadError || busy}
							>
								<Plus className="size-4" aria-hidden="true" /> Create token
							</Button>
						</div>
						{tokens.isLoading || servers.isLoading ? (
							<LayerCard>
								<LayerCard.Body className="space-y-4">
									<Skeleton className="h-6 w-40" />
									<Skeleton className="h-16 w-full" />
									<Skeleton className="h-6 w-56" />
								</LayerCard.Body>
							</LayerCard>
						) : !tokens.data?.data.length ? (
							<LayerCard>
								<LayerCard.Body className="flex flex-col items-center py-12 text-center">
									<KeyRound
										className="mb-4 size-8 text-basalt-muted-foreground"
										strokeWidth={1.5}
										aria-hidden="true"
									/>
									<h3 className="font-medium">Your next connection starts here</h3>
									<p className="mt-2 max-w-xs text-basalt-base text-basalt-muted-foreground">
										Create a token for an agent, script or integration. Select its authorized
										servers and start with read access.
									</p>
								</LayerCard.Body>
							</LayerCard>
						) : (
							tokens.data.data.map((token) => {
								const status = connectTokenStatus(token);
								return (
									<LayerCard key={token.id}>
										<LayerCard.Body className="space-y-4" data-testid="connect-token-row">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div className="min-w-0">
													<div className="flex flex-wrap items-center gap-2">
														<h3 className="break-all font-semibold">{token.name}</h3>
														<Badge variant={token.scope === "write" ? "purple" : "teal"}>
															{token.scope === "write" ? "Read + write" : "Read only"}
														</Badge>
														{status !== "Active" && <Badge variant="outline">{status}</Badge>}
													</div>
													<p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-basalt-sm text-basalt-muted-foreground">
														<span className="font-mono">{token.prefix}</span>
													</p>
												</div>
												<Button
													variant="ghost"
													size="icon"
													aria-label={`Edit ${token.name}`}
													disabled={busy || status === "Revoked"}
													onClick={() => openAction(token, "edit")}
												>
													<Pencil className="size-3.5" aria-hidden="true" />
												</Button>
											</div>
											<div className="space-y-2 text-basalt-sm">
												<p className="text-basalt-muted-foreground">
													Authorized servers ({token.serverIds.length})
												</p>
												{token.serverIds.length ? (
													<ul
														className="flex flex-wrap gap-2"
														aria-label={`Authorized servers for ${token.name}`}
													>
														{token.serverIds.map((id) => (
															<li
																key={id}
																className="min-w-0 break-all rounded-md border border-basalt-border px-2 py-1"
															>
																<span className="block">{serverNames([id])}</span>
																<span className="font-mono text-basalt-muted-foreground">{id}</span>
															</li>
														))}
													</ul>
												) : (
													<p>No server access</p>
												)}
											</div>
											<dl className="grid grid-cols-1 gap-3 text-basalt-sm sm:grid-cols-3">
												<div>
													<dt className="text-basalt-muted-foreground">Created</dt>
													<dd className="mt-1">{connectDate(token.createdAt)}</dd>
												</div>
												<div>
													<dt className="text-basalt-muted-foreground">Last used</dt>
													<dd className="mt-1">{connectDate(token.lastUsedAt)}</dd>
												</div>
												<div>
													<dt className="text-basalt-muted-foreground">Expires</dt>
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
													className="space-y-2 rounded-lg border border-basalt-border bg-basalt-secondary p-3"
													data-private="true"
												>
													<Label htmlFor={`key-${token.id}`}>Bearer key</Label>
													<div className="flex gap-2">
														<Input
															id={`key-${token.id}`}
															readOnly
															value={secret.value}
															className="min-w-0 font-mono"
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
													<p className="text-basalt-sm text-basalt-muted-foreground">
														Visible briefly. Your clipboard keeps its copy until you clear it.
													</p>
												</div>
											)}
											<div className="flex flex-wrap items-center gap-2 border-t border-basalt-border pt-3">
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
													className="ml-auto"
													aria-label={`Revoke ${token.name}`}
													disabled={busy || status === "Revoked"}
													onClick={() => openAction(token, "revoke")}
												>
													<Trash2 className="size-3.5" aria-hidden="true" /> Revoke
												</Button>
											</div>
										</LayerCard.Body>
									</LayerCard>
								);
							})
						)}
					</section>
					<aside className="min-w-0 space-y-4" aria-label="Connection guide">
						<LayerCard>
							<LayerCard.Body className="space-y-4">
								<div className="flex items-center gap-2">
									<Terminal className="size-4 text-basalt-muted-foreground" aria-hidden="true" />
									<h2 className="font-semibold">Make the connection</h2>
								</div>
								<div className="space-y-2">
									<Label htmlFor="connect-base">API base URL</Label>
									<div className="flex gap-2">
										<Input
											id="connect-base"
											value={baseUrl}
											readOnly
											className="min-w-0 font-mono"
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
								<SegmentControl
									legend="Example format"
									className="[&>legend]:sr-only"
									value={example}
									onValueChange={(value) => setExample(value as "curl" | "agent")}
									options={[
										{ value: "curl", label: "curl" },
										{ value: "agent", label: "Agent instructions" },
									]}
								/>
								<CodeBlock title={example === "curl" ? "curl example" : "Agent instructions"}>
									{examples[example]}
								</CodeBlock>
								<p className="text-basalt-sm leading-relaxed text-basalt-muted-foreground">
									Discover available operations at <code>/capabilities</code>. The machine-readable
									contract is at <code>/openapi.json</code>. Both require your Bearer token.
								</p>
								<a
									className="inline-flex items-center gap-1.5 text-basalt-base font-medium underline-offset-4 hover:underline"
									href="https://github.com/nocoo/bat/blob/main/docs/22-connect.md"
									target="_blank"
									rel="noreferrer"
								>
									API guide
									<ArrowUpRight className="size-3.5" aria-hidden="true" />
								</a>
							</LayerCard.Body>
						</LayerCard>
						<LayerCard>
							<LayerCard.Body className="space-y-3">
								<div className="flex items-center gap-2">
									<LockKeyhole className="size-4 text-basalt-muted-foreground" aria-hidden="true" />
									<h2 className="text-basalt-base font-semibold">Keep access intentional</h2>
								</div>
								<p className="text-basalt-base leading-relaxed text-basalt-muted-foreground">
									Tokens never expire by default. Anyone holding a key retains its access until you
									revoke it. Set an expiry for temporary work.
								</p>
								<p className="text-basalt-base leading-relaxed text-basalt-muted-foreground">
									Use one token per integration, keep it in a secret store, and prefer read access.
									Reveals and changes are audited. Rotation invalidates the previous key
									immediately.
								</p>
							</LayerCard.Body>
						</LayerCard>
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
					className="max-h-[90dvh] overflow-y-auto"
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
								Connect an agent to the servers you select. Its key is encrypted and can be revealed
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
						{accessControls}
						{error && (
							<p role="alert" className="text-basalt-base text-basalt-destructive">
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
					className="max-h-[90dvh] overflow-y-auto"
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
								<div className="break-words rounded-lg border border-basalt-border bg-basalt-secondary px-3 py-2 text-basalt-base">
									<span className="font-medium">{action.token.name}</span>
									<span className="ml-2 text-basalt-muted-foreground">
										· {action.token.scope === "write" ? "Read + write" : "Read only"}
									</span>
									<p className="mt-1 text-basalt-sm text-basalt-muted-foreground">
										{serverNames(action.token.serverIds)}
									</p>
								</div>
								<div className="space-y-2">
									<Label htmlFor="token-confirmation">
										{action.kind === "edit" ? "Token name" : `Type ${action.token.name} to confirm`}
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
								{action.kind === "edit" && accessControls}
							</>
						)}
						{error && (
							<p role="alert" className="text-basalt-base text-basalt-destructive">
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
									(action.kind === "edit"
										? !confirmation.trim()
										: confirmation !== action.token.name)
								}
							>
								{busy
									? "Working…"
									: action?.kind === "edit"
										? "Save changes"
										: action
											? actionLabels[action.kind]
											: "Confirm"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
