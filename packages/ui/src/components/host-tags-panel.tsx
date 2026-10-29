import { type HostTag, MAX_TAGS_PER_HOST, type TagItem } from "@bat/shared";
import { MultiSelect } from "@nocoo/basalt/components/multi-select";
import { useCallback, useMemo, useState } from "react";
import { useSWRConfig } from "swr";
import { deleteAPI, postAPI } from "@/api";
import { useHostTagsFor, useTags } from "@/hooks";
import { createTagAffordance, suggestTags } from "@/lib/host-tags";

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
	const [error, setError] = useState<string | null>(null);

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
			setError(null);
			try {
				await postAPI<HostTag>(`/api/hosts/${hostId}/tags`, { tag_id: tagId });
				await mutateHostTags();
				revalidateRelated();
				setQuery("");
				setOpen(false);
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Could not update tags.");
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
			setError(null);
			try {
				const created = await postAPI<TagItem>("/api/tags", { name });
				await mutateAllTags();
				await postAPI<HostTag>(`/api/hosts/${hostId}/tags`, { tag_id: created.id });
				await mutateHostTags();
				revalidateRelated();
				setQuery("");
				setOpen(false);
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Could not update tags.");
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
			setError(null);
			try {
				await deleteAPI(`/api/hosts/${hostId}/tags/${tagId}`);
				await mutateHostTags();
				revalidateRelated();
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Could not update tags.");
			} finally {
				setBusy(false);
			}
		},
		[busy, hostId, mutateHostTags, revalidateRelated],
	);

	return (
		<div className="min-w-0 max-w-full" data-testid="host-tags-manager">
			<MultiSelect
				className="flex max-w-full flex-wrap items-center gap-basalt-space-md space-y-0 [&>button]:h-basalt-control-sm [&>button]:w-auto [&>button]:px-basalt-space-lg [&>button]:py-0 [&>[role=group]]:min-w-0 [&>[role=group]]:max-w-full [&>[role=group]>span]:h-basalt-control-sm [&>[role=group]>span]:py-0 [&>[role=group]>span>span]:truncate"
				label="Host tags"
				placeholder="+ Add"
				formatSelectionCount={(count) =>
					count >= MAX_TAGS_PER_HOST ? `Max ${MAX_TAGS_PER_HOST}` : "+ Add"
				}
				searchPlaceholder="Add tag..."
				removeLabel="Remove tag"
				value={(hostTags ?? []).map((tag) => String(tag.id))}
				options={[
					...(hostTags ?? []).map((tag) => ({ value: String(tag.id), label: tag.name })),
					...suggestions.map(({ tag }) => ({
						value: String(tag.id),
						label: tag.name,
						disabled: atLimit,
					})),
					...(affordance.kind === "create"
						? [{ value: "create", label: `Create "${affordance.name}"`, disabled: atLimit }]
						: []),
				]}
				query={query}
				onQueryChange={setQuery}
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setQuery("");
				}}
				disabled={busy}
				emptyLabel={affordance.kind === "tooLong" ? "Tag name is too long" : "No tags found"}
				onValueChange={(ids) => {
					const removed = hostTags?.find((tag) => !ids.includes(String(tag.id)));
					if (removed) {
						void detachTag(removed.id);
						return;
					}
					if (ids.includes("create") && affordance.kind === "create") {
						void createAndAttach(affordance.name);
						return;
					}
					const added = ids.find((id) => !hostTags?.some((tag) => String(tag.id) === id));
					if (added) void attachTag(Number(added));
				}}
			/>
			{error && (
				<p role="alert" className="mt-2 text-basalt-base text-basalt-destructive">
					{error}
				</p>
			)}
		</div>
	);
}
