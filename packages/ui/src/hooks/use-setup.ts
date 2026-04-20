import useSWR from "swr";
import { fetchAPI } from "../api";

// Setup config returned by /api/setup
// Note: write_key is NOT returned by the API for security reasons
// Users must obtain it manually from Cloudflare console
interface SetupConfig {
	worker_url: string;
}

export function useSetup() {
	return useSWR<SetupConfig>("setup", () => fetchAPI<SetupConfig>("/api/setup"), {
		revalidateOnFocus: false,
	});
}
