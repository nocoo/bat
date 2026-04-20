import useSWR from "swr";
import { fetchAPI } from "../api";

interface UserInfo {
	email: string | null;
	name: string | null;
	authenticated: boolean;
}

export function useMe() {
	return useSWR<UserInfo>("me", () => fetchAPI<UserInfo>("/api/me"), {
		// Don't auto-refresh — user info doesn't change during session
		revalidateOnFocus: false,
		revalidateOnReconnect: false,
	});
}
