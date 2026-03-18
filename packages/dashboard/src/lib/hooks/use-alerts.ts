"use client";

import type { AlertItem } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

const REFRESH_INTERVAL_MS = 30_000;

export function useAlerts() {
	return useSWR<AlertItem[]>("alerts", () => fetchAPI<AlertItem[]>("/api/alerts"), {
		refreshInterval: REFRESH_INTERVAL_MS,
		keepPreviousData: true,
	});
}
