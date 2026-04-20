import type { MaintenanceWindow } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

/** Fetch maintenance window for a single host (by hid). */
export function useHostMaintenance(hid: string | null) {
	return useSWR<MaintenanceWindow | null>(
		hid ? `maintenance-${hid}` : null,
		() => fetchAPI<MaintenanceWindow | null>(`/api/hosts/${hid}/maintenance`),
		{ keepPreviousData: true },
	);
}
