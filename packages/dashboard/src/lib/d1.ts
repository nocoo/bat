// D1 REST API client — Dashboard direct access to Cloudflare D1
// Used for user-initiated state (tags) that the Worker/Probe never touch.
// Spec: docs/11-host-tags.md § D1 REST API access

export interface D1Result<T> {
	results: T[];
	success: boolean;
	meta: {
		changes: number;
		last_row_id: number;
		rows_read: number;
		rows_written: number;
	};
}

/**
 * Execute a parameterized SQL query against D1 via Cloudflare REST API.
 * Returns typed results. Throws on network or API errors.
 */
export async function d1Query<T = Record<string, unknown>>(
	sql: string,
	params?: unknown[],
): Promise<D1Result<T>> {
	const accountId = process.env.CF_ACCOUNT_ID;
	const databaseId = process.env.CF_D1_DATABASE_ID;
	const apiToken = process.env.CF_API_TOKEN;

	if (!accountId || !databaseId || !apiToken) {
		throw new Error(
			"Server misconfigured: missing CF_ACCOUNT_ID, CF_D1_DATABASE_ID, or CF_API_TOKEN",
		);
	}

	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ sql, params: params ?? [] }),
		},
	);

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`D1 API error (${res.status}): ${text}`);
	}

	const json = (await res.json()) as {
		result: D1Result<T>[];
		success: boolean;
		errors: { message: string }[];
	};

	if (!json.success || json.errors?.length > 0) {
		const msg = json.errors?.map((e) => e.message).join("; ") ?? "Unknown D1 error";
		throw new Error(`D1 query failed: ${msg}`);
	}

	const result = json.result[0];
	if (!result) {
		throw new Error("D1 query returned no result set");
	}

	return result;
}
