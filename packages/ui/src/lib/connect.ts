import type { ConnectToken } from "@bat/shared";

export async function connectRequest<T>(
	path: string,
	options: { method?: string; body?: unknown; token?: ConnectToken } = {},
): Promise<T> {
	const headers: Record<string, string> = { "X-Bat-Management": "1" };
	if (options.body !== undefined) headers["Content-Type"] = "application/json";
	if (options.token) headers["If-Match"] = `"${options.token.id}:${options.token.version}"`;
	const response = await fetch(path, {
		method: options.method ?? "GET",
		headers,
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
		credentials: "same-origin",
		cache: "no-store",
		redirect: "error",
	});
	const body = await response.json().catch(() => null);
	if (!response.ok || !body)
		throw new Error(
			body?.error?.message ?? "Connect is unavailable. Reload the page to check your session.",
		);
	return body as T;
}

export function connectTokenStatus(
	token: ConnectToken,
	now = Date.now(),
): "Active" | "Expired" | "Revoked" {
	if (token.revokedAt) return "Revoked";
	if (token.expiresAt && Date.parse(token.expiresAt) <= now) return "Expired";
	return "Active";
}

export function connectDate(value: string | null): string {
	return value
		? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
				new Date(value),
			)
		: "Never used";
}

export function connectExpiryInput(value: string | null): string {
	if (!value) return "";
	const date = new Date(value);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
		.toISOString()
		.slice(0, 19)
		.replace(/:00$/, "");
}

export function connectExamples(baseUrl: string): { curl: string; agent: string } {
	return {
		curl: `# Read BAT_TOKEN from your secret store\nprintf 'Authorization: Bearer %s\\n' "$BAT_TOKEN" | \\\n  curl --fail-with-body --header @- \\\n  '${baseUrl}/capabilities'\n\n# List this key's authorized servers; an empty list means no server access\nprintf 'Authorization: Bearer %s\\n' "$BAT_TOKEN" | \\\n  curl --fail-with-body --header @- \\\n  '${baseUrl}/servers'\n\n# Replace SERVER_ID with a host_id from that list and read its ETag\nprintf 'Authorization: Bearer %s\\n' "$BAT_TOKEN" | \\\n  curl --fail-with-body --include --header @- \\\n  '${baseUrl}/servers/SERVER_ID'`,
		agent: `Connect to ${baseUrl} with the Bearer token from your secret store.\nStart with GET /capabilities and GET /openapi.json.\nUse GET /servers to discover this key's authorized servers and select a host_id as the target SERVER_ID. An empty list means no server access.\nUse GET or HEAD for reads and follow page.nextCursor.\nBefore a change, read the current ETag and send If-Match.\nPersist one Idempotency-Key per intent and reuse it for retries.\nFor destructive actions, explicitly acknowledge the target server with X-Bat-Confirm.\nIf an outcome is unknown, inspect /requests/{key} before doing anything else.\nNever place tokens in prompts, URLs, logs, or source code.`,
	};
}
