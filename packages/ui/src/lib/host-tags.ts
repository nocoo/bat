// Pure helpers for the per-host tag picker. Lives outside the component so
// the matching/sorting/create-affordance logic is unit-testable without React.
import type { HostTag, TagItem } from "@bat/shared";
import { TAG_MAX_LENGTH } from "@bat/shared";

export interface TagSuggestion {
	tag: TagItem;
	matchStart: number; // -1 if no substring match (kept for fuzzy fallback)
}

/**
 * Filter the workspace tag list against a query, exclude tags already on the
 * host, and sort prefix matches first, then substring matches, then by name.
 */
export function suggestTags(
	allTags: TagItem[],
	hostTags: HostTag[],
	query: string,
	limit = 8,
): TagSuggestion[] {
	const taken = new Set(hostTags.map((t) => t.id));
	const q = query.trim().toLowerCase();
	const candidates = allTags.filter((t) => !taken.has(t.id));

	if (q === "") {
		return candidates
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name))
			.slice(0, limit)
			.map((tag) => ({ tag, matchStart: 0 }));
	}

	return candidates
		.map((tag) => ({ tag, matchStart: tag.name.toLowerCase().indexOf(q) }))
		.filter((s) => s.matchStart >= 0)
		.sort((a, b) => {
			if (a.matchStart !== b.matchStart) {
				return a.matchStart - b.matchStart;
			}
			return a.tag.name.localeCompare(b.tag.name);
		})
		.slice(0, limit);
}

export type CreateTagAffordance =
	| { kind: "none" }
	| { kind: "create"; name: string }
	| { kind: "tooLong" }
	| { kind: "exists"; tagId: number };

/**
 * Should we offer a "create '<name>'" row? Yes when the trimmed query is
 * non-empty AND no exact (case-insensitive) tag of that name already exists in
 * the workspace AND the name fits within the length limit.
 */
export function createTagAffordance(allTags: TagItem[], query: string): CreateTagAffordance {
	const name = query.trim();
	if (name === "") {
		return { kind: "none" };
	}
	if (name.length > TAG_MAX_LENGTH) {
		return { kind: "tooLong" };
	}
	const lower = name.toLowerCase();
	const existing = allTags.find((t) => t.name.toLowerCase() === lower);
	if (existing) {
		return { kind: "exists", tagId: existing.id };
	}
	return { kind: "create", name };
}
