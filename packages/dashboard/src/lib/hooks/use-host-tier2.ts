"use client";

import type { Tier2Snapshot } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

/** Fetch latest tier2 snapshot for a host — called once on mount, no polling. */
export function useHostTier2(hid: string) {
	return useSWR<Tier2Snapshot>(`host-tier2-${hid}`, () =>
		fetchAPI<Tier2Snapshot>(`/api/hosts/${hid}/tier2`),
	);
}
