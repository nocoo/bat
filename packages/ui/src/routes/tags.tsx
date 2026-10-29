import { TAG_MAX_LENGTH, type TagItem } from "@bat/shared";
import { Badge, Button, Input } from "@nocoo/basalt";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@nocoo/basalt/components/select";
import { AlertTriangle, Plus, Tag, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { deleteAPI, postAPI, putAPI } from "@/api";
import { TagChip } from "@/components/tag-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { useTags } from "@/hooks";
import { getSwatchColor } from "@/lib/palette";
import { validateTagName } from "@/lib/webhooks-format";

export function TagsPage() {
	const { data: tags, error, isLoading, mutate } = useTags();
	const [newName, setNewName] = useState("");
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editName, setEditName] = useState("");

	const handleCreate = useCallback(async () => {
		const v = validateTagName(newName, TAG_MAX_LENGTH);
		if (!v.ok) {
			return;
		}
		setCreating(true);
		try {
			await postAPI("/api/tags", { name: v.name });
			setNewName("");
			await mutate();
		} catch {
			// TODO: toast error
		} finally {
			setCreating(false);
		}
	}, [newName, mutate]);

	const handleDelete = useCallback(
		async (id: number) => {
			try {
				await deleteAPI(`/api/tags/${id}`);
				await mutate();
			} catch {
				// TODO: toast error
			}
		},
		[mutate],
	);

	const handleRename = useCallback(
		async (id: number) => {
			const v = validateTagName(editName, TAG_MAX_LENGTH);
			if (!v.ok) {
				return;
			}
			try {
				await putAPI(`/api/tags/${id}`, { name: v.name });
				setEditingId(null);
				setEditName("");
				await mutate();
			} catch {
				// TODO: toast error
			}
		},
		[editName, mutate],
	);

	const handleRecolor = useCallback(
		async (id: number, color: number) => {
			try {
				await putAPI(`/api/tags/${id}`, { color });
				await mutate();
			} catch {
				// TODO: toast error
			}
		},
		[mutate],
	);

	return isLoading && !tags ? (
		<LayerCard>
			<LayerCard.Body className="py-6 space-y-4">
				{Array.from({ length: 5 }, (_, i) => (
					<Skeleton key={`tag-skeleton-${i.toString()}`} className="h-8 w-full" />
				))}
			</LayerCard.Body>
		</LayerCard>
	) : error && !tags ? (
		<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
			<AlertTriangle className="h-12 w-12 mb-4 text-basalt-destructive" strokeWidth={1} />
			<h2 className="text-basalt-lg font-semibold text-basalt-foreground">Failed to load tags</h2>
			<p className="mt-2 text-basalt-base">{error.message}</p>
		</div>
	) : (
		<div className="space-y-basalt-layout" data-bat-dirty={!!newName || editingId !== null}>
			<PageHeader
				title="Tags"
				description="Labels and categorization rules for grouping monitored hosts."
			/>

			{/* Create new tag */}
			<LayerCard>
				<LayerCard.Body>
					<form
						className="flex items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							handleCreate();
						}}
					>
						<Plus className="h-4 w-4 text-basalt-muted-foreground shrink-0" strokeWidth={1.5} />
						<Input
							aria-label="New tag name"
							placeholder="New tag name…"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							size="sm"
							className="min-w-0 flex-1"
							maxLength={32}
						/>
						<Button
							type="submit"
							size="sm"
							disabled={creating || !newName.trim() || newName.trim().length > TAG_MAX_LENGTH}
						>
							{creating ? "Creating..." : "Create"}
						</Button>
					</form>
				</LayerCard.Body>
			</LayerCard>

			{/* Tag list */}
			{!tags || tags.length === 0 ? (
				<div className="flex flex-col items-center justify-center py-20 text-basalt-muted-foreground">
					<Tag className="h-12 w-12 mb-4" strokeWidth={1} />
					<h2 className="text-basalt-lg font-semibold text-basalt-foreground">No tags yet</h2>
					<p className="mt-2 text-basalt-base">Create a tag above to get started.</p>
				</div>
			) : (
				<LayerCard>
					<LayerCard.Body>
						<div className="divide-y divide-basalt-border">
							{tags.map((tag) => (
								<TagRow
									key={tag.id}
									tag={tag}
									editing={editingId === tag.id}
									editName={editingId === tag.id ? editName : ""}
									onStartEdit={() => {
										setEditingId(tag.id);
										setEditName(tag.name);
									}}
									onCancelEdit={() => {
										setEditingId(null);
										setEditName("");
									}}
									onEditNameChange={setEditName}
									onRename={() => handleRename(tag.id)}
									onRecolor={(color) => handleRecolor(tag.id, color)}
									onDelete={() => handleDelete(tag.id)}
								/>
							))}
						</div>
					</LayerCard.Body>
				</LayerCard>
			)}
		</div>
	);
}

// --- Tag row component ---

interface TagRowProps {
	tag: TagItem;
	editing: boolean;
	editName: string;
	onStartEdit: () => void;
	onCancelEdit: () => void;
	onEditNameChange: (name: string) => void;
	onRename: () => void;
	onRecolor: (color: number) => void;
	onDelete: () => void;
}

function TagRow({
	tag,
	editing,
	editName,
	onStartEdit,
	onCancelEdit,
	onEditNameChange,
	onRename,
	onRecolor,
	onDelete,
}: TagRowProps) {
	return (
		<div className="flex flex-wrap items-center gap-3 py-2.5 px-1">
			{/* Tag chip / inline edit */}
			<div className="flex-1 min-w-40">
				{editing ? (
					<form
						className="flex items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							onRename();
						}}
					>
						<Input
							aria-label="Tag name"
							value={editName}
							onChange={(e) => onEditNameChange(e.target.value)}
							size="sm"
							className="flex-1 min-w-0"
							maxLength={32}
						/>
						<Button type="submit" size="sm" variant="ghost">
							Save
						</Button>
						<Button type="button" size="sm" variant="ghost" onClick={onCancelEdit}>
							Cancel
						</Button>
					</form>
				) : (
					<Button
						type="button"
						onClick={onStartEdit}
						variant="ghost"
						size="sm"
						aria-label={`Rename tag ${tag.name}`}
					>
						<TagChip name={tag.name} color={tag.color} />
					</Button>
				)}
			</div>

			<Select value={String(tag.color)} onValueChange={(value) => onRecolor(Number(value))}>
				<SelectTrigger size="sm" aria-label={`Color for ${tag.name}`} className="w-32">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{[
						"Pink",
						"Sky",
						"Teal",
						"Green",
						"Lime",
						"Chartreuse",
						"Violet",
						"Orange",
						"Blue",
						"Red",
					].map((name, index) => (
						<SelectItem key={name} value={String(index)}>
							<span className="flex items-center gap-2">
								<span
									aria-hidden="true"
									className="size-3 rounded-full"
									style={{ backgroundColor: getSwatchColor(index) }}
								/>
								{name}
							</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{/* Host count */}
			<Badge variant="secondary" className="tabular-nums">
				{tag.host_count} {tag.host_count === 1 ? "host" : "hosts"}
			</Badge>

			{/* Delete */}
			<Button
				type="button"
				onClick={onDelete}
				variant="ghost"
				size="icon"
				aria-label={`Delete tag ${tag.name}`}
			>
				<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
			</Button>
		</div>
	);
}
