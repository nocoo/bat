// bat-cli asset create — Create a new asset.
// Required: type (positional), name (positional).
// Optional: --host-id, --subtype, --provider, --status, --metadata (JSON string).

import type { AssetCreateBody, AssetItem, AssetStatus, AssetType } from "@bat/shared";
import { VALID_ASSET_STATUSES, VALID_ASSET_TYPES, validateMetadata } from "@bat/shared";
import type { ConfigManager } from "@nocoo/base-cli";
import { defineCommand } from "@nocoo/base-cli";
import type { BatCliConfig } from "../../lib/config.js";
import { createConfigManager, validateConfig } from "../../lib/config.js";
import { AuthError, HttpClient, NetworkError } from "../../lib/http.js";
import { error, info, success, warn } from "../../lib/output.js";

/**
 * Run asset create. Exported for testing.
 *
 * @returns 0 on success, 1 on failure
 */
export async function runAssetCreate(
	manager: ConfigManager<BatCliConfig>,
	opts: {
		type: string;
		name: string;
		hostId?: string;
		subtype?: string;
		provider?: string;
		status?: string;
		metadata?: string;
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

	// Validate type
	if (!(VALID_ASSET_TYPES as readonly string[]).includes(opts.type)) {
		error(`Invalid type "${opts.type}" — must be one of: ${VALID_ASSET_TYPES.join(", ")}`);
		return 1;
	}

	// Validate status if provided
	if (opts.status) {
		if (!(VALID_ASSET_STATUSES as readonly string[]).includes(opts.status)) {
			error(`Invalid status "${opts.status}" — must be one of: ${VALID_ASSET_STATUSES.join(", ")}`);
			return 1;
		}
	}

	// Parse and validate metadata if provided
	let metadata: Record<string, unknown> | undefined;
	if (opts.metadata) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(opts.metadata);
		} catch {
			error("Invalid metadata — must be valid JSON");
			return 1;
		}
		// CLI requires an explicit plain object — reject null, arrays, primitives
		if (parsed === null || parsed === undefined) {
			error("Invalid metadata — metadata must be a plain object");
			return 1;
		}
		const result = validateMetadata(parsed);
		if (!result.ok) {
			error(`Invalid metadata — ${result.error}`);
			return 1;
		}
		metadata = parsed as Record<string, unknown>;
	}

	const body: AssetCreateBody = {
		type: opts.type as AssetType,
		name: opts.name,
	};
	if (opts.hostId) {
		body.host_id = opts.hostId;
	}
	if (opts.subtype) {
		body.subtype = opts.subtype;
	}
	if (opts.provider) {
		body.provider = opts.provider;
	}
	if (opts.status) {
		body.status = opts.status as AssetStatus;
	}
	if (metadata) {
		body.metadata = metadata;
	}

	const client = new HttpClient(config.worker_url, config.api_key);
	try {
		const asset = await client.post<AssetItem>("/api/assets", body);
		success(`Asset created: ${asset.id}`);
		info(`  type: ${asset.type}`);
		info(`  name: ${asset.name}`);
		info(`  status: ${asset.status}`);
		return 0;
	} catch (err) {
		if (err instanceof AuthError) {
			error(`Authentication failed (${err.status}): ${err.message}`);
			warn("Token may be revoked. Run 'bat-cli login' to re-authenticate.");
			return 1;
		}
		if (err instanceof NetworkError) {
			error(`Cannot connect to Worker: ${err.message}`);
			return 1;
		}
		error(`Failed to create asset: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

export default defineCommand({
	meta: {
		name: "create",
		description: "Create a new asset",
	},
	args: {
		type: {
			type: "positional",
			description: `Asset type (${VALID_ASSET_TYPES.join(", ")})`,
			required: true,
		},
		name: {
			type: "positional",
			description: "Asset name",
			required: true,
		},
		"host-id": {
			type: "string",
			description: "Host ID to associate with",
		},
		subtype: {
			type: "string",
			description: "Asset subtype",
		},
		provider: {
			type: "string",
			description: "Provider name",
		},
		status: {
			type: "string",
			description: `Asset status (${VALID_ASSET_STATUSES.join(", ")})`,
		},
		metadata: {
			type: "string",
			description: 'Metadata as JSON string (e.g. \'{"key":"value"}\')',
		},
	},
	async run({ args }) {
		const manager = createConfigManager();
		const opts: Parameters<typeof runAssetCreate>[1] = {
			type: args.type,
			name: args.name,
		};
		if (args["host-id"]) {
			opts.hostId = args["host-id"];
		}
		if (args.subtype) {
			opts.subtype = args.subtype;
		}
		if (args.provider) {
			opts.provider = args.provider;
		}
		if (args.status) {
			opts.status = args.status;
		}
		if (args.metadata) {
			opts.metadata = args.metadata;
		}
		process.exitCode = await runAssetCreate(manager, opts);
	},
});
