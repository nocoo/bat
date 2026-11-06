// Trusted origins for workstation login and probe traffic.
// The machine host is derived locally; it is never taken from callback data.

export interface WorkstationOrigins {
	/** Access-protected dashboard that serves the login page. */
	dashboard: string;
	/** Ingest origin that exposes the workstation auth and probe routes. */
	machine: string;
}

export const TRUSTED_DASHBOARD_ORIGIN = "https://bat.hexly.ai";
export const TRUSTED_MACHINE_ORIGIN = "https://bat-ingest.worker.hexly.ai";

const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "[::1]", "::1"];

function originOf(url: URL): string {
	return `${url.protocol}//${url.host}`;
}

/**
 * Resolve the dashboard and machine origins.
 * Production uses the fixed trusted pair. Local acceptance passes an explicit
 * loopback origin, where dashboard and ingest are the same local Worker.
 */
export function resolveOrigins(loopbackUrl?: string): WorkstationOrigins {
	if (loopbackUrl === undefined) {
		return { dashboard: TRUSTED_DASHBOARD_ORIGIN, machine: TRUSTED_MACHINE_ORIGIN };
	}
	let url: URL;
	try {
		url = new URL(loopbackUrl);
	} catch {
		throw new Error(`invalid --loopback-url: ${loopbackUrl}`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("--loopback-url must use http or https");
	}
	if (!LOOPBACK_HOSTS.includes(url.hostname)) {
		throw new Error("--loopback-url must point at 127.0.0.1, localhost or ::1");
	}
	if (url.username !== "" || url.password !== "") {
		throw new Error("--loopback-url must not contain credentials");
	}
	if (url.search !== "" || url.hash !== "") {
		throw new Error("--loopback-url must not contain a query or fragment");
	}
	if (url.pathname !== "/") {
		throw new Error("--loopback-url must be an origin without a path");
	}
	const origin = originOf(url);
	return { dashboard: origin, machine: origin };
}

/** The exchange response must name exactly the machine origin we trust. */
export function isExpectedWorkerUrl(input: string, expected: string): boolean {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return false;
	}
	if (url.username !== "" || url.password !== "") {
		return false;
	}
	if (url.search !== "" || url.hash !== "") {
		return false;
	}
	if (url.pathname !== "/") {
		return false;
	}
	return originOf(url) === expected;
}
