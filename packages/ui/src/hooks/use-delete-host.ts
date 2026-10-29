import { type HostOverviewItem, hashHostId } from "@bat/shared";
import { useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { deleteHostAPI } from "../api";

export function useDeleteHost(hostId: string, routeId: string) {
	const { mutate } = useSWRConfig();
	const pending = useRef(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function deleteHost(confirmation: string): Promise<boolean> {
		if (pending.current || confirmation !== hostId) return false;
		pending.current = true;
		setDeleting(true);
		setError(null);
		try {
			await deleteHostAPI(routeId, confirmation);
			await mutate<HostOverviewItem[]>(
				"hosts",
				(current) => current?.filter((host) => host.host_id !== hostId),
				{ revalidate: false },
			);
			await mutate(
				(key) =>
					typeof key === "string" &&
					(key === "alerts" ||
						key === "host-tags" ||
						key === "all-allowed-ports" ||
						key === "webhooks" ||
						key.startsWith("events-") ||
						key.startsWith("/api/connect/") ||
						[hostId, routeId, hashHostId(hostId)].some(
							(id) =>
								[
									`host-detail-${id}`,
									`tier2-${id}`,
									`host-tags-${id}`,
									`maintenance-${id}`,
									`allowed-ports-${id}`,
								].includes(key) || key.startsWith(`metrics-${id}-`),
						)),
				undefined,
				{ revalidate: false },
			);
			return true;
		} catch {
			setError("Could not confirm deletion. Refresh the host before retrying.");
			return false;
		} finally {
			pending.current = false;
			setDeleting(false);
		}
	}

	return { deleteHost, deleting, error, clearError: () => setError(null) };
}
