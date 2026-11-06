// @bat/shared — Workstation DTOs, strict validation and status helpers
// Source of truth: docs/24-workstations.md

import type { ValidationResult } from "./assets.js";

// --- Protocol constants ---

export const WORKSTATION_INTERVAL_SECONDS = 600;
export const WORKSTATION_PING_COUNT = 3;
export const WORKSTATION_MAX_TARGETS = 100;
export const WORKSTATION_BODY_MAX_BYTES = 65_536;
export const WORKSTATION_REPORT_SKEW_SECONDS = 300;
export const WORKSTATION_MAX_RUN_MS = 120_000;

/** Stale after three missed collection intervals; staleness is never critical. */
export const WORKSTATION_STALE_AFTER_SECONDS = WORKSTATION_INTERVAL_SECONDS * 3;

export const WORKSTATION_TOKEN_PREFIX = "batw_";
/** 256-bit random token; only its SHA-256 hash is ever stored. */
export const WORKSTATION_TOKEN_BYTES = 32;
export const WORKSTATION_NAME_MAX_LENGTH = 64;

/** Per-key limits. Reports run every ten minutes, so two per minute leaves room for retries. */
export const WORKSTATION_RATE_LIMITS = {
	reportsPerMinute: 2,
	targetsPerMinute: 6,
	exchangePerTenMinutes: 5,
} as const;

export const WORKSTATION_HISTORY_MAX_LIMIT = 100;
export const WORKSTATION_HISTORY_MAX_WINDOW_SECONDS = 2_592_000;
export const WORKSTATION_HISTORY_DEFAULT_WINDOW_SECONDS = 86_400;
export const WORKSTATION_AUTH_CODE_TTL_SECONDS = 300;

/** Field-level bounds. Arrays and strings are bounded before any nested work. */
export const WORKSTATION_LIMITS = {
	hostname: 253,
	os: 128,
	arch: 32,
	cliVersion: 32,
	cpuModel: 128,
	mount: 512,
	interfaceName: 64,
	serverId: 128,
	serverName: 128,
	errorText: 512,
	authCode: 512,
	callbackUrl: 512,
	state: 128,
	diskMounts: 64,
	interfaces: 32,
	addressesPerInterface: 16,
	collectionErrors: 32,
	cpuCount: 1024,
	uptimeSeconds: 3_155_760_000,
	bytes: 1_125_899_906_842_624,
	rttMs: 60_000,
} as const;

// --- Enums ---

export type WorkstationIpFamily = 4 | 6;
export type WorkstationStatus = "recent" | "stale" | "disabled";
export type WorkstationConnectivityStatus =
	| "reachable"
	| "partial"
	| "timeout"
	| "unreachable"
	| "error"
	| "unsupported";

export const WORKSTATION_STATUSES: readonly WorkstationStatus[] = [
	"recent",
	"stale",
	"disabled",
] as const;

export const WORKSTATION_CONNECTIVITY_STATUSES: readonly WorkstationConnectivityStatus[] = [
	"reachable",
	"partial",
	"timeout",
	"unreachable",
	"error",
	"unsupported",
] as const;

// --- DTOs ---

export interface WorkstationCpu {
	model: string;
	count: number;
	usage_pct: number | null;
}

export interface WorkstationMemory {
	total_bytes: number;
	available_bytes: number;
	used_pct: number;
}

export interface WorkstationDisk {
	mount: string;
	total_bytes: number;
	available_bytes: number;
	used_pct: number;
}

export interface WorkstationAddress {
	address: string;
	family: WorkstationIpFamily;
	internal: boolean;
}

export interface WorkstationInterface {
	name: string;
	addresses: WorkstationAddress[];
}

export interface WorkstationNetwork {
	interfaces: WorkstationInterface[];
}

export interface WorkstationConnectivity {
	server_id: string;
	address: string;
	family: WorkstationIpFamily;
	sent: number;
	received: number;
	rtts_ms: [number | null, number | null, number | null];
	status: WorkstationConnectivityStatus;
}

/** POST report body. Strict: unknown keys are rejected, never coerced. */
export interface WorkstationReportInput {
	report_id: string;
	started_at: number;
	finished_at: number;
	sample_window_ms: number;
	cli_version: string;
	hostname: string;
	os: string;
	arch: string;
	uptime_seconds: number;
	cpu: WorkstationCpu;
	mem: WorkstationMemory;
	disk: WorkstationDisk[];
	network: WorkstationNetwork;
	connectivity: WorkstationConnectivity[];
	collection_errors: string[];
	targets_error: string | null;
}

/** Stored report as returned by reads; server receipt time added. */
export interface WorkstationReportRecord extends WorkstationReportInput {
	received_at: number;
}

export interface WorkstationRecord {
	id: string;
	owner: string;
	name: string;
	created_at: number;
	last_seen_at: number | null;
	public_ip: string | null;
	disabled: boolean;
	latest_report: WorkstationReportRecord | null;
}

export interface WorkstationTarget {
	server_id: string;
	name: string;
	address: string;
	family: WorkstationIpFamily;
}

/** GET targets response consumed by the CLI before probing. */
export interface WorkstationTargetsResponse {
	data: WorkstationTarget[];
	interval_seconds: number;
	ping_count: number;
}

/** POST login exchange body from the CLI. */
export interface WorkstationLoginExchangeInput {
	code: string;
	code_verifier: string;
	installation_id: string;
}

/** Login exchange result. `workstation_id` is the server-side UUID. */
export interface WorkstationLoginExchangeOutput {
	workstation_id: string;
	token: string;
	worker_url: string;
}

/** Browser authorize request: PKCE S256, installation UUID, state and callback. */
export interface WorkstationAuthorizeInput {
	installation_id: string;
	code_challenge: string;
	code_challenge_method: "S256";
	state: string;
	callback: string;
	/** Display name chosen on the consent page; defaults to `Workstation`. */
	name?: string;
}

/** Authorize response: the CLI callback with the one-time code attached. */
export interface WorkstationAuthorizeResult {
	redirect_url: string;
}

/** Report acceptance. Duplicate retries return the original success result. */
export interface WorkstationReportAccepted {
	status: "accepted";
	received_at: number;
	duplicate: boolean;
}

/** One point of the workstation metrics history. */
export interface WorkstationMetricPoint {
	received_at: number;
	started_at: number;
	finished_at: number;
	cpu_usage_pct: number | null;
	mem_used_pct: number;
	mem_total_bytes: number;
	mem_available_bytes: number;
	uptime_seconds: number;
}

export interface WorkstationMetricsResponse {
	data: WorkstationMetricPoint[];
	page: { limit: number; offset: number; next_offset: number | null };
}

/** One point of a per-target connectivity history. */
export interface WorkstationConnectivityPoint {
	received_at: number;
	received: number;
	rtt_avg_ms: number | null;
	rtt_min_ms: number | null;
	rtt_max_ms: number | null;
	status: WorkstationConnectivityStatus;
}

export interface WorkstationConnectivityHistory {
	server_id: string;
	address: string;
	family: WorkstationIpFamily;
	data: WorkstationConnectivityPoint[];
}

export interface WorkstationConnectivityResponse {
	targets: WorkstationConnectivityHistory[];
	limit: number;
}

// --- Result helpers ---

function fail<T>(error: string): ValidationResult<T> {
	return { ok: false, error };
}

function readObject(
	field: string,
	input: unknown,
	keys: readonly string[],
): ValidationResult<Record<string, unknown>> {
	if (typeof input !== "object" || input === null || Array.isArray(input)) {
		return fail(`${field} must be an object`);
	}
	const record = input as Record<string, unknown>;
	for (const key of Object.keys(record)) {
		if (!keys.includes(key)) {
			return fail(`${field}.${key} is not supported`);
		}
	}
	return { ok: true, value: record };
}

function readArray(field: string, input: unknown, maxLength: number): ValidationResult<unknown[]> {
	if (!Array.isArray(input)) {
		return fail(`${field} must be an array`);
	}
	if (input.length > maxLength) {
		return fail(`${field} must have at most ${maxLength} items`);
	}
	return { ok: true, value: input };
}

function readString(field: string, input: unknown, maxLength: number): ValidationResult<string> {
	if (typeof input !== "string") {
		return fail(`${field} must be a string`);
	}
	if (input.length === 0) {
		return fail(`${field} must not be empty`);
	}
	if (input.length > maxLength) {
		return fail(`${field} must be at most ${maxLength} characters`);
	}
	if (input.trim().length === 0) {
		return fail(`${field} must not be blank`);
	}
	return { ok: true, value: input };
}

function readNumber(
	field: string,
	input: unknown,
	min: number,
	max: number,
): ValidationResult<number> {
	if (typeof input !== "number" || !Number.isFinite(input)) {
		return fail(`${field} must be a finite number`);
	}
	if (input < min || input > max) {
		return fail(`${field} must be between ${min} and ${max}`);
	}
	return { ok: true, value: input };
}

function readInteger(
	field: string,
	input: unknown,
	min: number,
	max: number,
): ValidationResult<number> {
	if (typeof input !== "number" || !Number.isInteger(input)) {
		return fail(`${field} must be an integer`);
	}
	if (input < min || input > max) {
		return fail(`${field} must be between ${min} and ${max}`);
	}
	return { ok: true, value: input };
}

function readNullableNumber(
	field: string,
	input: unknown,
	min: number,
	max: number,
): ValidationResult<number | null> {
	if (input === null) {
		return { ok: true, value: null };
	}
	return readNumber(field, input, min, max);
}

/** RTTs may be a genuine zero (coarse platform clock); only a missing probe is null. */
function readNullableRtt(
	field: string,
	input: unknown,
	max: number,
): ValidationResult<number | null> {
	if (input === null) {
		return { ok: true, value: null };
	}
	return readNumber(field, input, 0, max);
}

function readFamily(field: string, input: unknown): ValidationResult<WorkstationIpFamily> {
	if (input !== 4 && input !== 6) {
		return fail(`${field} must be 4 or 6`);
	}
	return { ok: true, value: input };
}

function readEnum<T extends string>(
	field: string,
	input: unknown,
	allowed: readonly T[],
): ValidationResult<T> {
	if (typeof input !== "string" || !allowed.includes(input as T)) {
		return fail(`${field} must be one of: ${allowed.join(", ")}`);
	}
	return { ok: true, value: input as T };
}

// --- Literal helpers (no Node imports: Worker and CLI compatible) ---

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IPV4_PATTERN =
	/^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const PKCE_STATE_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const WORKSTATION_TOKEN_PATTERN = /^batw_[A-Za-z0-9_-]{43}$/;

export function isUuid(input: string): boolean {
	return UUID_PATTERN.test(input);
}

export function isIpv4(input: string): boolean {
	return IPV4_PATTERN.test(input);
}

const IPV6_CHARS = /^[0-9a-f:.]+$/i;

/**
 * Validate with the WHATWG URL IPv6 parser and return the normalized host.
 * The character pre-check keeps brackets, ports, userinfo and paths out of the
 * bracketed host, so `::1]:80` or `2001:4860:4860::8888]/foo` can never be
 * accepted. Every public-range decision must use this parsed form.
 */
function parseIpv6(input: string): string | null {
	if (input.length < 2 || input.length > 45 || !IPV6_CHARS.test(input) || !input.includes(":")) {
		return null;
	}
	try {
		return new URL(`http://[${input}]/`).hostname.slice(1, -1);
	} catch {
		return null;
	}
}

export function isIpv6(input: string): boolean {
	return parseIpv6(input) !== null;
}

function ipv4Octets(input: string): number[] | null {
	if (!IPV4_PATTERN.test(input)) {
		return null;
	}
	return input.split(".").map((part) => Number.parseInt(part, 10));
}

/**
 * Everything that is not globally routable unicast: private, loopback,
 * link-local, CGNAT, multicast, reserved, IETF protocol assignments and the
 * documentation/benchmark ranges. Values are the prefix's leading bits.
 */
const IPV4_BLOCKED: ReadonlyArray<{ shifted: number; bits: number }> = [
	{ shifted: 0, bits: 8 },
	{ shifted: 10, bits: 8 },
	{ shifted: 401, bits: 10 },
	{ shifted: 127, bits: 8 },
	{ shifted: 43_518, bits: 16 },
	{ shifted: 2_753, bits: 12 },
	{ shifted: 12_582_912, bits: 24 },
	{ shifted: 12_582_914, bits: 24 },
	{ shifted: 12_605_539, bits: 24 },
	{ shifted: 49_320, bits: 16 },
	{ shifted: 25_353, bits: 15 },
	{ shifted: 12_989_284, bits: 24 },
	{ shifted: 13_303_921, bits: 24 },
	{ shifted: 14, bits: 4 },
	{ shifted: 15, bits: 4 },
	{ shifted: 255, bits: 8 },
];

function isPublicIpv4(octets: number[]): boolean {
	const value = octets.reduce((acc, octet) => acc * 256 + octet, 0);
	return IPV4_BLOCKED.every(
		(block) => Math.floor(value / 2 ** (32 - block.bits)) !== block.shifted,
	);
}

function isPublicIpv6(input: string): boolean {
	const host = parseIpv6(input);
	if (host === null) {
		return false;
	}
	// The host is already canonical, so range decisions only split validated
	// text; the grammar itself is never re-implemented here.
	const groups = host.split(":");
	const first = Number.parseInt((groups[0] as string) || "0", 16);
	const second = Number.parseInt((groups[1] as string) || "0", 16);
	// Global unicast is 2000::/3 only.
	if (first < 0x2000 || first > 0x3fff) return false;
	// 2001::/23 holds the IANA special-purpose blocks: Teredo, benchmark
	// (2001:2::/48), ORCHID, AMPR and similar, all non-public.
	if (first === 0x2001 && second <= 0x01ff) return false;
	// 2001:db8::/32 documentation.
	if (first === 0x2001 && second === 0x0db8) return false;
	// 2002::/16 6to4 embeds IPv4; translation forms are never probe targets.
	if (first === 0x2002) return false;
	// 3fff::/20 documentation.
	if (first >= 0x3ff0) return false;
	return true;
}

/**
 * A target or observed address must be a globally routable unicast literal.
 * Documentation, benchmark and other reserved ranges are excluded, so fixtures
 * use real public literals (for example `8.8.8.8`) without any network access.
 */
export function isPublicIp(input: string): boolean {
	const octets = ipv4Octets(input);
	if (octets !== null) {
		return isPublicIpv4(octets);
	}
	return isPublicIpv6(input);
}

export function ipFamily(input: string): WorkstationIpFamily | null {
	if (isIpv4(input)) {
		return 4;
	}
	if (isIpv6(input)) {
		return 6;
	}
	return null;
}

export function isPkceS256Challenge(input: string): boolean {
	return PKCE_CHALLENGE_PATTERN.test(input);
}

export function isPkceCodeVerifier(input: string): boolean {
	return PKCE_VERIFIER_PATTERN.test(input);
}

/** Format check only: the plaintext token is never stored, only its SHA-256 hash. */
export function isWorkstationToken(input: string): boolean {
	return WORKSTATION_TOKEN_PATTERN.test(input);
}

const LOOPBACK_HOSTS: readonly string[] = ["127.0.0.1", "localhost", "[::1]", "::1"];

/**
 * The CLI callback is a loopback listener over http or https, exactly `/callback`,
 * with no credentials, fragment or pre-existing query. Anything else could leak
 * the authorization code off the machine.
 */
export function isWorkstationCallbackUrl(input: string): boolean {
	if (input.length === 0 || input.length > WORKSTATION_LIMITS.callbackUrl) {
		return false;
	}
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return false;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		return false;
	}
	if (!LOOPBACK_HOSTS.includes(url.hostname)) {
		return false;
	}
	if (url.pathname !== "/callback" || url.search !== "" || url.hash !== "") {
		return false;
	}
	return url.username === "" && url.password === "";
}

// --- Status (pure) ---

/**
 * Derive the read status of a workstation. Staleness is derived, never stored,
 * and never escalates to an alert: three intervals without a report is stale.
 * A null `last_seen_at` is stale; future timestamps caused by clock skew are recent.
 */
export function computeWorkstationStatus(
	workstation: { disabled: boolean; last_seen_at: number | null },
	now: number,
): WorkstationStatus {
	if (workstation.disabled) {
		return "disabled";
	}
	if (workstation.last_seen_at === null) {
		return "stale";
	}
	return now - workstation.last_seen_at > WORKSTATION_STALE_AFTER_SECONDS ? "stale" : "recent";
}

// --- Report validation ---

const REPORT_KEYS = [
	"report_id",
	"started_at",
	"finished_at",
	"sample_window_ms",
	"cli_version",
	"hostname",
	"os",
	"arch",
	"uptime_seconds",
	"cpu",
	"mem",
	"disk",
	"network",
	"connectivity",
	"collection_errors",
	"targets_error",
] as const;

const CPU_KEYS = ["model", "count", "usage_pct"] as const;
const MEM_KEYS = ["total_bytes", "available_bytes", "used_pct"] as const;
const DISK_KEYS = ["mount", "total_bytes", "available_bytes", "used_pct"] as const;
const NETWORK_KEYS = ["interfaces"] as const;
const INTERFACE_KEYS = ["name", "addresses"] as const;
const ADDRESS_KEYS = ["address", "family", "internal"] as const;
const CONNECTIVITY_KEYS = [
	"server_id",
	"address",
	"family",
	"sent",
	"received",
	"rtts_ms",
	"status",
] as const;
const TARGET_KEYS = ["server_id", "name", "address", "family"] as const;
const TARGETS_RESPONSE_KEYS = ["data", "interval_seconds", "ping_count"] as const;
const LOGIN_EXCHANGE_KEYS = ["code", "code_verifier", "installation_id"] as const;
const AUTHORIZE_KEYS = [
	"installation_id",
	"code_challenge",
	"code_challenge_method",
	"state",
	"callback",
	"name",
] as const;

function readUuid(field: string, input: unknown): ValidationResult<string> {
	if (typeof input !== "string" || !isUuid(input)) {
		return fail(`${field} must be a UUID`);
	}
	return { ok: true, value: input };
}

function readIpLiteral(field: string, input: unknown): ValidationResult<string> {
	if (typeof input !== "string" || ipFamily(input) === null) {
		return fail(`${field} must be an IPv4 or IPv6 literal`);
	}
	return { ok: true, value: input };
}

function readDisk(input: unknown): ValidationResult<WorkstationDisk> {
	const entry = readObject("disk entry", input, DISK_KEYS);
	if (!entry.ok) {
		return entry;
	}
	const mount = readString("disk.mount", entry.value.mount, WORKSTATION_LIMITS.mount);
	if (!mount.ok) {
		return mount;
	}
	const total = readInteger(
		"disk.total_bytes",
		entry.value.total_bytes,
		1,
		WORKSTATION_LIMITS.bytes,
	);
	if (!total.ok) {
		return total;
	}
	const available = readInteger(
		"disk.available_bytes",
		entry.value.available_bytes,
		0,
		WORKSTATION_LIMITS.bytes,
	);
	if (!available.ok) {
		return available;
	}
	if (available.value > total.value) {
		return fail("disk.available_bytes must not exceed disk.total_bytes");
	}
	const usedPct = readNumber("disk.used_pct", entry.value.used_pct, 0, 100);
	if (!usedPct.ok) {
		return usedPct;
	}
	return {
		ok: true,
		value: {
			mount: mount.value,
			total_bytes: total.value,
			available_bytes: available.value,
			used_pct: usedPct.value,
		},
	};
}

function readAddress(input: unknown): ValidationResult<WorkstationAddress> {
	const entry = readObject("network address", input, ADDRESS_KEYS);
	if (!entry.ok) {
		return entry;
	}
	const address = readIpLiteral("network.address", entry.value.address);
	if (!address.ok) {
		return address;
	}
	const family = readFamily("network.family", entry.value.family);
	if (!family.ok) {
		return family;
	}
	if (ipFamily(address.value) !== family.value) {
		return fail("network.address must match network.family");
	}
	if (typeof entry.value.internal !== "boolean") {
		return fail("network.internal must be a boolean");
	}
	return {
		ok: true,
		value: { address: address.value, family: family.value, internal: entry.value.internal },
	};
}

function readInterface(input: unknown): ValidationResult<WorkstationInterface> {
	const entry = readObject("network interface", input, INTERFACE_KEYS);
	if (!entry.ok) {
		return entry;
	}
	const name = readString(
		"network.interface.name",
		entry.value.name,
		WORKSTATION_LIMITS.interfaceName,
	);
	if (!name.ok) {
		return name;
	}
	const addresses = readArray(
		`network.interface(${name.value}).addresses`,
		entry.value.addresses,
		WORKSTATION_LIMITS.addressesPerInterface,
	);
	if (!addresses.ok) {
		return addresses;
	}
	const parsed: WorkstationAddress[] = [];
	for (const address of addresses.value) {
		const result = readAddress(address);
		if (!result.ok) {
			return result;
		}
		parsed.push(result.value);
	}
	return { ok: true, value: { name: name.value, addresses: parsed } };
}

function readRtts(
	field: string,
	input: unknown,
): ValidationResult<[number | null, number | null, number | null]> {
	const entries = readArray(field, input, WORKSTATION_PING_COUNT);
	if (!entries.ok) {
		return entries;
	}
	if (entries.value.length !== WORKSTATION_PING_COUNT) {
		return fail(`${field} must contain exactly ${WORKSTATION_PING_COUNT} entries`);
	}
	const first = readNullableRtt(`${field}[0]`, entries.value[0], WORKSTATION_LIMITS.rttMs);
	if (!first.ok) {
		return first;
	}
	const second = readNullableRtt(`${field}[1]`, entries.value[1], WORKSTATION_LIMITS.rttMs);
	if (!second.ok) {
		return second;
	}
	const third = readNullableRtt(`${field}[2]`, entries.value[2], WORKSTATION_LIMITS.rttMs);
	if (!third.ok) {
		return third;
	}
	return { ok: true, value: [first.value, second.value, third.value] };
}

function readConnectivity(input: unknown): ValidationResult<WorkstationConnectivity> {
	const entry = readObject("connectivity entry", input, CONNECTIVITY_KEYS);
	if (!entry.ok) {
		return entry;
	}
	const serverId = readString(
		"connectivity.server_id",
		entry.value.server_id,
		WORKSTATION_LIMITS.serverId,
	);
	if (!serverId.ok) {
		return serverId;
	}
	const address = readIpLiteral("connectivity.address", entry.value.address);
	if (!address.ok) {
		return address;
	}
	const family = readFamily("connectivity.family", entry.value.family);
	if (!family.ok) {
		return family;
	}
	if (ipFamily(address.value) !== family.value) {
		return fail("connectivity.address must match connectivity.family");
	}
	const sent = readInteger("connectivity.sent", entry.value.sent, 1, WORKSTATION_PING_COUNT);
	if (!sent.ok) {
		return sent;
	}
	if (sent.value !== WORKSTATION_PING_COUNT) {
		return fail(`connectivity.sent must be ${WORKSTATION_PING_COUNT}`);
	}
	const rtts = readRtts("connectivity.rtts_ms", entry.value.rtts_ms);
	if (!rtts.ok) {
		return rtts;
	}
	const received = readInteger(
		"connectivity.received",
		entry.value.received,
		0,
		WORKSTATION_PING_COUNT,
	);
	if (!received.ok) {
		return received;
	}
	const answered = rtts.value.filter((rtt) => rtt !== null).length;
	if (answered !== received.value) {
		return fail("connectivity.received must equal the number of recorded rtts_ms entries");
	}
	const status = readEnum(
		"connectivity.status",
		entry.value.status,
		WORKSTATION_CONNECTIVITY_STATUSES,
	);
	if (!status.ok) {
		return status;
	}
	if (status.value === "reachable" && received.value !== WORKSTATION_PING_COUNT) {
		return fail("connectivity.status reachable requires every ping to be answered");
	}
	if (
		status.value === "partial" &&
		(received.value === 0 || received.value === WORKSTATION_PING_COUNT)
	) {
		return fail("connectivity.status partial requires between 1 and 2 answered pings");
	}
	if (
		(status.value === "timeout" ||
			status.value === "unreachable" ||
			status.value === "unsupported") &&
		received.value !== 0
	) {
		return fail(`connectivity.status ${status.value} requires received to be 0`);
	}
	return {
		ok: true,
		value: {
			server_id: serverId.value,
			address: address.value,
			family: family.value,
			sent: sent.value,
			received: received.value,
			rtts_ms: rtts.value,
			status: status.value,
		},
	};
}

function readWorkstationReport(
	input: Record<string, unknown>,
	now: number,
): ValidationResult<WorkstationReportInput> {
	const reportId = readUuid("report_id", input.report_id);
	if (!reportId.ok) {
		return reportId;
	}
	const startedAt = readInteger("started_at", input.started_at, 0, Number.MAX_SAFE_INTEGER);
	if (!startedAt.ok) {
		return startedAt;
	}
	const finishedAt = readInteger("finished_at", input.finished_at, 0, Number.MAX_SAFE_INTEGER);
	if (!finishedAt.ok) {
		return finishedAt;
	}
	if (finishedAt.value < startedAt.value) {
		return fail("finished_at must not be before started_at");
	}
	if (finishedAt.value - startedAt.value > WORKSTATION_MAX_RUN_MS / 1000) {
		return fail(
			`started_at must be at most ${WORKSTATION_MAX_RUN_MS / 1000} seconds before finished_at`,
		);
	}
	if (Math.abs(now - finishedAt.value) > WORKSTATION_REPORT_SKEW_SECONDS) {
		return fail(`finished_at must be within ${WORKSTATION_REPORT_SKEW_SECONDS} seconds of receipt`);
	}
	const sampleWindow = readInteger(
		"sample_window_ms",
		input.sample_window_ms,
		1,
		WORKSTATION_MAX_RUN_MS,
	);
	if (!sampleWindow.ok) {
		return sampleWindow;
	}
	const cliVersion = readString("cli_version", input.cli_version, WORKSTATION_LIMITS.cliVersion);
	if (!cliVersion.ok) {
		return cliVersion;
	}
	const hostname = readString("hostname", input.hostname, WORKSTATION_LIMITS.hostname);
	if (!hostname.ok) {
		return hostname;
	}
	const os = readString("os", input.os, WORKSTATION_LIMITS.os);
	if (!os.ok) {
		return os;
	}
	const arch = readString("arch", input.arch, WORKSTATION_LIMITS.arch);
	if (!arch.ok) {
		return arch;
	}
	const uptime = readInteger(
		"uptime_seconds",
		input.uptime_seconds,
		0,
		WORKSTATION_LIMITS.uptimeSeconds,
	);
	if (!uptime.ok) {
		return uptime;
	}

	const cpuEntry = readObject("cpu", input.cpu, CPU_KEYS);
	if (!cpuEntry.ok) {
		return cpuEntry;
	}
	const cpuModel = readString("cpu.model", cpuEntry.value.model, WORKSTATION_LIMITS.cpuModel);
	if (!cpuModel.ok) {
		return cpuModel;
	}
	const cpuCount = readInteger("cpu.count", cpuEntry.value.count, 1, WORKSTATION_LIMITS.cpuCount);
	if (!cpuCount.ok) {
		return cpuCount;
	}
	const cpuUsage = readNullableNumber("cpu.usage_pct", cpuEntry.value.usage_pct, 0, 100);
	if (!cpuUsage.ok) {
		return cpuUsage;
	}

	const memEntry = readObject("mem", input.mem, MEM_KEYS);
	if (!memEntry.ok) {
		return memEntry;
	}
	const memTotal = readInteger(
		"mem.total_bytes",
		memEntry.value.total_bytes,
		1,
		WORKSTATION_LIMITS.bytes,
	);
	if (!memTotal.ok) {
		return memTotal;
	}
	const memAvailable = readInteger(
		"mem.available_bytes",
		memEntry.value.available_bytes,
		0,
		WORKSTATION_LIMITS.bytes,
	);
	if (!memAvailable.ok) {
		return memAvailable;
	}
	if (memAvailable.value > memTotal.value) {
		return fail("mem.available_bytes must not exceed mem.total_bytes");
	}
	const memUsedPct = readNumber("mem.used_pct", memEntry.value.used_pct, 0, 100);
	if (!memUsedPct.ok) {
		return memUsedPct;
	}

	const diskEntries = readArray("disk", input.disk, WORKSTATION_LIMITS.diskMounts);
	if (!diskEntries.ok) {
		return diskEntries;
	}
	const disk: WorkstationDisk[] = [];
	for (const entry of diskEntries.value) {
		const parsed = readDisk(entry);
		if (!parsed.ok) {
			return parsed;
		}
		disk.push(parsed.value);
	}

	const networkEntry = readObject("network", input.network, NETWORK_KEYS);
	if (!networkEntry.ok) {
		return networkEntry;
	}
	const interfaceEntries = readArray(
		"network.interfaces",
		networkEntry.value.interfaces,
		WORKSTATION_LIMITS.interfaces,
	);
	if (!interfaceEntries.ok) {
		return interfaceEntries;
	}
	const interfaces: WorkstationInterface[] = [];
	for (const entry of interfaceEntries.value) {
		const parsed = readInterface(entry);
		if (!parsed.ok) {
			return parsed;
		}
		interfaces.push(parsed.value);
	}

	const connectivityEntries = readArray(
		"connectivity",
		input.connectivity,
		WORKSTATION_MAX_TARGETS,
	);
	if (!connectivityEntries.ok) {
		return connectivityEntries;
	}
	const connectivity: WorkstationConnectivity[] = [];
	const seenServers = new Set<string>();
	for (const entry of connectivityEntries.value) {
		const parsed = readConnectivity(entry);
		if (!parsed.ok) {
			return parsed;
		}
		// Only the server is a key: one public address (NAT, shared egress) may
		// legitimately serve several distinct servers.
		if (seenServers.has(parsed.value.server_id)) {
			return fail(`connectivity.server_id ${parsed.value.server_id} must be unique`);
		}
		seenServers.add(parsed.value.server_id);
		connectivity.push(parsed.value);
	}

	const collectionErrors = readArray(
		"collection_errors",
		input.collection_errors,
		WORKSTATION_LIMITS.collectionErrors,
	);
	if (!collectionErrors.ok) {
		return collectionErrors;
	}
	const errors: string[] = [];
	for (const entry of collectionErrors.value) {
		const parsed = readString("collection_errors entry", entry, WORKSTATION_LIMITS.errorText);
		if (!parsed.ok) {
			return parsed;
		}
		errors.push(parsed.value);
	}

	let targetsError: string | null = null;
	if (input.targets_error !== null) {
		const parsed = readString("targets_error", input.targets_error, WORKSTATION_LIMITS.errorText);
		if (!parsed.ok) {
			return parsed;
		}
		targetsError = parsed.value;
	}

	return {
		ok: true,
		value: {
			report_id: reportId.value,
			started_at: startedAt.value,
			finished_at: finishedAt.value,
			sample_window_ms: sampleWindow.value,
			cli_version: cliVersion.value,
			hostname: hostname.value,
			os: os.value,
			arch: arch.value,
			uptime_seconds: uptime.value,
			cpu: { model: cpuModel.value, count: cpuCount.value, usage_pct: cpuUsage.value },
			mem: {
				total_bytes: memTotal.value,
				available_bytes: memAvailable.value,
				used_pct: memUsedPct.value,
			},
			disk,
			network: { interfaces },
			connectivity,
			collection_errors: errors,
			targets_error: targetsError,
		},
	};
}

/**
 * Validate one workstation report against the strict wire contract.
 * `now` is the trusted server receipt time in epoch seconds.
 */
export function validateWorkstationReport(
	input: unknown,
	now: number,
): ValidationResult<WorkstationReportInput> {
	const root = readObject("report", input, REPORT_KEYS);
	if (!root.ok) {
		return root;
	}
	return readWorkstationReport(root.value, now);
}

// --- Targets response validation (CLI side) ---

export function validateWorkstationTargetsResponse(
	input: unknown,
): ValidationResult<WorkstationTargetsResponse> {
	const root = readObject("targets response", input, TARGETS_RESPONSE_KEYS);
	if (!root.ok) {
		return root;
	}
	const interval = readInteger(
		"interval_seconds",
		root.value.interval_seconds,
		1,
		Number.MAX_SAFE_INTEGER,
	);
	if (!interval.ok) {
		return interval;
	}
	if (interval.value !== WORKSTATION_INTERVAL_SECONDS) {
		return fail(`interval_seconds must be ${WORKSTATION_INTERVAL_SECONDS}`);
	}
	const pingCount = readInteger("ping_count", root.value.ping_count, 1, WORKSTATION_PING_COUNT);
	if (!pingCount.ok) {
		return pingCount;
	}
	if (pingCount.value !== WORKSTATION_PING_COUNT) {
		return fail(`ping_count must be ${WORKSTATION_PING_COUNT}`);
	}
	const entries = readArray("data", root.value.data, WORKSTATION_MAX_TARGETS);
	if (!entries.ok) {
		return entries;
	}
	const targets: WorkstationTarget[] = [];
	const seenTargets = new Set<string>();
	for (const entry of entries.value) {
		const target = readObject("target", entry, TARGET_KEYS);
		if (!target.ok) {
			return target;
		}
		const serverId = readString(
			"target.server_id",
			target.value.server_id,
			WORKSTATION_LIMITS.serverId,
		);
		if (!serverId.ok) {
			return serverId;
		}
		const name = readString("target.name", target.value.name, WORKSTATION_LIMITS.serverName);
		if (!name.ok) {
			return name;
		}
		const address = readIpLiteral("target.address", target.value.address);
		if (!address.ok) {
			return address;
		}
		const family = readFamily("target.family", target.value.family);
		if (!family.ok) {
			return family;
		}
		if (ipFamily(address.value) !== family.value) {
			return fail("target.address must match target.family");
		}
		if (seenTargets.has(serverId.value)) {
			return fail(`target.server_id ${serverId.value} must be unique`);
		}
		seenTargets.add(serverId.value);
		targets.push({
			server_id: serverId.value,
			name: name.value,
			address: address.value,
			family: family.value,
		});
	}
	return {
		ok: true,
		value: {
			data: targets,
			interval_seconds: interval.value,
			ping_count: pingCount.value,
		},
	};
}

// --- Login exchange and authorize validation ---

export function validateWorkstationLoginExchange(
	input: unknown,
): ValidationResult<WorkstationLoginExchangeInput> {
	const root = readObject("login exchange", input, LOGIN_EXCHANGE_KEYS);
	if (!root.ok) {
		return root;
	}
	const code = readString("code", root.value.code, WORKSTATION_LIMITS.authCode);
	if (!code.ok) {
		return code;
	}
	const verifier = root.value.code_verifier;
	if (typeof verifier !== "string" || !isPkceCodeVerifier(verifier)) {
		return fail(`code_verifier must be 43 to 128 characters of A-Z a-z 0-9 . _ ~ -`);
	}
	const installationId = readUuid("installation_id", root.value.installation_id);
	if (!installationId.ok) {
		return installationId;
	}
	return {
		ok: true,
		value: {
			code: code.value,
			code_verifier: verifier,
			installation_id: installationId.value,
		},
	};
}

export function validateWorkstationAuthorize(
	input: unknown,
): ValidationResult<WorkstationAuthorizeInput> {
	const root = readObject("authorize", input, AUTHORIZE_KEYS);
	if (!root.ok) {
		return root;
	}
	const installationId = readUuid("installation_id", root.value.installation_id);
	if (!installationId.ok) {
		return installationId;
	}
	const challenge = root.value.code_challenge;
	if (typeof challenge !== "string" || !isPkceS256Challenge(challenge)) {
		return fail("code_challenge must be a 43 character base64url S256 digest");
	}
	if (root.value.code_challenge_method !== "S256") {
		return fail("code_challenge_method must be S256");
	}
	const state = root.value.state;
	if (typeof state !== "string" || !PKCE_STATE_PATTERN.test(state)) {
		return fail("state must be 16 to 128 characters of A-Z a-z 0-9 . _ ~ -");
	}
	const callback = root.value.callback;
	if (typeof callback !== "string" || !isWorkstationCallbackUrl(callback)) {
		return fail("callback must be a loopback http or https URL at /callback");
	}
	let name = "Workstation";
	if (root.value.name !== undefined) {
		const parsed = readString("name", root.value.name, WORKSTATION_NAME_MAX_LENGTH);
		if (!parsed.ok) {
			return parsed;
		}
		name = parsed.value;
	}
	return {
		ok: true,
		value: {
			installation_id: installationId.value,
			code_challenge: challenge,
			code_challenge_method: "S256",
			state,
			callback,
			name,
		},
	};
}
