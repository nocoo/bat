"use client";

import type { AllowedPort } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

/** Fetch allowed ports for a single host (by raw host_id). */
export function useAllowedPorts(hostId: string | null) {
	return useSWR<AllowedPort[]>(
		hostId ? `allowed-ports-${hostId}` : null,
		() => fetchAPI<AllowedPort[]>(`/api/hosts/${hostId}/allowed-ports`),
		{ keepPreviousData: true },
	);
}
