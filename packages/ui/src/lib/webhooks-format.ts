// Pure helpers for the Webhooks settings page.
// Extracted from routes/webhooks.tsx for unit testing.

import type { HostOverviewItem, WebhookConfig } from "@bat/shared";

/**
 * Hosts that don't yet have a webhook config — used to populate the
 * "Select a host…" dropdown.
 */
export function filterAvailableHosts(
	hosts: readonly HostOverviewItem[] | null | undefined,
	webhooks: readonly WebhookConfig[] | null | undefined,
): HostOverviewItem[] {
	if (!hosts || hosts.length === 0) {
		return [];
	}
	if (!webhooks || webhooks.length === 0) {
		return [...hosts];
	}
	const claimed = new Set(webhooks.map((w) => w.host_id));
	return hosts.filter((h) => !claimed.has(h.host_id));
}

/**
 * Display name for a webhook row: the host's hostname if we know it,
 * otherwise the first 8 chars of the raw host_id.
 */
export function displayWebhookHostname(
	hosts: readonly HostOverviewItem[] | null | undefined,
	hostId: string,
): string {
	const host = hosts?.find((h) => h.host_id === hostId);
	return host?.hostname ?? hostId.slice(0, 8);
}

/** Build the example curl command shown in each webhook row. */
export function buildCurlCommand(workerUrl: string, token: string): string {
	return `curl -X POST ${workerUrl}/api/events \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"test","payload":{}}'`;
}

/** Normalize and validate a tag name (name page + inline rename). */
export function validateTagName(input: string, maxLength: number): { ok: boolean; name: string } {
	const name = input.trim();
	if (name.length === 0 || name.length > maxLength) {
		return { ok: false, name };
	}
	return { ok: true, name };
}
