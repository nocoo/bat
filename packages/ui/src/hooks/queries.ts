// MVVM "Model" layer: every server query the UI consumes lives here as a
// thin SWR + fetchAPI wrapper. Centralizing them keeps cache keys, polling
// intervals and `keepPreviousData` behavior consistent and trivially
// reviewable.
//
// View components should depend on these hooks (not on `fetchAPI` directly)
// or, when state/intents need to be combined, on per-route ViewModel hooks
// that compose these queries.

import type {
	AlertItem,
	AllowedPort,
	EventsListResponse,
	HostDetailItem,
	HostOverviewItem,
	HostTag,
	MetricsQueryResponse,
	TagItem,
	Tier2Snapshot,
	WebhookConfig,
} from "@bat/shared";
import useSWR, { type SWRConfiguration } from "swr";
import { getAPI } from "../api";

// ---- Shared SWR configurations ------------------------------------------
const POLL_30: SWRConfiguration = { refreshInterval: 30_000, keepPreviousData: true };
const POLL_60: SWRConfiguration = { refreshInterval: 60_000, keepPreviousData: true };
const KEEP_PREV: SWRConfiguration = { keepPreviousData: true };
const STATIC: SWRConfiguration = { revalidateOnFocus: false, revalidateOnReconnect: false };
const NO_FOCUS_REFETCH: SWRConfiguration = { revalidateOnFocus: false };

// ---- Fleet-wide queries -------------------------------------------------
export const useHosts = () =>
	useSWR<HostOverviewItem[]>("hosts", () => getAPI<HostOverviewItem[]>("/api/hosts"), POLL_30);

export const useAlerts = () =>
	useSWR<AlertItem[]>("alerts", () => getAPI<AlertItem[]>("/api/alerts"), POLL_30);

export const useTags = () => useSWR<TagItem[]>("tags", () => getAPI<TagItem[]>("/api/tags"));

export const useHostTags = () =>
	useSWR<Record<string, HostTag[]>>("host-tags", () =>
		getAPI<Record<string, HostTag[]>>("/api/tags/by-hosts"),
	);

export const useWebhooks = () =>
	useSWR<(WebhookConfig & { hostname: string })[]>(
		"webhooks",
		() => getAPI<(WebhookConfig & { hostname: string })[]>("/api/webhooks"),
		KEEP_PREV,
	);

// ---- Identity / setup ---------------------------------------------------
interface UserInfo {
	email: string | null;
	name: string | null;
	authenticated: boolean;
}
export const useMe = () => useSWR<UserInfo>("me", () => getAPI<UserInfo>("/api/me"), STATIC);

// Note: write_key is NOT returned by the API for security reasons.
// Users must obtain it manually from the Cloudflare console.
interface SetupConfig {
	worker_url: string;
}
export const useSetup = () =>
	useSWR<SetupConfig>("setup", () => getAPI<SetupConfig>("/api/setup"), NO_FOCUS_REFETCH);

// ---- Per-host queries ---------------------------------------------------
/** Fetch full host inventory detail — called once on mount, no polling. */
export const useHostDetail = (hid: string) =>
	useSWR<HostDetailItem>(`host-detail-${hid}`, () => getAPI<HostDetailItem>(`/api/hosts/${hid}`));

// Refresh every 60s — aligned with the minute-quantized `now` in the detail
// page, so each tick produces a new SWR key and fetches the latest window.
export const useHostMetrics = (id: string | null, from: number, to: number) =>
	useSWR<MetricsQueryResponse>(
		id ? `metrics-${id}-${from}-${to}` : null,
		() =>
			getAPI<MetricsQueryResponse>(`/api/hosts/${id}/metrics`, {
				from: String(from),
				to: String(to),
			}),
		POLL_60,
	);

// ---- Allowed ports ------------------------------------------------------
export const useAllowedPorts = (hostId: string | null) =>
	useSWR<AllowedPort[]>(
		hostId ? `allowed-ports-${hostId}` : null,
		() => getAPI<AllowedPort[]>(`/api/hosts/${hostId}/allowed-ports`),
		KEEP_PREV,
	);

export const useAllAllowedPorts = () =>
	useSWR<Record<string, number[]>>(
		"all-allowed-ports",
		() => getAPI<Record<string, number[]>>("/api/allowed-ports"),
		KEEP_PREV,
	);

// ---- Tier 2 snapshot (slow-scan signals: ports, software, websites…) ----
// Polled every 60s — the worker stores at most one snapshot per ~6h cycle,
// so faster polling would just spam the cache.
export const useHostTier2 = (hid: string | null) =>
	useSWR<Tier2Snapshot>(
		hid ? `tier2-${hid}` : null,
		() => getAPI<Tier2Snapshot>(`/api/hosts/${hid}/tier2`),
		POLL_60,
	);

// ---- Events -------------------------------------------------------------
export const EVENTS_PAGE_SIZE = 30;

export function useEvents(hostId?: string, page = 1) {
	const offset = (page - 1) * EVENTS_PAGE_SIZE;
	const params: Record<string, string> = {
		limit: String(EVENTS_PAGE_SIZE),
		offset: String(offset),
	};
	if (hostId) {
		params.host_id = hostId;
	}
	const key = hostId ? `events-${hostId}-page-${page}` : `events-page-${page}`;
	return useSWR<EventsListResponse>(
		key,
		() => getAPI<EventsListResponse>("/api/events", params),
		POLL_30,
	);
}
