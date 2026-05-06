// @bat/shared — Agent and Asset types for the digital asset catalog
// Design: #bat-滚动窗口:ddebc0ac

// --- ID generation ---

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
const ID_SUFFIX_LENGTH = 21;

/**
 * Generate a prefixed unique ID using crypto-random bytes.
 * Format: prefix + 21 random alphanumeric chars (e.g. "agt_a1b2c3d4e5f6g7h8i9j0k")
 * Prefix must match /^[a-z]+_$/ pattern.
 */
export function generateId(prefix: string): string {
	if (!/^[a-z]+_$/.test(prefix)) {
		throw new Error(
			`Invalid ID prefix: "${prefix}" (must be lowercase letters + trailing underscore)`,
		);
	}
	const bytes = new Uint8Array(ID_SUFFIX_LENGTH);
	crypto.getRandomValues(bytes);
	let id = prefix;
	for (let i = 0; i < ID_SUFFIX_LENGTH; i++) {
		const byte = bytes[i] ?? 0;
		id += ID_ALPHABET[byte % ID_ALPHABET.length];
	}
	return id;
}

// --- Validation constants ---

export const AGENT_MATCH_KEY_MAX_LENGTH = 256;
export const AGENT_NICKNAME_MAX_LENGTH = 64;
export const AGENT_ROLE_MAX_LENGTH = 128;
export const AGENT_RUNTIME_APP_MAX_LENGTH = 64;
export const AGENT_RUNTIME_VERSION_MAX_LENGTH = 32;
export const AGENT_SOURCE_KEY_MAX_LENGTH = 128;
export const ASSET_NAME_MAX_LENGTH = 128;
export const ASSET_SUBTYPE_MAX_LENGTH = 64;
export const ASSET_PROVIDER_MAX_LENGTH = 64;
export const ASSET_METADATA_MAX_BYTES = 4096;
export const MAX_TAGS_PER_AGENT = 10;
export const MAX_TAGS_PER_ASSET = 10;
export const MAX_HEARTBEAT_AGENTS = 100;
export const CLI_TOKEN_LABEL_MAX_LENGTH = 64;

// --- Enum types ---

export type AgentStatus = "running" | "stopped" | "missing" | "unknown";
export type AssetType = "cloud_service" | "domain" | "container" | "cli_tool" | "mcp_service";
export type AssetStatus = "active" | "inactive" | "missing" | "unknown";
export type CliTokenScope = "assets";

export const VALID_AGENT_STATUSES: readonly AgentStatus[] = [
	"running",
	"stopped",
	"missing",
	"unknown",
] as const;

export const VALID_ASSET_TYPES: readonly AssetType[] = [
	"cloud_service",
	"domain",
	"container",
	"cli_tool",
	"mcp_service",
] as const;

export const VALID_ASSET_STATUSES: readonly AssetStatus[] = [
	"active",
	"inactive",
	"missing",
	"unknown",
] as const;

export const VALID_CLI_TOKEN_SCOPES: readonly CliTokenScope[] = ["assets"] as const;

// --- Validators ---

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Check if a value is a plain object (prototype is Object.prototype or null).
 * Rejects Date, Map, Set, class instances, arrays, etc.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return false;
	}
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

/**
 * Validate metadata: must be a plain object, max 4096 UTF-8 bytes when stringified.
 * Rejects arrays, primitives, Date, Map, class instances, circular refs, BigInt.
 */
export function validateMetadata(input: unknown): ValidationResult<string> {
	if (input === undefined || input === null) {
		return { ok: true, value: "{}" };
	}
	if (!isPlainObject(input)) {
		return { ok: false, error: "metadata must be a plain object" };
	}
	let json: string;
	try {
		json = JSON.stringify(input);
	} catch {
		return { ok: false, error: "metadata contains unserializable values" };
	}
	const byteLength = new TextEncoder().encode(json).length;
	if (byteLength > ASSET_METADATA_MAX_BYTES) {
		return { ok: false, error: `metadata exceeds ${ASSET_METADATA_MAX_BYTES} bytes` };
	}
	return { ok: true, value: json };
}

/** Validate a non-empty trimmed string within max length */
export function validateString(
	field: string,
	input: unknown,
	maxLength: number,
): ValidationResult<string> {
	if (typeof input !== "string") {
		return { ok: false, error: `${field} must be a string` };
	}
	const trimmed = input.trim();
	if (trimmed.length === 0) {
		return { ok: false, error: `${field} must not be empty` };
	}
	if (trimmed.length > maxLength) {
		return { ok: false, error: `${field} must be at most ${maxLength} characters` };
	}
	return { ok: true, value: trimmed };
}

/** Validate an optional trimmed string (null/undefined → null, empty → null) */
export function validateOptionalString(
	field: string,
	input: unknown,
	maxLength: number,
): ValidationResult<string | null> {
	if (input === undefined || input === null) {
		return { ok: true, value: null };
	}
	if (typeof input !== "string") {
		return { ok: false, error: `${field} must be a string or null` };
	}
	const trimmed = input.trim();
	if (trimmed.length === 0) {
		return { ok: true, value: null };
	}
	if (trimmed.length > maxLength) {
		return { ok: false, error: `${field} must be at most ${maxLength} characters` };
	}
	return { ok: true, value: trimmed };
}

/** Validate a value is one of the allowed enum values */
export function validateEnum<T extends string>(
	field: string,
	input: unknown,
	allowed: readonly T[],
): ValidationResult<T> {
	if (typeof input !== "string") {
		return { ok: false, error: `${field} must be a string` };
	}
	if (!allowed.includes(input as T)) {
		return { ok: false, error: `${field} must be one of: ${allowed.join(", ")}` };
	}
	return { ok: true, value: input as T };
}

/** Validate an optional enum value (null/undefined → null) */
export function validateOptionalEnum<T extends string>(
	field: string,
	input: unknown,
	allowed: readonly T[],
): ValidationResult<T | null> {
	if (input === undefined || input === null) {
		return { ok: true, value: null };
	}
	return validateEnum(field, input, allowed);
}

// --- Row types (D1 table shapes) ---

export interface AgentRow {
	id: string;
	host_id: string | null;
	source_key: string;
	match_key: string;
	nickname: string | null;
	role: string | null;
	runtime_app: string | null;
	runtime_version: string | null;
	status: AgentStatus;
	metadata: string; // JSON string
	created_at: number; // unix seconds
	last_seen_at: number | null;
}

export interface AssetRow {
	id: string;
	host_id: string | null;
	type: AssetType;
	subtype: string | null;
	name: string;
	provider: string | null;
	status: AssetStatus;
	metadata: string; // JSON string
	created_at: number; // unix seconds
	updated_at: number | null;
}

export interface BindingRow {
	agent_id: string;
	asset_id: string;
	created_at: number; // unix seconds
}

export interface CliTokenRow {
	id: number;
	token_hash: string;
	label: string;
	scope: CliTokenScope;
	created_at: number; // unix seconds
	last_used_at: number | null;
}

// --- API DTO types ---

/** Lightweight tag reference embedded in agent/asset items */
export interface AssetTagRef {
	id: number;
	name: string;
	color: number;
}

/** GET /api/agents → AgentItem[] */
export interface AgentItem {
	id: string;
	host_id: string | null;
	hostname: string | null;
	source_key_short: string; // first 8 chars for display
	match_key: string;
	nickname: string | null;
	role: string | null;
	runtime_app: string | null;
	runtime_version: string | null;
	status: AgentStatus;
	metadata: Record<string, unknown>;
	tags: AssetTagRef[];
	created_at: number;
	last_seen_at: number | null;
}

/** GET /api/assets → AssetItem[] */
export interface AssetItem {
	id: string;
	host_id: string | null;
	hostname: string | null;
	type: AssetType;
	subtype: string | null;
	name: string;
	provider: string | null;
	status: AssetStatus;
	metadata: Record<string, unknown>;
	tags: AssetTagRef[];
	created_at: number;
	updated_at: number | null;
}

/** GET /api/bindings → BindingItem[] */
export interface BindingItem {
	agent_id: string;
	agent_nickname: string | null;
	asset_id: string;
	asset_name: string;
	asset_type: AssetType;
	created_at: number;
}

/** GET /api/cli-tokens → CliTokenItem[] (no secret) */
export interface CliTokenItem {
	id: number;
	label: string;
	scope: CliTokenScope;
	created_at: number;
	last_used_at: number | null;
}

// --- Request body types ---

export interface AgentCreateBody {
	source_key: string;
	match_key: string;
	host_id?: string | null;
	nickname?: string | null;
	role?: string | null;
	runtime_app?: string | null;
	runtime_version?: string | null;
	status?: AgentStatus;
	metadata?: Record<string, unknown>;
}

export interface AgentUpdateBody {
	host_id?: string | null;
	nickname?: string | null;
	role?: string | null;
	runtime_app?: string | null;
	runtime_version?: string | null;
	status?: AgentStatus;
	metadata?: Record<string, unknown>;
}

export interface AssetCreateBody {
	type: AssetType;
	name: string;
	host_id?: string | null;
	subtype?: string | null;
	provider?: string | null;
	status?: AssetStatus;
	metadata?: Record<string, unknown>;
}

export interface AssetUpdateBody {
	host_id?: string | null;
	name?: string;
	subtype?: string | null;
	provider?: string | null;
	status?: AssetStatus;
	metadata?: Record<string, unknown>;
}

export interface BindingCreateBody {
	agent_id: string;
	asset_id: string;
}

// --- Heartbeat types (CLI → Worker) ---

export interface AgentHeartbeatEntry {
	match_key: string;
	runtime_app?: string | null;
	runtime_version?: string | null;
	status: AgentStatus;
}

export interface AgentHeartbeatBody {
	source_key: string;
	agents: AgentHeartbeatEntry[];
}

export interface AgentHeartbeatResponse {
	updated: number;
	created: number;
	missing: number;
}

// --- Map read model ---

export interface AssetMapResponse {
	hosts: AssetMapHost[];
	agents: AssetMapAgent[];
	assets: AssetMapAsset[];
	bindings: AssetMapBinding[];
	tags: AssetMapTagEntry[];
}

export interface AssetMapHost {
	host_id: string;
	hid: string;
	hostname: string;
	status: string; // HostStatus
}

export interface AssetMapAgent {
	id: string;
	host_id: string | null;
	source_key_short: string;
	nickname: string | null;
	runtime_app: string | null;
	status: AgentStatus;
}

export interface AssetMapAsset {
	id: string;
	host_id: string | null;
	type: AssetType;
	subtype: string | null;
	name: string;
	provider: string | null;
	status: AssetStatus;
}

export interface AssetMapBinding {
	agent_id: string;
	asset_id: string;
}

export interface AssetMapTagEntry {
	entity_type: "agent" | "asset" | "host";
	entity_id: string;
	tag_id: number;
	tag_name: string;
	tag_color: number;
}

// --- Overview types ---

export interface AssetsOverview {
	agents: {
		total: number;
		by_status: Record<AgentStatus, number>;
	};
	assets: {
		total: number;
		by_type: Record<AssetType, number>;
		by_status: Record<AssetStatus, number>;
	};
	bindings: number;
}
