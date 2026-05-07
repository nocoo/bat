// bat-cli asset update — Update an existing asset's fields.
// Only fields explicitly provided are sent; absent fields are left unchanged.
// Null semantics: --clear-* flags send null to clear a field.
// Mutual exclusion: --field and --clear-field for the same field is an error.

import type { AssetItem, AssetStatus, AssetUpdateBody } from "@bat/shared";
import { VALID_ASSET_STATUSES } from "@bat/shared";
import { defineCommand } from "@nocoo/cli-base";
import type { ConfigManager } from "@nocoo/cli-base";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { ApiError, AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, success, warn } from "../../lib/output.js";

/**
 * Run asset update. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runAssetUpdate(
	manager: ConfigManager<BatCliConfig>,
	assetId: string,
	opts: {
		name?: string;
		hostId?: string;
		clearHostId?: boolean;
		subtype?: string;
		clearSubtype?: boolean;
		provider?: string;
		clearProvider?: boolean;
		status?: string;
		metadata?: string;
		clearMetadata?: boolean;
	},
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

	// Mutual exclusion: set and clear for the same field
	if (opts.hostId && opts.clearHostId) {
		error("Cannot use --host-id and --clear-host-id together");
		return 1;
	}
	if (opts.subtype && opts.clearSubtype) {
		error("Cannot use --subtype and --clear-subtype together");
		return 1;
	}
	if (opts.provider && opts.clearProvider) {
		error("Cannot use --provider and --clear-provider together");
		return 1;
	}
	if (opts.metadata && opts.clearMetadata) {
		error("Cannot use --metadata and --clear-metadata together");
		return 1;
	}

	// Validate status
	if (opts.status) {
		if (!(VALID_ASSET_STATUSES as readonly string[]).includes(opts.status)) {
			error(`Invalid status "${opts.status}" — must be one of: ${VALID_ASSET_STATUSES.join(", ")}`);
			return 1;
		}
	}

	// Parse metadata JSON if provided
	let metadata: Record<string, unknown> | undefined;
	if (opts.metadata) {
		try {
			metadata = JSON.parse(opts.metadata) as Record<string, unknown>;
		} catch {
			error("Invalid metadata — must be valid JSON");
			return 1;
		}
	}

	// Build update body — only include fields explicitly provided
	const body: AssetUpdateBody = {};
	if (opts.name) {
		body.name = opts.name;
	}
	if (opts.clearHostId) {
		body.host_id = null;
	} else if (opts.hostId) {
		body.host_id = opts.hostId;
	}
	if (opts.clearSubtype) {
		body.subtype = null;
	} else if (opts.subtype) {
		body.subtype = opts.subtype;
	}
	if (opts.clearProvider) {
		body.provider = null;
	} else if (opts.provider) {
		body.provider = opts.provider;
	}
	if (opts.status) {
		body.status = opts.status as AssetStatus;
	}
	if (opts.clearMetadata) {
		body.metadata = {};
	} else if (metadata) {
		body.metadata = metadata;
	}

	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		const asset = await client.patch<AssetItem>(`/api/assets/${assetId}`, body);
		success(`Asset updated: ${asset.id}`);
		info(`  name: ${asset.name}`);
		info(`  status: ${asset.status}`);
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
		if (err instanceof NetworkError) {
			error(`Cannot connect to Worker: ${err.message}`);
			return 1;
		}
		error(`Failed to update asset: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "update",
		description: "Update an existing asset",
	},
	args: {
		id: {
			type: "positional",
			description: "Asset ID (e.g. ast_abc123)",
			required: true,
		},
		name: {
			type: "string",
			description: "Set name",
		},
		"host-id": {
			type: "string",
			description: "Set host ID",
		},
		"clear-host-id": {
			type: "boolean",
			description: "Clear host ID (set to null)",
		},
		subtype: {
			type: "string",
			description: "Set subtype",
		},
		"clear-subtype": {
			type: "boolean",
			description: "Clear subtype (set to null)",
		},
		provider: {
			type: "string",
			description: "Set provider",
		},
		"clear-provider": {
			type: "boolean",
			description: "Clear provider (set to null)",
		},
		status: {
			type: "string",
			description: `Asset status (${VALID_ASSET_STATUSES.join(", ")})`,
		},
		metadata: {
			type: "string",
			description: 'Metadata as JSON string (e.g. \'{"key":"value"}\')',
		},
		"clear-metadata": {
			type: "boolean",
			description: "Clear metadata (reset to empty)",
		},
	},
	async run({ args }) {
		const manager = createConfigManager();
		const opts: Parameters<typeof runAssetUpdate>[2] = {};
		if (args.name) {
			opts.name = args.name;
		}
		if (args["host-id"]) {
			opts.hostId = args["host-id"];
		}
		if (args["clear-host-id"]) {
			opts.clearHostId = true;
		}
		if (args.subtype) {
			opts.subtype = args.subtype;
		}
		if (args["clear-subtype"]) {
			opts.clearSubtype = true;
		}
		if (args.provider) {
			opts.provider = args.provider;
		}
		if (args["clear-provider"]) {
			opts.clearProvider = true;
		}
		if (args.status) {
			opts.status = args.status;
		}
		if (args.metadata) {
			opts.metadata = args.metadata;
		}
		if (args["clear-metadata"]) {
			opts.clearMetadata = true;
		}
		process.exitCode = await runAssetUpdate(manager, args.id, opts);
	},
});
