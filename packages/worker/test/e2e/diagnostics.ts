import { errorCategory } from "../../src/lib/error-category.js";

const request = globalThis.fetch;
globalThis.fetch = async (...args) => {
	const [input, init] = args;
	const headers = new Headers(
		init?.headers ?? (input instanceof Request ? input.headers : undefined),
	);
	headers.set("Connection", "close");
	const response = await request(input, { ...init, headers });
	// Drain the transport even when a test only asserts status. Otherwise fetch's
	// pooled sockets remain occupied by unread bodies until garbage collection.
	const body = await response.clone().arrayBuffer();
	if (response.status >= 500 && response.status !== 501) {
		const text = new TextDecoder().decode(body);
		const diagnostic = response.headers.get("X-Bat-Diagnostic");
		const category = [
			"database_busy",
			"request_context",
			"request_stalled",
			"body_unavailable",
			"connection_refused",
			"connection_closed",
			"connection_timeout",
			"connection",
			"database",
			"coordinator_reset",
			"cpu_limit",
			"type",
			"range",
			"unexpected",
		].includes(diagnostic ?? "")
			? diagnostic
			: errorCategory(text);
		const frames = [
			...new Set(
				text.match(
					/\b(?:index|cli|entry|ProxyWorker|InspectorProxyWorker)\.(?:[cm]?js|ts):\d+:\d+/g,
				),
			),
		].slice(0, 8);
		console.error(
			`L2 HTTP ${response.status}: ${diagnostic ? "application" : "runtime"}/${category}; network_lost=${/network connection lost/i.test(text)}; frames=${frames.join(",")}`,
		);
	}
	return response;
};
