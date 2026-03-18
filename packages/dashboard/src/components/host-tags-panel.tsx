"use client";

import { TagChip } from "@/components/tag-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSingleHostTags, useTags } from "@/lib/hooks";
import { TAG_NAME_REGEX } from "@bat/shared";
import type { TagItem } from "@bat/shared";
import { Plus, Tag } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

async function apiRequest(url: string, options?: RequestInit) {
	const res = await fetch(url, {
		headers: { "Content-Type": "application/json" },
		...options,
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
	}
	if (res.status === 204) return null;
	return res.json();
}

interface HostTagsPanelProps {
	hostId: string; // raw host_id (not hashed)
}

export function HostTagsPanel({ hostId }: HostTagsPanelProps) {
	const { data: hostTags, mutate: mutateHostTags } = useSingleHostTags(hostId);
	const { data: allTags, mutate: mutateTags } = useTags();
	const [inputValue, setInputValue] = useState("");
	const [showDropdown, setShowDropdown] = useState(false);
	const [adding, setAdding] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	// Tags available to add (not already assigned to this host)
	const availableTags = useMemo(() => {
		if (!allTags || !hostTags) return allTags ?? [];
		const assigned = new Set(hostTags.map((t) => t.id));
		return allTags.filter((t) => !assigned.has(t.id));
	}, [allTags, hostTags]);

	// Filtered suggestions based on input
	const suggestions = useMemo(() => {
		const q = inputValue.trim().toLowerCase();
		if (!q) return availableTags;
		return availableTags.filter((t) => t.name.includes(q));
	}, [inputValue, availableTags]);

	// Check if input matches an exact existing tag name (among available)
	const exactMatch = useMemo(() => {
		const q = inputValue.trim().toLowerCase();
		return q ? availableTags.find((t) => t.name === q) : undefined;
	}, [inputValue, availableTags]);

	// Check if input could be a new tag name
	const canCreateNew = useMemo(() => {
		const q = inputValue.trim().toLowerCase();
		if (!q || !TAG_NAME_REGEX.test(q)) return false;
		// Don't show "create" if a tag with this exact name already exists (even if already assigned)
		return !allTags?.some((t) => t.name === q);
	}, [inputValue, allTags]);

	const addTag = useCallback(
		async (tagId: number) => {
			setAdding(true);
			try {
				await apiRequest(`/api/hosts/${hostId}/tags`, {
					method: "POST",
					body: JSON.stringify({ tag_id: tagId }),
				});
				await mutateHostTags();
			} catch {
				// TODO: toast
			} finally {
				setAdding(false);
				setInputValue("");
				setShowDropdown(false);
			}
		},
		[hostId, mutateHostTags],
	);

	const removeTag = useCallback(
		async (tagId: number) => {
			try {
				await apiRequest(`/api/hosts/${hostId}/tags/${tagId}`, {
					method: "DELETE",
				});
				await mutateHostTags();
			} catch {
				// TODO: toast
			}
		},
		[hostId, mutateHostTags],
	);

	const createAndAdd = useCallback(async () => {
		const name = inputValue.trim().toLowerCase();
		if (!TAG_NAME_REGEX.test(name)) return;

		setAdding(true);
		try {
			// 1. Create tag
			const newTag = (await apiRequest("/api/tags", {
				method: "POST",
				body: JSON.stringify({ name }),
			})) as TagItem;

			// 2. Assign to host
			await apiRequest(`/api/hosts/${hostId}/tags`, {
				method: "POST",
				body: JSON.stringify({ tag_id: newTag.id }),
			});

			await Promise.all([mutateHostTags(), mutateTags()]);
		} catch {
			// TODO: toast
		} finally {
			setAdding(false);
			setInputValue("");
			setShowDropdown(false);
		}
	}, [inputValue, hostId, mutateHostTags, mutateTags]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				if (exactMatch) {
					addTag(exactMatch.id);
				} else if (canCreateNew) {
					createAndAdd();
				}
			}
			if (e.key === "Escape") {
				setShowDropdown(false);
				inputRef.current?.blur();
			}
		},
		[exactMatch, canCreateNew, addTag, createAndAdd],
	);

	const handleBlur = useCallback((e: React.FocusEvent) => {
		// Only close dropdown if focus left the entire container
		if (!containerRef.current?.contains(e.relatedTarget as Node)) {
			// Small delay to allow click events on dropdown items to fire
			setTimeout(() => setShowDropdown(false), 150);
		}
	}, []);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Tag className="h-4 w-4" />
					Tags
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{/* Current tags */}
					{hostTags && hostTags.length > 0 && (
						<div className="flex flex-wrap gap-1.5">
							{hostTags.map((tag) => (
								<TagChip
									key={tag.id}
									name={tag.name}
									color={tag.color}
									size="md"
									onRemove={() => removeTag(tag.id)}
								/>
							))}
						</div>
					)}

					{/* Add tag input */}
					<div ref={containerRef} className="relative">
						<div className="flex items-center gap-2">
							<div className="relative flex-1">
								<input
									ref={inputRef}
									type="text"
									placeholder="Add or create tag…"
									value={inputValue}
									onChange={(e) => {
										setInputValue(e.target.value);
										setShowDropdown(true);
									}}
									onFocus={() => setShowDropdown(true)}
									onBlur={handleBlur}
									onKeyDown={handleKeyDown}
									disabled={adding}
									className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
									maxLength={32}
								/>
							</div>
						</div>

						{/* Dropdown */}
						{showDropdown && (suggestions.length > 0 || canCreateNew) && (
							<div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-popover shadow-md">
								{/* Existing tag suggestions */}
								{suggestions.map((tag) => (
									<button
										key={tag.id}
										type="button"
										onMouseDown={(e) => e.preventDefault()}
										onClick={() => addTag(tag.id)}
										className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
									>
										<TagChip name={tag.name} color={tag.color} size="sm" />
									</button>
								))}

								{/* Create new option */}
								{canCreateNew && (
									<button
										type="button"
										onMouseDown={(e) => e.preventDefault()}
										onClick={createAndAdd}
										className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left border-t border-border"
									>
										<Plus className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
										<span className="text-muted-foreground">Create</span>
										<span className="font-medium">{inputValue.trim().toLowerCase()}</span>
									</button>
								)}
							</div>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
