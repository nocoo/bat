"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllowedPorts } from "@/lib/hooks";
import type { AlertItem } from "@bat/shared";
import { Plus, Shield, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useSWRConfig } from "swr";

async function apiRequest(url: string, options?: RequestInit) {
	const res = await fetch(url, {
		headers: { "Content-Type": "application/json" },
		...options,
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
	}
	if (res.status === 204) {
		return null;
	}
	return res.json();
}

/** Format a unix-seconds timestamp as relative time (e.g. "2h ago", "3d ago"). */
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

/** Extract unexpected port numbers from public_port alert messages. */
function extractAlertingPorts(alerts: AlertItem[]): number[] {
	const ports: number[] = [];
	for (const alert of alerts) {
		if (alert.rule_id !== "public_port" || !alert.message) {
			continue;
		}
		// Message format: "Unexpected public ports: 8080, 3000"
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
	hostId: string; // raw host_id (not hashed)
	hostAlerts: AlertItem[];
}

export function AllowedPortsPanel({ hostId, hostAlerts }: AllowedPortsPanelProps) {
	const { data: allowedPorts, mutate } = useAllowedPorts(hostId);
	const { mutate: globalMutate } = useSWRConfig();
	const [adding, setAdding] = useState(false);
	const [portInput, setPortInput] = useState("");
	const [reasonInput, setReasonInput] = useState("");
	// Quick-allow inline reason input state: which port is being allowed
	const [quickAllowPort, setQuickAllowPort] = useState<number | null>(null);
	const [quickAllowReason, setQuickAllowReason] = useState("");

	/** Revalidate related SWR caches so status badge and alert table update immediately. */
	const revalidateRelated = useCallback(() => {
		globalMutate("hosts");
		globalMutate("alerts");
		globalMutate("all-allowed-ports");
	}, [globalMutate]);

	const addPort = useCallback(
		async (port: number, reason: string) => {
			setAdding(true);
			try {
				await apiRequest(`/api/hosts/${hostId}/allowed-ports`, {
					method: "POST",
					body: JSON.stringify({ port, reason }),
				});
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
				await apiRequest(`/api/hosts/${hostId}/allowed-ports/${port}`, {
					method: "DELETE",
				});
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

	// Ports currently alerting that aren't already allowed
	const allowedSet = new Set(allowedPorts?.map((p) => p.port) ?? []);
	const alertingPorts = extractAlertingPorts(hostAlerts).filter((p) => !allowedSet.has(p));

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Shield className="h-4 w-4" />
					Allowed Ports
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{/* Currently allowed ports */}
					{allowedPorts && allowedPorts.length > 0 && (
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
					)}

					{/* Alerting ports — quick-allow buttons */}
					{alertingPorts.length > 0 && (
						<div className="space-y-1.5">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								Unexpected Ports
							</p>
							{alertingPorts.map((port) => (
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
													className="h-6 flex-1 rounded border border-input bg-background px-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
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

					{/* Manual add form */}
					<div className="flex items-center gap-2">
						<input
							type="number"
							placeholder="Port"
							value={portInput}
							onChange={(e) => setPortInput(e.target.value)}
							disabled={adding}
							className="h-8 w-20 rounded-md border border-input bg-background px-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
							className="h-8 flex-1 rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
