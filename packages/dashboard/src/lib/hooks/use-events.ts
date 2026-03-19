"use client";

import type { EventItem } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

const REFRESH_INTERVAL_MS = 30_000;

export function useEvents(hostId?: string) {
	const params = hostId ? { host_id: hostId } : undefined;
	return useSWR<EventItem[]>(
		hostId ? `events-${hostId}` : "events",
		() => fetchAPI<EventItem[]>("/api/events", params),
		{
			refreshInterval: REFRESH_INTERVAL_MS,
			keepPreviousData: true,
		},
	);
}
