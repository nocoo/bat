import { errorCategory } from "../../src/lib/error-category.js";

const request = globalThis.fetch;
globalThis.fetch = async (...args) => {
	const response = await request(...args);
	// Drain the transport even when a test only asserts status. Otherwise fetch's
	// pooled sockets remain occupied by unread bodies until garbage collection.
	const body = await response.clone().arrayBuffer();
	if (response.status >= 500 && response.status !== 501) {
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
			: errorCategory(new TextDecoder().decode(body));
		console.error(
			`L2 HTTP ${response.status}: ${diagnostic ? "application" : "runtime"}/${category}`,
		);
	}
	return response;
};
