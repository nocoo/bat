// The hosts-page view preference: which of the two list presentations the
// operator last chose. One localStorage key, validated on read, table as the
// default — pure helpers so the rules are unit-testable without React.

export type HostsView = "table" | "cards";

const STORAGE_KEY = "bat.hosts.view";

export function isHostsView(value: string | null | undefined): value is HostsView {
	return value === "table" || value === "cards";
}

/** The stored preference, or `table` when missing or unknown. */
export function loadHostsView(storage: Storage = window.localStorage): HostsView {
	const raw = storage.getItem(STORAGE_KEY);
	return isHostsView(raw) ? raw : "table";
}

/** Persist the choice. A full or blocked store must never break the page. */
export function saveHostsView(view: HostsView, storage: Storage = window.localStorage): void {
	try {
		storage.setItem(STORAGE_KEY, view);
	} catch {
		// Private modes and quota errors only cost the persistence, not the view.
	}
}
