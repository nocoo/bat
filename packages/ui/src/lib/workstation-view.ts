// The workstations-page view preference: which of the two list presentations
// the operator last chose. One localStorage key, validated on read, table as
// the default — pure helpers so the rules are unit-testable without React.

export type WorkstationsView = "table" | "cards";

const STORAGE_KEY = "bat.workstations.view";

export function isWorkstationsView(value: string | null | undefined): value is WorkstationsView {
	return value === "table" || value === "cards";
}

/** The stored preference, or `table` when missing or unknown. */
export function loadWorkstationsView(storage: Storage = window.localStorage): WorkstationsView {
	const raw = storage.getItem(STORAGE_KEY);
	return isWorkstationsView(raw) ? raw : "table";
}

/** Persist the choice. A full or blocked store must never break the page. */
export function saveWorkstationsView(
	view: WorkstationsView,
	storage: Storage = window.localStorage,
): void {
	try {
		storage.setItem(STORAGE_KEY, view);
	} catch {
		// Private modes and quota errors only cost the persistence, not the view.
	}
}
