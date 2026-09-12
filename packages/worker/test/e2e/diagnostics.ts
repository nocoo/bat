import { errorCategory } from "../../src/lib/error-category.js";

const request = globalThis.fetch;
globalThis.fetch = async (...args) => {
	const response = await request(...args);
	if (response.status >= 500) {
		const body = await response
			.clone()
			.text()
			.catch(() => "");
		const diagnostic = response.headers.get("X-Bat-Diagnostic");
		const category = [
			"database_busy",
			"request_context",
			"request_stalled",
			"body_unavailable",
			"connection",
			"database",
			"coordinator_reset",
			"cpu_limit",
			"type",
			"range",
			"unexpected",
		].includes(diagnostic ?? "")
			? diagnostic
			: errorCategory(body);
		console.error(
			`L2 HTTP ${response.status}: ${diagnostic ? "application" : "runtime"}/${category}`,
		);
	}
	return response;
};
