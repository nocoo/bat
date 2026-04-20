import useSWR from "swr";
import { fetchAPI } from "../api";

/** Fetch all allowed ports across all hosts: { [host_id]: number[] } */
export function useAllAllowedPorts() {
	return useSWR<Record<string, number[]>>("all-allowed-ports", () =>
		fetchAPI<Record<string, number[]>>("/api/allowed-ports"),
	);
}
