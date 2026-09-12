export interface ConnectOperation {
	id: string;
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
	path: string;
	summary: string;
	body?: string;
	list?: boolean;
	dangerous?: boolean;
	unsupported?: string;
}
const root = "/api/v1";
const server = `${root}/servers/:serverId`;

export const CONNECT_OPERATIONS: ConnectOperation[] = [
	{
		id: "capabilities.get",
		method: "GET",
		path: `${root}/capabilities`,
		summary: "Discover this key's currently authorized servers, scope, operations and limits",
	},
	{
		id: "contract.get",
		method: "GET",
		path: `${root}/openapi.json`,
		summary: "OpenAPI 3.1 contract",
	},
	{
		id: "servers.list",
		method: "GET",
		path: `${root}/servers`,
		summary: "List only the key's currently authorized servers (empty set returns an empty list)",
		list: true,
	},
	{
		id: "server.get",
		method: "GET",
		path: server,
		summary: "Host inventory, current metrics, processes, network and maintenance information",
	},
	{
		id: "server.description.update",
		method: "PATCH",
		path: `${server}/description`,
		summary: "Update this server's description",
		body: "Description",
	},
	{
		id: "metrics.list",
		method: "GET",
		path: `${server}/metrics`,
		summary: "Historical raw or hourly metrics (from/to Unix seconds; maximum window 30 days)",
	},
	{
		id: "metrics.ingest",
		method: "POST",
		path: `${server}/metrics`,
		summary: "Submit metrics for this server and evaluate alerts",
		body: "Metrics",
	},
	{
		id: "identity.update",
		method: "POST",
		path: `${server}/identity`,
		summary: "Refresh this server's probe inventory",
		body: "Identity",
	},
	{
		id: "tier2.get",
		method: "GET",
		path: `${server}/tier2`,
		summary: "Latest software, services, ports, websites and security inventory",
	},
	{
		id: "tier2.ingest",
		method: "POST",
		path: `${server}/tier2`,
		summary: "Submit this server's tier-2 inventory and evaluate alerts",
		body: "Tier2",
	},
	{
		id: "maintenance.get",
		method: "GET",
		path: `${server}/maintenance`,
		summary: "Read the daily UTC maintenance window",
	},
	{
		id: "maintenance.set",
		method: "PUT",
		path: `${server}/maintenance`,
		summary: "Set the daily UTC window; alerts are suppressed during this window",
		body: "Maintenance",
		dangerous: true,
	},
	{
		id: "maintenance.delete",
		method: "DELETE",
		path: `${server}/maintenance`,
		summary: "Remove the maintenance window",
		dangerous: true,
	},
	{
		id: "alerts.list",
		method: "GET",
		path: `${server}/alerts`,
		summary: "Active alerts for this server",
		list: true,
	},
	{
		id: "events.list",
		method: "GET",
		path: `${server}/events`,
		summary: "Server events in stable ID order",
		list: true,
	},
	{
		id: "events.create",
		method: "POST",
		path: `${server}/events`,
		summary: "Append an event with Connect provenance (not probe-IP provenance)",
		body: "Event",
	},
	{
		id: "status.get",
		method: "GET",
		path: `${server}/status`,
		summary: "Health summary for this server",
	},
	{
		id: "monitoring.get",
		method: "GET",
		path: `${server}/monitoring`,
		summary: "Uptime Kuma compatible detail for this server",
	},
	{
		id: "monitoring.groups",
		method: "GET",
		path: `${server}/monitoring/groups`,
		summary: "Monitoring groups projected to this server",
		list: true,
	},
	{
		id: "monitoring.alerts",
		method: "GET",
		path: `${server}/monitoring/alerts`,
		summary: "Monitoring alerts projected to this server",
		list: true,
	},
	{
		id: "tags.list",
		method: "GET",
		path: `${server}/tags`,
		summary: "Shared tag definitions and this server's private tags; counts are server-local",
		list: true,
	},
	{
		id: "tags.create",
		method: "POST",
		path: `${server}/tags`,
		summary: "Create a tag owned by this server",
		body: "TagCreate",
	},
	{
		id: "tags.update",
		method: "PUT",
		path: `${server}/tags/:id`,
		summary: "Rename/recolor an exclusively server-owned tag; shared tags return 403",
		body: "TagUpdate",
	},
	{
		id: "tags.delete",
		method: "DELETE",
		path: `${server}/tags/:id`,
		summary: "Delete an exclusively server-owned tag and its assignments",
		dangerous: true,
	},
	{
		id: "hostTags.list",
		method: "GET",
		path: `${server}/host-tags`,
		summary: "Tags assigned to this server",
		list: true,
	},
	{
		id: "hostTags.add",
		method: "POST",
		path: `${server}/host-tags`,
		summary: "Assign a visible tag to this server",
		body: "TagAssignment",
	},
	{
		id: "hostTags.replace",
		method: "PUT",
		path: `${server}/host-tags`,
		summary: "Atomically replace the server's tag assignments",
		body: "TagIds",
	},
	{
		id: "hostTags.delete",
		method: "DELETE",
		path: `${server}/host-tags/:tagId`,
		summary: "Remove one server tag assignment",
		dangerous: true,
	},
	{
		id: "ports.list",
		method: "GET",
		path: `${server}/allowed-ports`,
		summary: "Port allowlist for this server",
		list: true,
	},
	{
		id: "ports.add",
		method: "POST",
		path: `${server}/allowed-ports`,
		summary: "Allow a public port and suppress its alert",
		body: "Port",
		dangerous: true,
	},
	{
		id: "ports.delete",
		method: "DELETE",
		path: `${server}/allowed-ports/:port`,
		summary: "Remove one allowed port",
		dangerous: true,
	},
	{
		id: "webhooks.list",
		method: "GET",
		path: `${server}/webhooks`,
		summary: "Webhook configuration; credential is always redacted",
		list: true,
	},
	{
		id: "webhooks.create",
		method: "POST",
		path: `${server}/webhooks`,
		summary: "Create this server's event webhook and return its credential",
		body: "Webhook",
		dangerous: true,
	},
	{
		id: "webhooks.rotate",
		method: "POST",
		path: `${server}/webhooks/:id/rotate`,
		summary: "Invalidate the old webhook credential immediately and return its replacement",
		dangerous: true,
	},
	{
		id: "webhooks.delete",
		method: "DELETE",
		path: `${server}/webhooks/:id`,
		summary: "Delete the webhook; existing events remain",
		dangerous: true,
	},
	{
		id: "agents.list",
		method: "GET",
		path: `${server}/agents`,
		summary: "Agents assigned to this server",
		list: true,
	},
	{
		id: "agents.create",
		method: "POST",
		path: `${server}/agents`,
		summary: "Create/upsert a server-bound agent; conflicting installation ownership returns 409",
		body: "AgentCreate",
	},
	{
		id: "agents.heartbeat",
		method: "POST",
		path: `${server}/agents/heartbeat`,
		summary:
			"Refresh this server's installation; mark unreported agents missing within that installation only",
		body: "Heartbeat",
	},
	{
		id: "agents.get",
		method: "GET",
		path: `${server}/agents/:id`,
		summary: "One server-bound agent",
	},
	{
		id: "agents.update",
		method: "PATCH",
		path: `${server}/agents/:id`,
		summary: "Update a server-bound agent; host reassignment is forbidden",
		body: "AgentUpdate",
	},
	{
		id: "agents.delete",
		method: "DELETE",
		path: `${server}/agents/:id`,
		summary: "Delete an agent and its local tags/bindings; cross-server bindings return 403",
		dangerous: true,
	},
	{
		id: "agents.tags",
		method: "PUT",
		path: `${server}/agents/:id/tags`,
		summary: "Replace an agent's visible tags",
		body: "TagIds",
	},
	{
		id: "assets.map",
		method: "GET",
		path: `${server}/assets/map`,
		summary: "Server-only asset graph, including local tags and bindings",
	},
	{
		id: "assets.overview",
		method: "GET",
		path: `${server}/assets/overview`,
		summary: "Server-local asset and agent counters",
	},
	{
		id: "assets.list",
		method: "GET",
		path: `${server}/assets`,
		summary: "Assets assigned to this server",
		list: true,
	},
	{
		id: "assets.create",
		method: "POST",
		path: `${server}/assets`,
		summary: "Create a server-bound asset",
		body: "AssetCreate",
	},
	{
		id: "assets.get",
		method: "GET",
		path: `${server}/assets/:id`,
		summary: "One server-bound asset",
	},
	{
		id: "assets.update",
		method: "PATCH",
		path: `${server}/assets/:id`,
		summary: "Update a server-bound asset; host reassignment is forbidden",
		body: "AssetUpdate",
	},
	{
		id: "assets.delete",
		method: "DELETE",
		path: `${server}/assets/:id`,
		summary: "Delete an asset and local tags/bindings; cross-server bindings return 403",
		dangerous: true,
	},
	{
		id: "assets.tags",
		method: "PUT",
		path: `${server}/assets/:id/tags`,
		summary: "Replace an asset's visible tags",
		body: "TagIds",
	},
	{
		id: "bindings.list",
		method: "GET",
		path: `${server}/bindings`,
		summary: "Bindings with both ends on this server",
		list: true,
	},
	{
		id: "bindings.create",
		method: "POST",
		path: `${server}/bindings`,
		summary: "Bind an agent and asset on this server",
		body: "Binding",
	},
	{
		id: "bindings.delete",
		method: "DELETE",
		path: `${server}/bindings/:agentId/:assetId`,
		summary: "Remove a binding with both ends on this server",
		dangerous: true,
	},
	{
		id: "settings.get",
		method: "GET",
		path: `${server}/settings`,
		summary: "Effective retention policy for this server",
	},
	{
		id: "settings.update",
		method: "PUT",
		path: `${server}/settings`,
		summary: "Global retention cannot be changed with a Connect token",
		unsupported: "Retention applies to every server. Use browser workspace administration.",
	},
	{
		id: "setup.get",
		method: "GET",
		path: `${server}/setup`,
		summary: "Probe endpoint information; deployment secrets are never returned",
	},
	{
		id: "audit.list",
		method: "GET",
		path: `${server}/audit`,
		summary: "Server-specific audit trail, including credential management and API provenance",
		list: true,
	},
	{
		id: "requests.get",
		method: "GET",
		path: `${root}/requests/:key`,
		summary:
			"Inspect the current token's idempotent request outcome; never exposes response secrets",
	},
];

export const CONNECT_UNSUPPORTED = [
	{
		feature: "workspace.settings.write",
		reason: "Retention is global, so a server token cannot change it.",
		operation: "settings.update",
	},
	{
		feature: "shared.tags.write",
		reason:
			"Shared/global tags affect other servers. Only exclusively owned tags may be changed; shared mutations return 403.",
	},
	{
		feature: "cross_server.bindings",
		reason:
			"Both ends must belong to the request's target server, even if the key also authorizes other servers; unassigned resources remain outside its authority.",
	},
	{
		feature: "credentials.management",
		reason:
			"Connect/CLI token issuance, reveal, rotation and grants require Access-protected browser management. Bearer requests return 501 at /api/v1/tokens and /api/v1/cli-tokens.",
	},
	{
		feature: "host.delete_or_retire",
		reason:
			"Bat has no product operation for deleting/retiring hosts. DELETE on a server returns 501.",
	},
	{
		feature: "remote_shell_or_software_install",
		reason:
			"Bat observes hosts; it does not execute remote shell commands or install software. POST /servers/{serverId}/execute returns 501.",
	},
] as const;
