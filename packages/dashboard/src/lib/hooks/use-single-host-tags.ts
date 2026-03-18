"use client";

import type { HostTag } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

/** Fetch tags assigned to a single host (by raw host_id). */
export function useSingleHostTags(hostId: string | null) {
	return useSWR<HostTag[]>(
		hostId ? `host-tags-${hostId}` : null,
		() => fetchAPI<HostTag[]>(`/api/hosts/${hostId}/tags`),
		{ keepPreviousData: true },
	);
}
