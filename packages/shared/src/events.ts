// @bat/shared — Host event and webhook types
// Source of truth: docs/13-host-events.md

// --- Webhook config ---

export interface WebhookConfig {
	id: number;
	host_id: string;
	token: string;
	rate_limit: number;
	is_active: boolean;
	created_at: number;
	updated_at: number;
}

/** Row shape from D1 (is_active stored as 0/1 INTEGER) */
export interface WebhookConfigRow {
	id: number;
	host_id: string;
	token: string;
	rate_limit: number;
	is_active: number;
	window_start: number;
	window_count: number;
	created_at: number;
	updated_at: number;
}

// --- Event ---

export interface EventItem {
	id: number;
	host_id: string;
	hostname: string;
	title: string;
	body: string; // JSON string
	tags: string[]; // parsed from JSON
	source_ip: string;
	created_at: number;
}

/** D1 row shape before parsing */
export interface EventRow {
	id: number;
	host_id: string;
	hostname: string;
	title: string;
	body: string;
	tags: string; // JSON array string
	source_ip: string;
	created_at: number;
}

// --- Ingest payload ---

export interface EventIngestPayload {
	title: string;
	body: Record<string, unknown>;
	tags?: string[];
}

// --- Constraints ---

export const EVENT_TITLE_MAX_LENGTH = 200;
export const EVENT_BODY_MAX_BYTES = 16_384; // 16 KB
export const EVENT_TAGS_MAX_COUNT = 10;
export const EVENT_TAG_MAX_LENGTH = 50;
export const EVENT_RETENTION_DAYS = 30;
