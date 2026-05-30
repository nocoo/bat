// Normalizer for C0 baseline snapshots. Redacts volatile fields so the
// snapshot is determined entirely by behaviour, not by wall-clock or
// generated id values.
//
// Rules:
//   - Keys matching VOLATILE_KEYS are replaced with sentinel strings:
//     timestamps → "<TS>", string ids → "<ID>", numeric ids → "<NID>",
//     hashes → "<HASH>", uptime/wall-clock seconds → "<DURATION>",
//     opaque tokens → "<TOKEN>".
//   - Arrays of objects are sorted by a stable key when present (host_id >
//     id > name > key > rule_id > tag), so server-side ordering noise
//     can't drift the snapshot.
//
// All other values are preserved verbatim. The goal is "structure + stable
// fields lock down behaviour; volatile fields can't drift the snapshot".

const TIMESTAMP_KEYS = new Set([
	"timestamp",
	"created_at",
	"updated_at",
	"last_seen",
	"last_heartbeat",
	"triggered_at",
	"first_seen",
	"identity_updated_at",
	"applied",
	"expires_at",
	"ts",
	"hour_ts",
	"boot_time",
	"from",
	"to",
	"checked_at",
	"window_start",
]);

const ID_KEYS = new Set([
	"id",
	"agent_id",
	"asset_id",
	"binding_id",
	"tag_id",
	"webhook_id",
	"cli_token_id",
]);

const HASH_KEYS = new Set(["hid", "token_hash", "source_key_short"]);

const TOKEN_KEYS = new Set(["token"]);

const DURATION_KEYS = new Set(["uptime", "uptime_seconds", "duration_seconds"]);

const STABLE_SORT_KEYS = [
	"host_id",
	"id",
	"name",
	"key",
	"rule_id",
	"tag",
	"agent_id",
	"asset_id",
] as const;

export function normalize(value: unknown): unknown {
	if (value === null || value === undefined) {
		return value;
	}
	if (Array.isArray(value)) {
		return normalizeArray(value);
	}
	if (typeof value === "object") {
		return normalizeObject(value as Record<string, unknown>);
	}
	return value;
}

function normalizeObject(obj: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	const keys = Object.keys(obj).sort();
	for (const k of keys) {
		const v = obj[k];
		if (v === undefined || v === null) {
			out[k] = v;
			continue;
		}
		if (TIMESTAMP_KEYS.has(k)) {
			out[k] = "<TS>";
		} else if (ID_KEYS.has(k)) {
			if (typeof v === "string") {
				out[k] = "<ID>";
			} else if (typeof v === "number") {
				out[k] = "<NID>";
			} else {
				out[k] = v;
			}
		} else if (HASH_KEYS.has(k)) {
			out[k] = "<HASH>";
		} else if (TOKEN_KEYS.has(k)) {
			out[k] = "<TOKEN>";
		} else if (DURATION_KEYS.has(k)) {
			out[k] = typeof v === "number" ? "<DURATION>" : v;
		} else {
			out[k] = normalize(v);
		}
	}
	return out;
}

function normalizeArray(arr: unknown[]): unknown[] {
	const mapped = arr.map(normalize);
	const sortKey = pickSortKey(mapped);
	if (sortKey) {
		return [...mapped].sort((a, b) =>
			stringCompare(extractKey(a, sortKey), extractKey(b, sortKey)),
		);
	}
	return mapped;
}

function pickSortKey(arr: unknown[]): string | null {
	if (arr.length === 0) {
		return null;
	}
	for (const k of STABLE_SORT_KEYS) {
		if (
			arr.every((row) => row && typeof row === "object" && k in (row as Record<string, unknown>))
		) {
			return k;
		}
	}
	return null;
}

function extractKey(row: unknown, key: string): string {
	if (row && typeof row === "object" && key in (row as Record<string, unknown>)) {
		const v = (row as Record<string, unknown>)[key];
		return typeof v === "string" ? v : JSON.stringify(v);
	}
	return "";
}

function stringCompare(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}
