// Pure helpers for grouping a host's currently-listening ports against the
// per-host allowlist + the workspace-wide default allowlist. Lives outside the
// React component so the categorization rules are unit-testable.
import { DEFAULT_PUBLIC_PORT_ALLOWLIST, type ListeningPort } from "@bat/shared";

export type PortCategory = "public-unallowed" | "public-allowed" | "local";

export interface CategorizedPort {
	port: number;
	bind: string;
	protocol: ListeningPort["protocol"];
	pid: number | null;
	process: string | null;
	category: PortCategory;
}

export interface CategorizedListening {
	publicUnallowed: CategorizedPort[];
	publicAllowed: CategorizedPort[];
	local: CategorizedPort[];
}

/** A bind address is "public" when it accepts traffic from any interface. */
export function isPublicBind(bind: string): boolean {
	return bind === "0.0.0.0" || bind === "::";
}

/**
 * Group listening ports for display. De-duplicates rows that share
 * (port, bind, protocol, process) — netstat-style output frequently lists the
 * same socket twice (IPv4 + IPv6) and we don't want to render both.
 */
export function categorizeListening(
	listening: ListeningPort[],
	allowedPorts: readonly number[],
): CategorizedListening {
	const allowed = new Set<number>([...DEFAULT_PUBLIC_PORT_ALLOWLIST, ...allowedPorts]);
	const seen = new Set<string>();
	const publicUnallowed: CategorizedPort[] = [];
	const publicAllowed: CategorizedPort[] = [];
	const local: CategorizedPort[] = [];

	for (const p of listening) {
		const key = `${p.port}|${p.bind}|${p.protocol}|${p.process ?? ""}`;
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);

		const pub = isPublicBind(p.bind);
		const category: PortCategory = pub
			? allowed.has(p.port)
				? "public-allowed"
				: "public-unallowed"
			: "local";

		const row: CategorizedPort = { ...p, category };
		if (category === "public-unallowed") {
			publicUnallowed.push(row);
		} else if (category === "public-allowed") {
			publicAllowed.push(row);
		} else {
			local.push(row);
		}
	}

	const byPort = (a: CategorizedPort, b: CategorizedPort) => a.port - b.port;
	publicUnallowed.sort(byPort);
	publicAllowed.sort(byPort);
	local.sort(byPort);

	return { publicUnallowed, publicAllowed, local };
}

/** "sshd(1234)" / "sshd" / "pid 1234" / "—" depending on what's known. */
export function formatProcess(process: string | null, pid: number | null): string {
	if (process && pid != null) {
		return `${process}(${pid})`;
	}
	if (process) {
		return process;
	}
	if (pid != null) {
		return `pid ${pid}`;
	}
	return "—";
}
