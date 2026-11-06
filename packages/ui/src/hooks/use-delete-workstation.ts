import type { WorkstationRecord } from "@bat/shared";
import { useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { deleteWorkstationAPI } from "../api";

export function useDeleteWorkstation(id: string) {
	const { mutate } = useSWRConfig();
	const pending = useRef(false);
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function deleteWorkstation(): Promise<boolean> {
		if (pending.current) return false;
		pending.current = true;
		setDeleting(true);
		setError(null);
		try {
			await deleteWorkstationAPI(id);
			await mutate<WorkstationRecord[]>(
				"workstations",
				(current) => current?.filter((workstation) => workstation.id !== id),
				{ revalidate: false },
			);
			await mutate(
				(key) =>
					typeof key === "string" &&
					(key === `workstation-${id}` ||
						key.startsWith(`workstation-metrics-${id}-`) ||
						key.startsWith(`workstation-connectivity-${id}-`)),
				undefined,
				{ revalidate: false },
			);
			return true;
		} catch {
			setError(
				"Could not delete this workstation. It may belong to another account, or the request was rejected.",
			);
			return false;
		} finally {
			pending.current = false;
			setDeleting(false);
		}
	}

	return { deleteWorkstation, deleting, error, clearError: () => setError(null) };
}
