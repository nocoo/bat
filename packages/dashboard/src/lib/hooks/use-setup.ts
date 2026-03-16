"use client";

import useSWR from "swr";
import { fetchAPI } from "../api";

interface SetupConfig {
	worker_url: string;
	write_key: string;
	dashboard_url: string;
}

export function useSetup() {
	return useSWR<SetupConfig>("setup", () => fetchAPI<SetupConfig>("/api/setup"), {
		revalidateOnFocus: false,
	});
}
