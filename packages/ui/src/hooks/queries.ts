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
	MaintenanceWindow,
	MetricsQueryResponse,
	SettingsResponse,
	TagItem,
	Tier2Snapshot,
	WebhookConfig,
	WorkstationConnectivityResponse,
	WorkstationMetricsResponse,
	WorkstationRecord,
} from "@bat/shared";
import useSWR, { type SWRConfiguration } from "swr";
import useSWRInfinite from "swr/infinite";
import { getAPI } from "../api";
import { mergeMetricPages } from "../lib/workstation-format";

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

/** Tags assigned to a specific host. Suspends when hostId is null. */
export const useHostTagsFor = (hostId: string | null) =>
	useSWR<HostTag[]>(
		hostId ? `host-tags-${hostId}` : null,
		() => getAPI<HostTag[]>(`/api/hosts/${hostId}/tags`),
		KEEP_PREV,
	);

/** Per-host maintenance window. Suspends when hostId is null. */
export const useHostMaintenance = (hostId: string | null) =>
	useSWR<MaintenanceWindow | null>(
		hostId ? `maintenance-${hostId}` : null,
		() => getAPI<MaintenanceWindow | null>(`/api/hosts/${hostId}/maintenance`),
		KEEP_PREV,
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
	avatar: string | null;
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

// ---- Settings ---------------------------------------------------------------
export const useSettings = () =>
	useSWR<SettingsResponse>("settings", () => getAPI<SettingsResponse>("/api/settings"), KEEP_PREV);

// ---- Workstations -----------------------------------------------------------
// The list and the detail snapshot share one cadence so a fresh report updates
// public IP, connectivity, last-seen and the derived status together.
export const useWorkstations = () =>
	useSWR<WorkstationRecord[]>(
		"workstations",
		() => getAPI<WorkstationRecord[]>("/api/workstations"),
		POLL_60,
	);

export const useWorkstation = (id: string | null) =>
	useSWR<WorkstationRecord>(
		id ? `workstation-${id}` : null,
		() => getAPI<WorkstationRecord>(`/api/workstations/${id}`),
		POLL_60,
	);

export const WORKSTATION_HISTORY_PAGE_SIZE = 100;

/**
 * Deliberate newest-first metric pages. Only the pages the operator asked for
 * are fetched; each request stays at the shared 100 sample ceiling.
 */
export function useWorkstationMetricsPages(id: string | null, from: number, to: number) {
	const response = useSWRInfinite<WorkstationMetricsResponse>(
		(pageIndex, previousPage) => {
			if (!id) return null;
			if (previousPage && previousPage.page.next_offset === null) return null;
			return [
				`workstation-metrics-${id}-${from}-${to}`,
				pageIndex * WORKSTATION_HISTORY_PAGE_SIZE,
			] as const;
		},
		([, offset]) =>
			getAPI<WorkstationMetricsResponse>(`/api/workstations/${id}/metrics`, {
				from: String(from),
				to: String(to),
				limit: String(WORKSTATION_HISTORY_PAGE_SIZE),
				offset: String(offset),
			}),
		{ refreshInterval: 60_000 },
	);
	const pages = response.data ?? [];
	const newestPage = pages[0];
	const olderPages = pages.slice(1);
	return {
		metrics: mergeMetricPages(
			newestPage?.data ?? [],
			olderPages
				.slice()
				.reverse()
				.flatMap((page) => page.data),
		),
		newestCount: newestPage?.data.length ?? 0,
		olderCount: olderPages.reduce((total, page) => total + page.data.length, 0),
		hasOlder: pages.at(-1)?.page.next_offset !== null && pages.length > 0,
		isLoading: response.isLoading && !response.data,
		isLoadingOlder: response.isValidating && response.size > pages.length,
		error: response.error,
		loadOlder: () => void response.setSize(response.size + 1),
		mutate: () => void response.mutate(),
	};
}

export const useWorkstationConnectivity = (
	id: string | null,
	from: number,
	to: number,
	limit = 100,
) =>
	useSWR<WorkstationConnectivityResponse>(
		id ? `workstation-connectivity-${id}-${from}-${to}-${limit}` : null,
		() =>
			getAPI<WorkstationConnectivityResponse>(`/api/workstations/${id}/connectivity`, {
				from: String(from),
				to: String(to),
				limit: String(limit),
			}),
		POLL_60,
	);
