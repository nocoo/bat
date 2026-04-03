"use client";

import type { EventsListResponse } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

const REFRESH_INTERVAL_MS = 30_000;
const PAGE_SIZE = 30;

export function useEvents(hostId?: string, page = 1) {
	const offset = (page - 1) * PAGE_SIZE;
	const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(offset) };
	if (hostId) {
		params.host_id = hostId;
	}

	const key = hostId ? `events-${hostId}-page-${page}` : `events-page-${page}`;

	return useSWR<EventsListResponse>(
		key,
		() => fetchAPI<EventsListResponse>("/api/events", params),
		{
			refreshInterval: REFRESH_INTERVAL_MS,
			keepPreviousData: true,
		},
	);
}

export { PAGE_SIZE as EVENTS_PAGE_SIZE };
