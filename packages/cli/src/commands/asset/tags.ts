// bat-cli asset tags — Replace tags on an asset.
// Calls PUT /api/assets/:id/tags with { tag_ids: number[] }.

import type { AssetItem } from "@bat/shared";
import { MAX_TAGS_PER_ASSET } from "@bat/shared";
import type { ConfigManager } from "@nocoo/cli-base";
import { defineCommand } from "@nocoo/cli-base";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { ApiError, AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, success, warn } from "../../lib/output.js";

/**
 * Parse tag IDs from a comma-separated string.
 * Returns deduplicated positive integers or an error.
 */
function parseTagIds(raw: string): { ok: true; ids: number[] } | { ok: false; error: string } {
	if (raw.trim() === "") {
		return { ok: true, ids: [] };
	}

	const parts = raw
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	const ids: number[] = [];
	const seen = new Set<number>();

	for (const part of parts) {
		const num = Number(part);
		if (!Number.isInteger(num) || num <= 0) {
			return { ok: false, error: `Invalid tag ID "${part}" — must be a positive integer` };
		}
		if (!seen.has(num)) {
			seen.add(num);
			ids.push(num);
		}
	}

	if (ids.length > MAX_TAGS_PER_ASSET) {
		return { ok: false, error: `Too many tags (max ${MAX_TAGS_PER_ASSET})` };
	}

	return { ok: true, ids };
}

/**
 * Run asset tags replace. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runAssetTags(
	manager: ConfigManager<BatCliConfig>,
	assetId: string,
	opts: { tagIds?: string; clear?: boolean },
): Promise<number> {
	if (!manager.exists()) {
		error("Not configured — run 'bat-cli login' first.");
		return 1;
	}

	const config = manager.read();
	const validationError = validateConfig(config);
	if (validationError) {
		error(validationError);
		return 1;
	}

	// Mutual exclusion: --tag-ids and --clear
	if (opts.clear && opts.tagIds !== undefined) {
		error("Cannot use --tag-ids and --clear together");
		return 1;
	}

	// Determine tag IDs to set
	let ids: number[];
	if (opts.clear) {
		ids = [];
	} else if (opts.tagIds !== undefined) {
		const parsed = parseTagIds(opts.tagIds);
		if (!parsed.ok) {
			error(parsed.error);
			return 1;
		}
		ids = parsed.ids;
	} else {
		error("Specify --tag-ids or --clear");
		return 1;
	}

	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		const asset = await client.put<AssetItem>(`/api/assets/${assetId}/tags`, { tag_ids: ids });
		if (ids.length === 0) {
			success(`Tags cleared on ${asset.id}`);
		} else {
			success(`Tags set on ${asset.id}: [${ids.join(", ")}]`);
		}
		if (asset.tags.length > 0) {
			info(`  tags: ${asset.tags.map((t) => t.name).join(", ")}`);
		}
		return 0;
	} catch (err) {
		if (err instanceof AuthError) {
			error(`Authentication failed (${err.status}): ${err.message}`);
			warn("Token may be revoked. Run 'bat-cli login' to re-authenticate.");
			return 1;
		}
		if (err instanceof ApiError && err.status === 404) {
			error(`Asset not found: ${assetId}`);
			return 1;
		}
		if (err instanceof ApiError && err.status === 400) {
			error(`Invalid tag IDs: ${err.message}`);
			return 1;
		}
		if (err instanceof NetworkError) {
			error(`Cannot connect to Worker: ${err.message}`);
			return 1;
		}
		error(`Failed to set tags: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "tags",
		description: "Replace tags on an asset",
	},
	args: {
		id: {
			type: "positional",
			description: "Asset ID (e.g. ast_abc123)",
			required: true,
		},
		"tag-ids": {
			type: "string",
			description: "Comma-separated tag IDs (e.g. 1,2,3)",
		},
		clear: {
			type: "boolean",
			description: "Clear all tags",
		},
	},
	async run({ args }) {
		const manager = createConfigManager();
		const opts: Parameters<typeof runAssetTags>[2] = {};
		if (args["tag-ids"] !== undefined) {
			opts.tagIds = args["tag-ids"];
		}
		if (args.clear) {
			opts.clear = true;
		}
		process.exitCode = await runAssetTags(manager, args.id, opts);
	},
});
