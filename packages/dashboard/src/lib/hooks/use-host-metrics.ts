"use client";

import type { MetricsQueryResponse } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

const REFRESH_INTERVAL_MS = 30_000;

export function useHostMetrics(id: string | null, from: number, to: number) {
	const key = id ? `metrics-${id}-${from}-${to}` : null;
	return useSWR<MetricsQueryResponse>(
		key,
		() =>
			fetchAPI<MetricsQueryResponse>(`/api/hosts/${id}/metrics`, {
				from: String(from),
				to: String(to),
			}),
		{ refreshInterval: REFRESH_INTERVAL_MS, keepPreviousData: true },
	);
}
