import type { HostTag } from "@bat/shared";
import useSWR from "swr";
import { fetchAPI } from "../api";

export function useHostTags() {
	return useSWR<Record<string, HostTag[]>>("host-tags", () =>
		fetchAPI<Record<string, HostTag[]>>("/api/tags/by-hosts"),
	);
}
