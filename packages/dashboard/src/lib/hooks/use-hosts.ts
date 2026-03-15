"use client";

import type { HostOverviewItem } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

const REFRESH_INTERVAL_MS = 30_000;

export function useHosts() {
	return useSWR<HostOverviewItem[]>("hosts", () => fetchAPI<HostOverviewItem[]>("/api/hosts"), {
		refreshInterval: REFRESH_INTERVAL_MS,
	});
}
