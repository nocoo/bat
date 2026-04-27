import { deleteAPI, postAPI } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllowedPorts, useHostTier2 } from "@/hooks";
import { categorizeListening, formatProcess } from "@/lib/listening-ports";
import type { AlertItem, AllowedPort } from "@bat/shared";
import { Check, Plus, Radio, Shield, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSWRConfig } from "swr";

function relativeTime(unixSeconds: number): string {
	const diff = Math.floor(Date.now() / 1000) - unixSeconds;
	if (diff < 60) {
		return "just now";
	}
	if (diff < 3600) {
		return `${Math.floor(diff / 60)}m ago`;
	}
	if (diff < 86400) {
		return `${Math.floor(diff / 3600)}h ago`;
	}
	return `${Math.floor(diff / 86400)}d ago`;
}

function extractAlertingPorts(alerts: AlertItem[]): number[] {
	const ports: number[] = [];
	for (const alert of alerts) {
		if (alert.rule_id !== "public_port" || !alert.message) {
			continue;
		}
		const match = alert.message.match(/Unexpected public ports:\s*(.+)/);
		if (match?.[1]) {
			for (const s of match[1].split(",")) {
				const n = Number(s.trim());
				if (Number.isInteger(n) && n > 0) {
					ports.push(n);
				}
			}
		}
	}
	return ports;
}

interface AllowedPortsPanelProps {
	hostId: string;
	hashedHostId: string;
	hostAlerts: AlertItem[];
}

export function AllowedPortsPanel({ hostId, hashedHostId, hostAlerts }: AllowedPortsPanelProps) {
	const { data: allowedPorts, mutate } = useAllowedPorts(hostId);
	const { data: tier2 } = useHostTier2(hashedHostId);
	const { mutate: globalMutate } = useSWRConfig();
	const [adding, setAdding] = useState(false);
	const [portInput, setPortInput] = useState("");
	const [reasonInput, setReasonInput] = useState("");
	const [quickAllowPort, setQuickAllowPort] = useState<number | null>(null);
	const [quickAllowReason, setQuickAllowReason] = useState("");

	const listening = useMemo(
		() =>
			categorizeListening(tier2?.ports?.listening ?? [], allowedPorts?.map((p) => p.port) ?? []),
		[tier2, allowedPorts],
	);

	const revalidateRelated = useCallback(() => {
		globalMutate("hosts");
		globalMutate("alerts");
		globalMutate("all-allowed-ports");
	}, [globalMutate]);

	const addPort = useCallback(
		async (port: number, reason: string) => {
			setAdding(true);
			try {
				await postAPI<AllowedPort>(`/api/hosts/${hostId}/allowed-ports`, { port, reason });
				await mutate();
				revalidateRelated();
			} catch {
				// TODO: toast
			} finally {
				setAdding(false);
			}
		},
		[hostId, mutate, revalidateRelated],
	);

	const removePort = useCallback(
		async (port: number) => {
			try {
				await deleteAPI(`/api/hosts/${hostId}/allowed-ports/${port}`);
				await mutate();
				revalidateRelated();
			} catch {
				// TODO: toast
			}
		},
		[hostId, mutate, revalidateRelated],
	);

	const handleManualAdd = useCallback(async () => {
		const port = Number(portInput.trim());
		if (!Number.isInteger(port) || port < 1 || port > 65535) {
			return;
		}
		await addPort(port, reasonInput.trim());
		setPortInput("");
		setReasonInput("");
	}, [portInput, reasonInput, addPort]);

	const handleQuickAllow = useCallback(
		async (port: number) => {
			await addPort(port, quickAllowReason.trim());
			setQuickAllowPort(null);
			setQuickAllowReason("");
		},
		[quickAllowReason, addPort],
	);

	const allowedSet = new Set(allowedPorts?.map((p) => p.port) ?? []);
	// Fallback: if tier2 hasn't arrived yet but the worker already raised a
	// public_port alert, surface those ports so quick-allow still works.
	const alertingFallback =
		listening.publicUnallowed.length === 0
			? extractAlertingPorts(hostAlerts).filter((p) => !allowedSet.has(p))
			: [];

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Shield className="h-4 w-4" />
					Ports
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-4">
					{(listening.publicUnallowed.length > 0 ||
						listening.publicAllowed.length > 0 ||
						listening.local.length > 0) && (
						<div className="space-y-2">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
								<Radio className="h-3 w-3" />
								Listening
							</p>
							{listening.publicUnallowed.length > 0 && (
								<div className="grid gap-1">
									{listening.publicUnallowed.map((p) => (
										<div
											key={`pu-${p.port}-${p.bind}-${p.protocol}`}
											className="flex items-center gap-2 text-sm"
										>
											<span className="font-mono font-medium text-amber-500 w-12 shrink-0">
												{p.port}
											</span>
											<span className="text-xs text-muted-foreground font-mono shrink-0">
												{p.bind} {p.protocol}
											</span>
											<span className="text-xs text-muted-foreground truncate flex-1">
												{formatProcess(p.process, p.pid)}
											</span>
											{quickAllowPort === p.port ? (
												<div className="flex items-center gap-1.5 flex-1">
													<input
														type="text"
														placeholder="Reason (optional)…"
														value={quickAllowReason}
														onChange={(e) => setQuickAllowReason(e.target.value)}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																handleQuickAllow(p.port);
															}
															if (e.key === "Escape") {
																setQuickAllowPort(null);
																setQuickAllowReason("");
															}
														}}
														disabled={adding}
														className="h-6 flex-1 rounded border border-border bg-secondary hover:border-foreground/20 px-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
														maxLength={200}
													/>
													<button
														type="button"
														onClick={() => handleQuickAllow(p.port)}
														disabled={adding}
														className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
													>
														Allow
													</button>
													<button
														type="button"
														onClick={() => {
															setQuickAllowPort(null);
															setQuickAllowReason("");
														}}
														className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
													>
														<X className="h-3 w-3" />
													</button>
												</div>
											) : (
												<button
													type="button"
													onClick={() => {
														setQuickAllowPort(p.port);
														setQuickAllowReason("");
													}}
													className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
												>
													<Plus className="h-3 w-3" />
													Allow
												</button>
											)}
										</div>
									))}
								</div>
							)}
							{listening.publicAllowed.length > 0 && (
								<div className="grid gap-1">
									{listening.publicAllowed.map((p) => (
										<div
											key={`pa-${p.port}-${p.bind}-${p.protocol}`}
											className="flex items-center gap-2 text-sm text-muted-foreground"
										>
											<Check className="h-3 w-3 text-emerald-500 shrink-0" />
											<span className="font-mono w-10 shrink-0">{p.port}</span>
											<span className="text-xs font-mono shrink-0">
												{p.bind} {p.protocol}
											</span>
											<span className="text-xs truncate">{formatProcess(p.process, p.pid)}</span>
										</div>
									))}
								</div>
							)}
							{listening.local.length > 0 && (
								<details className="group">
									<summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
										Local-only ({listening.local.length})
									</summary>
									<div className="mt-1.5 grid gap-1 pl-4">
										{listening.local.map((p) => (
											<div
												key={`lo-${p.port}-${p.bind}-${p.protocol}`}
												className="flex items-center gap-2 text-xs text-muted-foreground"
											>
												<span className="font-mono w-10 shrink-0">{p.port}</span>
												<span className="font-mono shrink-0">
													{p.bind} {p.protocol}
												</span>
												<span className="truncate">{formatProcess(p.process, p.pid)}</span>
											</div>
										))}
									</div>
								</details>
							)}
						</div>
					)}

					{alertingFallback.length > 0 && (
						<div className="space-y-1.5">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Unexpected Ports
							</p>
							{alertingFallback.map((port) => (
								<div key={port}>
									<div className="flex items-center gap-2 text-sm">
										<span className="font-mono font-medium text-amber-500">{port}</span>
										{quickAllowPort === port ? (
											<div className="flex items-center gap-1.5 flex-1">
												<input
													type="text"
													placeholder="Reason (optional)…"
													value={quickAllowReason}
													onChange={(e) => setQuickAllowReason(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter") {
															e.preventDefault();
															handleQuickAllow(port);
														}
														if (e.key === "Escape") {
															setQuickAllowPort(null);
															setQuickAllowReason("");
														}
													}}
													disabled={adding}
													className="h-6 flex-1 rounded border border-border bg-secondary hover:border-foreground/20 px-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
													maxLength={200}
												/>
												<button
													type="button"
													onClick={() => handleQuickAllow(port)}
													disabled={adding}
													className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
												>
													Allow
												</button>
												<button
													type="button"
													onClick={() => {
														setQuickAllowPort(null);
														setQuickAllowReason("");
													}}
													className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
												>
													<X className="h-3 w-3" />
												</button>
											</div>
										) : (
											<button
												type="button"
												onClick={() => {
													setQuickAllowPort(port);
													setQuickAllowReason("");
												}}
												className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
											>
												<Plus className="h-3 w-3" />
												Allow
											</button>
										)}
									</div>
								</div>
							))}
						</div>
					)}

					{allowedPorts && allowedPorts.length > 0 && (
						<div className="space-y-2">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Allowlist
							</p>
							<div className="grid gap-1.5">
								{allowedPorts.map((entry) => (
									<div
										key={entry.port}
										className="flex items-center justify-between gap-2 rounded-md bg-secondary/50 px-2.5 py-1.5 text-sm"
									>
										<div className="flex items-center gap-2 min-w-0">
											<span className="font-mono font-medium shrink-0">{entry.port}</span>
											{entry.reason && (
												<span className="text-muted-foreground truncate">{entry.reason}</span>
											)}
										</div>
										<div className="flex items-center gap-2 shrink-0">
											<span className="text-xs text-muted-foreground">
												{relativeTime(entry.created_at)}
											</span>
											<button
												type="button"
												onClick={() => removePort(entry.port)}
												className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
												title="Remove from allowlist"
											>
												<X className="h-3.5 w-3.5" />
											</button>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					<div className="flex items-center gap-2">
						<input
							type="number"
							placeholder="Port"
							value={portInput}
							onChange={(e) => setPortInput(e.target.value)}
							disabled={adding}
							className="h-8 w-20 rounded-md border border-border bg-secondary hover:border-foreground/20 px-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
							min={1}
							max={65535}
						/>
						<input
							type="text"
							placeholder="Reason…"
							value={reasonInput}
							onChange={(e) => setReasonInput(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleManualAdd();
								}
							}}
							disabled={adding}
							className="h-8 flex-1 rounded-md border border-border bg-secondary hover:border-foreground/20 px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
							maxLength={200}
						/>
						<button
							type="button"
							onClick={handleManualAdd}
							disabled={adding || !portInput.trim()}
							className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
						>
							Add
						</button>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
