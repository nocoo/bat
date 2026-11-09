// Formatters for the machine specifications the host list shows next to each
// utilisation reading (core count, memory size, root filesystem size).
//
// Pure helpers in `lib/` so the rules are unit-testable without rendering
// React, and so the table stays presentation-only (MVVM).

/** Logical core count — "1 core" / "4 cores" / "—" when unknown. */
export function formatCoreCount(logical: number | null): string {
	if (logical === null || !Number.isFinite(logical) || logical <= 0) {
		return "—";
	}
	return logical === 1 ? "1 core" : `${logical} cores`;
}

/** Storage size — "1 GB" / "32 GB" / "512 MB" / "—" when unknown. */
export function formatSpecSize(bytes: number | null): string {
	if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) {
		return "—";
	}
	const gibibytes = bytes / 1024 ** 3;
	if (gibibytes >= 1) {
		return `${Math.round(gibibytes)} GB`;
	}
	return `${Math.round(bytes / 1024 ** 2)} MB`;
}
