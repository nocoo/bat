"use client";

import type { WebhookConfig } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

export function useWebhooks() {
	return useSWR<(WebhookConfig & { hostname: string })[]>(
		"webhooks",
		() => fetchAPI<(WebhookConfig & { hostname: string })[]>("/api/webhooks"),
		{
			keepPreviousData: true,
		},
	);
}
