import { deleteAPI, postAPI } from "@/api";
import { TagChip } from "@/components/tag-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHostTagsFor, useTags } from "@/hooks";
import { createTagAffordance, suggestTags } from "@/lib/host-tags";
import { type HostTag, MAX_TAGS_PER_HOST, type TagItem } from "@bat/shared";
import { Plus, Tags } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSWRConfig } from "swr";

interface HostTagsPanelProps {
	hostId: string;
}

export function HostTagsPanel({ hostId }: HostTagsPanelProps) {
	const { data: hostTags, mutate: mutateHostTags } = useHostTagsFor(hostId);
	const { data: allTags, mutate: mutateAllTags } = useTags();
	const { mutate: globalMutate } = useSWRConfig();
	const [query, setQuery] = useState("");
	const [busy, setBusy] = useState(false);
	const [open, setOpen] = useState(false);

	const revalidateRelated = useCallback(() => {
		globalMutate("host-tags");
	}, [globalMutate]);

	const suggestions = useMemo(
		() => suggestTags(allTags ?? [], hostTags ?? [], query),
		[allTags, hostTags, query],
	);
	const affordance = useMemo(() => createTagAffordance(allTags ?? [], query), [allTags, query]);

	const atLimit = (hostTags?.length ?? 0) >= MAX_TAGS_PER_HOST;

	const attachTag = useCallback(
		async (tagId: number) => {
			if (busy || atLimit) {
				return;
			}
			setBusy(true);
			try {
				await postAPI<HostTag>(`/api/hosts/${hostId}/tags`, { tag_id: tagId });
				await mutateHostTags();
				revalidateRelated();
				setQuery("");
				setOpen(false);
			} catch {
				// TODO: toast
			} finally {
				setBusy(false);
			}
		},
		[busy, atLimit, hostId, mutateHostTags, revalidateRelated],
	);

	const createAndAttach = useCallback(
		async (name: string) => {
			if (busy || atLimit) {
				return;
			}
			setBusy(true);
			try {
				const created = await postAPI<TagItem>("/api/tags", { name });
				await mutateAllTags();
				await postAPI<HostTag>(`/api/hosts/${hostId}/tags`, { tag_id: created.id });
				await mutateHostTags();
				revalidateRelated();
				setQuery("");
				setOpen(false);
			} catch {
				// TODO: toast
			} finally {
				setBusy(false);
			}
		},
		[busy, atLimit, hostId, mutateAllTags, mutateHostTags, revalidateRelated],
	);

	const detachTag = useCallback(
		async (tagId: number) => {
			if (busy) {
				return;
			}
			setBusy(true);
			try {
				await deleteAPI(`/api/hosts/${hostId}/tags/${tagId}`);
				await mutateHostTags();
				revalidateRelated();
			} catch {
				// TODO: toast
			} finally {
				setBusy(false);
			}
		},
		[busy, hostId, mutateHostTags, revalidateRelated],
	);

	const handlePrimaryAction = useCallback(() => {
		if (suggestions[0]) {
			attachTag(suggestions[0].tag.id);
		} else if (affordance.kind === "create") {
			createAndAttach(affordance.name);
		} else if (affordance.kind === "exists") {
			attachTag(affordance.tagId);
		}
	}, [suggestions, affordance, attachTag, createAndAttach]);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					<Tags className="h-4 w-4" />
					Tags
					{atLimit && (
						<span className="text-xs font-normal text-muted-foreground">
							(max {MAX_TAGS_PER_HOST})
						</span>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{hostTags && hostTags.length > 0 ? (
						<div className="flex flex-wrap gap-1.5">
							{hostTags.map((t) => (
								<TagChip
									key={t.id}
									name={t.name}
									color={t.color}
									onRemove={() => detachTag(t.id)}
								/>
							))}
						</div>
					) : (
						<p className="text-sm text-muted-foreground">No tags yet</p>
					)}

					{!atLimit && (
						<div className="relative">
							<div className="flex items-center gap-2">
								<input
									type="text"
									placeholder="Add tag…"
									value={query}
									onChange={(e) => {
										setQuery(e.target.value);
										setOpen(true);
									}}
									onFocus={() => setOpen(true)}
									onBlur={() => setTimeout(() => setOpen(false), 150)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											handlePrimaryAction();
										}
										if (e.key === "Escape") {
											setOpen(false);
											setQuery("");
										}
									}}
									disabled={busy}
									maxLength={64}
									className="h-8 flex-1 rounded-md border border-border bg-secondary hover:border-foreground/20 px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
								/>
							</div>
							{open && (suggestions.length > 0 || affordance.kind !== "none") && (
								<div className="absolute left-0 right-0 z-10 mt-1 max-h-60 overflow-auto rounded-md border border-border bg-popover shadow-md">
									{suggestions.map((s) => (
										<button
											key={s.tag.id}
											type="button"
											onMouseDown={(e) => e.preventDefault()}
											onClick={() => attachTag(s.tag.id)}
											disabled={busy}
											className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-accent disabled:opacity-50 text-left"
										>
											<TagChip name={s.tag.name} color={s.tag.color} />
											{s.tag.host_count > 0 && (
												<span className="ml-auto text-xs text-muted-foreground">
													{s.tag.host_count}
												</span>
											)}
										</button>
									))}
									{affordance.kind === "create" && (
										<button
											type="button"
											onMouseDown={(e) => e.preventDefault()}
											onClick={() => createAndAttach(affordance.name)}
											disabled={busy}
											className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-accent disabled:opacity-50 text-left border-t border-border"
										>
											<Plus className="h-3.5 w-3.5 text-muted-foreground" />
											Create "{affordance.name}"
										</button>
									)}
									{affordance.kind === "tooLong" && (
										<div className="px-2.5 py-1.5 text-xs text-destructive">
											Tag name is too long
										</div>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
