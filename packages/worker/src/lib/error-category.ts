const categories = [
	["database_busy", /SQLITE_BUSY|database is locked/i],
	["request_context", /different request|I\/O.*context/i],
	["request_stalled", /never generate a response|hanging Promise/i],
	["body_unavailable", /body.*(?:used|consum)|stream.*(?:locked|closed)/i],
	["connection_refused", /ECONNREFUSED/],
	["connection_closed", /ECONNRESET|UND_ERR_SOCKET|other side closed/],
	["connection_timeout", /ETIMEDOUT|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT/],
	["connection", /network connection|connection (?:lost|reset)|fetch failed|socket/i],
	["database", /D1_ERROR|SQLITE_/i],
	["coordinator_reset", /Durable Object.*(?:reset|dead|abort)/i],
	["cpu_limit", /CPU.*limit|exceeded.*CPU/i],
] as const;

/** Only fixed categories cross the diagnostic boundary, never exception text. */
export function errorCategory(error: unknown): string {
	const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
	for (const [category, pattern] of categories) if (pattern.test(message)) return category;
	if (error instanceof TypeError) return "type";
	if (error instanceof RangeError) return "range";
	return "unexpected";
}
