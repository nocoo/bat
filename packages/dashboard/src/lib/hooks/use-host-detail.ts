"use client";

import type { HostDetailItem } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

/** Fetch full host inventory detail — called once on mount, no polling. */
export function useHostDetail(hid: string) {
	return useSWR<HostDetailItem>(`host-detail-${hid}`, () =>
		fetchAPI<HostDetailItem>(`/api/hosts/${hid}`),
	);
}
