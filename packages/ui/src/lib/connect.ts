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

export function connectExamples(
	baseUrl: string,
	serverId: string,
): { curl: string; agent: string } {
	const server = encodeURIComponent(serverId || "SERVER_ID");
	return {
		curl: `# Read BAT_TOKEN from your secret store\nprintf 'Authorization: Bearer %s\\n' "$BAT_TOKEN" | \\\n  curl --fail-with-body --header @- \\\n  '${baseUrl}/capabilities'\n\n# Discover the server and its configuration ETag\nprintf 'Authorization: Bearer %s\\n' "$BAT_TOKEN" | \\\n  curl --fail-with-body --include --header @- \\\n  '${baseUrl}/servers/${server}'`,
		agent: `Connect to ${baseUrl} with the Bearer token from your secret store.\nStart with GET /capabilities and GET /openapi.json.\nOperate only on server ${serverId || "SERVER_ID"}.\nUse GET or HEAD for reads and follow page.nextCursor.\nBefore a change, read the current ETag and send If-Match.\nPersist one Idempotency-Key per intent and reuse it for retries.\nFor destructive actions, explicitly acknowledge the server with X-Bat-Confirm.\nIf an outcome is unknown, inspect /requests/{key} before doing anything else.\nNever place tokens in prompts, URLs, logs, or source code.`,
	};
}
