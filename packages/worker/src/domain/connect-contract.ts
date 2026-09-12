import { BAT_VERSION, CONNECT_LIMITS, RETENTION_OPTIONS, TAG_COLOR_COUNT } from "@bat/shared";
import { dereference, type Schema as JsonSchema, validate } from "@cfworker/json-schema";
import { ConnectFault } from "./connect.js";
import DTO_SCHEMAS from "./connect-dtos.json";
import {
	CONNECT_OPERATIONS,
	CONNECT_UNSUPPORTED,
	type ConnectOperation,
} from "./connect-operations.js";

type Schema = Record<string, unknown>;
const string = { type: "string" };
const nullableString = { type: ["string", "null"] };
const metadata = {
	type: "object",
	maxProperties: 100,
	additionalProperties: true,
	description: "JSON object, at most 4096 UTF-8 bytes.",
};
const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
	type: "object",
	properties,
	required,
});
const enumString = (...values: string[]): Schema => ({ type: "string", enum: values });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const array = (items: Schema): Schema => ({ type: "array", items });
const tagIds = object(
	{
		tag_ids: {
			type: "array",
			maxItems: 10,
			uniqueItems: true,
			items: { type: "integer", minimum: 1 },
		},
	},
	["tag_ids"],
);
const agentFields = {
	host_id: {
		...string,
		description: "If supplied, must exactly equal serverId. Reassignment/null is forbidden.",
	},
	nickname: { ...nullableString, maxLength: 64 },
	role: { ...nullableString, maxLength: 128 },
	runtime_app: { ...nullableString, maxLength: 64 },
	runtime_version: { ...nullableString, maxLength: 32 },
	status: enumString("running", "stopped", "missing", "unknown"),
	metadata,
};
const assetFields = {
	host_id: agentFields.host_id,
	name: { ...string, minLength: 1, maxLength: 128 },
	subtype: { ...nullableString, maxLength: 64 },
	provider: { ...nullableString, maxLength: 64 },
	status: enumString("active", "inactive", "missing", "unknown"),
	metadata,
};

export const CONNECT_SCHEMAS: Record<string, Schema> = {
	...DTO_SCHEMAS,
	AgentCreate: object(
		{
			...agentFields,
			source_key: { ...string, minLength: 1, maxLength: 128 },
			match_key: { ...string, minLength: 1, maxLength: 256 },
		},
		["source_key", "match_key"],
	),
	AgentUpdate: object(agentFields),
	AssetCreate: object(
		{
			...assetFields,
			type: enumString("cloud_service", "domain", "container", "cli_tool", "mcp_service"),
		},
		["type", "name"],
	),
	AssetUpdate: object(assetFields),
	TagIds: tagIds,
	TagCreate: object(
		{
			name: { ...string, minLength: 1, maxLength: 32 },
			color: { type: "integer", minimum: 0, maximum: TAG_COLOR_COUNT - 1 },
		},
		["name"],
	),
	TagUpdate: object({
		name: { ...string, minLength: 1, maxLength: 32 },
		color: { type: "integer", minimum: 0, maximum: TAG_COLOR_COUNT - 1 },
	}),
	TagAssignment: object({ tag_id: { type: "integer", minimum: 1 } }, ["tag_id"]),
	Description: object({ description: { type: ["string", "null"], maxLength: 200 } }, [
		"description",
	]),
	Maintenance: object(
		{
			start: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
			end: { type: "string", pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
			reason: { ...string, maxLength: 200 },
		},
		["start", "end"],
	),
	Port: object(
		{
			port: { type: "integer", minimum: 1, maximum: 65535 },
			reason: { ...string, maxLength: 200 },
		},
		["port"],
	),
	Binding: object({ agent_id: string, asset_id: string }, ["agent_id", "asset_id"]),
	Webhook: object({ host_id: agentFields.host_id }, ["host_id"]),
	Event: object(
		{
			title: { ...string, minLength: 1, maxLength: 200 },
			body: {
				type: "object",
				additionalProperties: true,
				description: "At most 16 KiB serialized JSON.",
			},
			tags: { type: "array", maxItems: 10, items: { ...string, minLength: 1, maxLength: 50 } },
		},
		["title", "body"],
	),
	Heartbeat: object(
		{
			source_key: { ...string, minLength: 1, maxLength: 128 },
			agents: {
				type: "array",
				maxItems: 100,
				items: object(
					{
						match_key: { ...string, minLength: 1, maxLength: 256 },
						status: enumString("running", "stopped"),
						runtime_app: nullableString,
						runtime_version: nullableString,
					},
					["match_key", "status"],
				),
			},
		},
		["source_key", "agents"],
	),
	Identity: {
		...DTO_SCHEMAS.IdentityPayload,
		properties: { ...DTO_SCHEMAS.IdentityPayload.properties, host_id: agentFields.host_id },
	},
	Metrics: {
		...DTO_SCHEMAS.MetricsPayload,
		properties: { ...DTO_SCHEMAS.MetricsPayload.properties, host_id: agentFields.host_id },
	},
	Tier2: {
		...DTO_SCHEMAS.Tier2Payload,
		properties: { ...DTO_SCHEMAS.Tier2Payload.properties, host_id: agentFields.host_id },
	},
	Error: object(
		{
			error: object(
				{ code: string, message: string, requestId: { type: "string", format: "uuid" } },
				["code", "message", "requestId"],
			),
		},
		["error"],
	),
	Envelope: object(
		{
			data: {},
			requestId: { type: "string", format: "uuid" },
			serverId: string,
			page: object({ limit: { type: "integer" }, nextCursor: nullableString }, [
				"limit",
				"nextCursor",
			]),
		},
		["data", "requestId"],
	),
	Capabilities: object(
		{
			apiVersion: { const: "v1" },
			productVersion: string,
			serverId: string,
			scope: enumString("read", "write"),
			permissions: array(enumString("read", "write")),
			baseUrl: string,
			openapi: string,
			authorization: string,
			operations: array(
				object(
					{
						id: string,
						method: string,
						path: string,
						summary: string,
						requiredScope: string,
						supported: { type: "boolean" },
						allowed: { type: "boolean" },
					},
					["id", "method", "path", "summary", "requiredScope", "supported", "allowed"],
				),
			),
			unsupported: array(object({ feature: string, reason: string }, ["feature", "reason"])),
			limits: { type: "object" },
			concurrency: string,
			idempotency: string,
			requestId: string,
		},
		[
			"apiVersion",
			"productVersion",
			"serverId",
			"scope",
			"permissions",
			"operations",
			"unsupported",
			"limits",
			"requestId",
		],
	),
	OpenApi: object(
		{
			openapi: { const: "3.1.0" },
			info: { type: "object" },
			paths: { type: "object" },
			components: { type: "object" },
		},
		["openapi", "info", "paths", "components"],
	),
	MonitoringHost: object(
		{
			status: { const: "ok" },
			host_id: string,
			hostname: string,
			tier: ref("HostStatus"),
			last_seen: { type: "number" },
			uptime_seconds: { type: ["number", "null"] },
			alert_count: { type: "integer" },
			alerts: array(
				object(
					{
						rule_id: string,
						severity: string,
						value: { type: ["number", "null"] },
						message: nullableString,
						triggered_at: { type: "number" },
					},
					["rule_id", "severity", "value", "message", "triggered_at"],
				),
			),
			tags: array(string),
		},
		[
			"status",
			"host_id",
			"hostname",
			"tier",
			"last_seen",
			"uptime_seconds",
			"alert_count",
			"alerts",
			"tags",
		],
	),
	RequestStatus: object(
		{
			state: enumString("pending", "complete"),
			status: { type: ["integer", "null"] },
			originalRequestId: string,
			responseAvailable: { type: "boolean" },
			createdAt: string,
		},
		["state", "status", "originalRequestId", "responseAvailable", "createdAt"],
	),
	Settings: object({ retention_days: { enum: RETENTION_OPTIONS } }, ["retention_days"]),
	Setup: object({ worker_url: string }, ["worker_url"]),
	WebhookCredential: object({ token: string }, ["token"]),
	BindingCreated: object({ agent_id: string, asset_id: string }, ["agent_id", "asset_id"]),
};

for (const name of [
	"AgentCreate",
	"AgentUpdate",
	"AssetCreate",
	"AssetUpdate",
	"TagIds",
	"TagCreate",
	"TagUpdate",
	"TagAssignment",
	"Description",
	"Maintenance",
	"Port",
	"Binding",
	"Webhook",
	"Event",
	"Heartbeat",
	"Identity",
	"Metrics",
	"Tier2",
]) {
	(CONNECT_SCHEMAS[name] as Schema).additionalProperties = false;
}
const schemaLookup = dereference({ components: { schemas: CONNECT_SCHEMAS } });

export function validateConnectInput(name: string, body: unknown): void {
	const schema = CONNECT_SCHEMAS[name];
	if (!schema || !validate(body, schema as JsonSchema, "2020-12", schemaLookup).valid)
		throw new ConnectFault(
			400,
			"invalid_payload",
			`Payload does not match ${name}. See openapi.json for required fields and types.`,
		);
}

const responseTypes: Record<string, string> = {
	"capabilities.get": "Capabilities",
	"contract.get": "OpenApi",
	"servers.list": "HostOverviewItem",
	"server.get": "HostDetailItem",
	"metrics.list": "MetricsQueryResponse",
	"tier2.get": "Tier2Snapshot",
	"maintenance.get": "MaintenanceWindow",
	"alerts.list": "AlertItem",
	"events.list": "EventItem",
	"status.get": "HealthResponse",
	"monitoring.get": "MonitoringHost",
	"monitoring.groups": "MonitoringGroup",
	"monitoring.alerts": "MonitoringAlertItem",
	"tags.list": "TagItem",
	"tags.create": "TagItem",
	"tags.update": "HostTag",
	"hostTags.list": "HostTag",
	"hostTags.add": "HostTag",
	"hostTags.replace": "HostTag",
	"ports.list": "AllowedPort",
	"ports.add": "AllowedPort",
	"webhooks.list": "WebhookConfig",
	"webhooks.create": "WebhookConfig",
	"webhooks.rotate": "WebhookCredential",
	"agents.list": "AgentItem",
	"agents.create": "AgentItem",
	"agents.heartbeat": "AgentHeartbeatResponse",
	"agents.get": "AgentItem",
	"agents.update": "AgentItem",
	"agents.tags": "AgentItem",
	"assets.map": "AssetMapResponse",
	"assets.overview": "AssetsOverview",
	"assets.list": "AssetItem",
	"assets.create": "AssetItem",
	"assets.get": "AssetItem",
	"assets.update": "AssetItem",
	"assets.tags": "AssetItem",
	"bindings.list": "BindingItem",
	"bindings.create": "BindingCreated",
	"settings.get": "Settings",
	"setup.get": "Setup",
	"audit.list": "ConnectAudit",
	"requests.get": "RequestStatus",
};

export function connectResponseSchema(operation: ConnectOperation): Schema {
	if (operation.id === "capabilities.get" || operation.id === "contract.get")
		return ref(responseTypes[operation.id] as string);
	let data = ref(responseTypes[operation.id] ?? "Envelope");
	if (operation.id === "maintenance.get") data = { anyOf: [data, { type: "null" }] };
	if (operation.list || operation.id === "hostTags.replace") data = array(data);
	const properties: Record<string, Schema> = { data, requestId: string, serverId: string };
	const required = ["data", "requestId", "serverId"];
	if (operation.list) {
		properties.page = object(
			{ limit: { type: "integer", minimum: 1, maximum: 100 }, nextCursor: nullableString },
			["limit", "nextCursor"],
		);
		required.push("page");
	}
	return object(properties, required);
}

export function connectOpenApi() {
	const paths: Record<string, Record<string, unknown>> = {};
	for (const operation of CONNECT_OPERATIONS) {
		const path = operation.path.replace(/:([A-Za-z]+)/g, "{$1}");
		const writing = operation.method !== "GET";
		const parameters: Record<string, unknown>[] = [...operation.path.matchAll(/:([A-Za-z]+)/g)].map(
			(match) => ({ name: match[1], in: "path", required: true, schema: string }),
		);
		if (operation.list)
			parameters.push(
				{
					name: "limit",
					in: "query",
					schema: {
						type: "integer",
						minimum: 1,
						maximum: CONNECT_LIMITS.pageMax,
						default: CONNECT_LIMITS.pageDefault,
					},
				},
				{
					name: "cursor",
					in: "query",
					schema: string,
					description:
						"Opaque cursor bound to the server, operation and query. Collections use stable ID order; audit is newest first.",
				},
			);
		if (operation.id === "metrics.list")
			parameters.push(
				{ name: "from", in: "query", required: true, schema: { type: "integer", minimum: 0 } },
				{ name: "to", in: "query", required: true, schema: { type: "integer", minimum: 0 } },
			);
		if (operation.id === "monitoring.alerts")
			parameters.push(
				{ name: "severity", in: "query", schema: enumString("critical", "warning", "info") },
				{
					name: "tag",
					in: "query",
					style: "form",
					explode: true,
					schema: array(string),
					description: "Repeat tag for AND filtering.",
				},
			);
		if (writing && !operation.unsupported)
			parameters.push(
				{
					name: "Idempotency-Key",
					in: "header",
					required: true,
					schema: { type: "string", pattern: "^[A-Za-z0-9_-]{8,128}$" },
					description:
						"Persist and reuse for retries of the same request. Responses retained 7 days; key tombstones are retained. Pending outcomes must be inspected, never retried with a new key.",
				},
				{
					name: "If-Match",
					in: "header",
					required: true,
					schema: string,
					description:
						"Configuration ETag from a GET; stale writes return 412. Includes browser and CLI control changes, excludes probe samples.",
				},
			);
		if (operation.dangerous)
			parameters.push({
				name: "X-Bat-Confirm",
				in: "header",
				required: true,
				schema: string,
				description:
					"Must exactly equal the canonical serverId. Explicitly acknowledges the operation and its documented cascades.",
			});
		const entry: Record<string, unknown> = {
			operationId: operation.id,
			summary: operation.summary,
			security: [{ ConnectBearer: [] }],
			parameters,
			"x-required-scope": writing ? "write" : "read",
			"x-supported": !operation.unsupported,
			responses: {
				"200": {
					description: "Success (GET responses carry a server configuration ETag)",
					content: { "application/json": { schema: connectResponseSchema(operation) } },
				},
				"201": {
					description: "Resource created",
					content: { "application/json": { schema: connectResponseSchema(operation) } },
				},
				"204": { description: "Mutation completed; empty body with X-Request-Id and ETag headers" },
				default: {
					description:
						"Structured error. 400 invalid input; 401 invalid/revoked/expired token; 403 scope/server/product denial; 404 unavailable resource; 409 idempotency conflict/unknown outcome; 412 stale version; 413 size limit; 415 media type; 422 product limit; 428 required precondition; 429 rate limit (Retry-After); 501 unsupported; 503 dependency unavailable; 504 timeout (mutation outcome may be unknown).",
					content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
				},
			},
		};
		if (operation.body)
			entry.requestBody = {
				required: true,
				content: {
					"application/json": { schema: { $ref: `#/components/schemas/${operation.body}` } },
				},
			};
		paths[path] ??= {};
		(paths[path] as Record<string, unknown>)[operation.method.toLowerCase()] = entry;
	}
	return {
		openapi: "3.1.0",
		info: {
			title: "Bat Connect API",
			version: BAT_VERSION,
			description:
				"Server-bound Bearer API. write includes read. HEAD is supported for every GET. All responses are no-store. No browser CORS; cookies and legacy keys never authenticate v1. Runtime observation payloads retain Bat's existing extensible DTO fields.",
		},
		servers: [{ url: "https://bat.hexly.ai" }],
		paths,
		components: {
			securitySchemes: {
				ConnectBearer: {
					type: "http",
					scheme: "bearer",
					bearerFormat: "batc_<256-bit random secret>",
				},
			},
			schemas: CONNECT_SCHEMAS,
		},
		"x-limits": CONNECT_LIMITS,
		"x-unsupported": CONNECT_UNSUPPORTED,
	};
}
