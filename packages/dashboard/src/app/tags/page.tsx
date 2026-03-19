"use client";

import { AppShell } from "@/components/layout";
import { TagChip } from "@/components/tag-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTags } from "@/lib/hooks";
import { TAG_COLORS } from "@/lib/palette";
import { TAG_COLOR_COUNT, TAG_NAME_REGEX } from "@bat/shared";
import type { TagItem } from "@bat/shared";
import { AlertTriangle, Plus, Tag, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";

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

export default function TagsPage() {
	const { data: tags, error, isLoading, mutate } = useTags();
	const [newName, setNewName] = useState("");
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [editName, setEditName] = useState("");

	const handleCreate = useCallback(async () => {
		const name = newName.trim().toLowerCase();
		if (!TAG_NAME_REGEX.test(name)) return;
		setCreating(true);
		try {
			await apiRequest("/api/tags", {
				method: "POST",
				body: JSON.stringify({ name }),
			});
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
				await apiRequest(`/api/tags/${id}`, { method: "DELETE" });
				await mutate();
			} catch {
				// TODO: toast error
			}
		},
		[mutate],
	);

	const handleRename = useCallback(
		async (id: number) => {
			const name = editName.trim().toLowerCase();
			if (!TAG_NAME_REGEX.test(name)) return;
			try {
				await apiRequest(`/api/tags/${id}`, {
					method: "PUT",
					body: JSON.stringify({ name }),
				});
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
				await apiRequest(`/api/tags/${id}`, {
					method: "PUT",
					body: JSON.stringify({ color }),
				});
				await mutate();
			} catch {
				// TODO: toast error
			}
		},
		[mutate],
	);

	return (
		<AppShell breadcrumbs={[{ label: "Tags" }]}>
			{isLoading && !tags ? (
				<Card>
					<CardContent className="py-6 space-y-4">
						{Array.from({ length: 5 }, (_, i) => (
							<Skeleton key={`tag-skeleton-${i.toString()}`} className="h-8 w-full" />
						))}
					</CardContent>
				</Card>
			) : error && !tags ? (
				<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
					<AlertTriangle className="h-12 w-12 mb-4 text-destructive" strokeWidth={1} />
					<h2 className="text-lg font-semibold text-foreground">Failed to load tags</h2>
					<p className="mt-2 text-sm">{error.message}</p>
				</div>
			) : (
				<div className="space-y-4">
					{/* Create new tag */}
					<Card>
						<CardContent className="py-3">
							<form
								className="flex items-center gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									handleCreate();
								}}
							>
								<Plus className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
								<input
									placeholder="New tag name (a-z, 0-9, -, _)"
									value={newName}
									onChange={(e) => setNewName(e.target.value)}
									className="h-8 text-sm flex-1 rounded-md border border-input bg-background px-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									maxLength={32}
								/>
								<Button
									type="submit"
									size="sm"
									disabled={creating || !TAG_NAME_REGEX.test(newName.trim().toLowerCase())}
								>
									{creating ? "Creating..." : "Create"}
								</Button>
							</form>
						</CardContent>
					</Card>

					{/* Tag list */}
					{!tags || tags.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
							<Tag className="h-12 w-12 mb-4" strokeWidth={1} />
							<h2 className="text-lg font-semibold text-foreground">No tags yet</h2>
							<p className="mt-2 text-sm">Create a tag above to get started.</p>
						</div>
					) : (
						<Card>
							<CardContent className="py-2">
								<div className="divide-y divide-border">
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
							</CardContent>
						</Card>
					)}
				</div>
			)}
		</AppShell>
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
		<div className="flex items-center gap-3 py-2.5 px-1">
			{/* Tag chip / inline edit */}
			<div className="flex-1 min-w-0">
				{editing ? (
					<form
						className="flex items-center gap-2"
						onSubmit={(e) => {
							e.preventDefault();
							onRename();
						}}
					>
						<input
							value={editName}
							onChange={(e) => onEditNameChange(e.target.value)}
							className="h-7 text-sm w-40 rounded-md border border-input bg-background px-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							maxLength={32}
						/>
						<Button type="submit" size="sm" variant="ghost" className="h-7 text-xs">
							Save
						</Button>
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="h-7 text-xs"
							onClick={onCancelEdit}
						>
							Cancel
						</Button>
					</form>
				) : (
					<button
						type="button"
						onClick={onStartEdit}
						className="hover:opacity-80 transition-opacity"
					>
						<TagChip name={tag.name} color={tag.color} size="md" />
					</button>
				)}
			</div>

			{/* Color swatches */}
			<div className="flex items-center gap-1">
				{Array.from({ length: TAG_COLOR_COUNT }, (_, i) => (
					<button
						key={`color-${i.toString()}`}
						type="button"
						onClick={() => onRecolor(i)}
						className={`h-4 w-4 rounded-full transition-all ${
							tag.color === i
								? "ring-2 ring-offset-1 ring-foreground scale-110"
								: "opacity-60 hover:opacity-100"
						}`}
						style={{ backgroundColor: TAG_COLORS[i] }}
						aria-label={`Color ${i}`}
					/>
				))}
			</div>

			{/* Host count */}
			<Badge variant="secondary" className="text-xs px-2 py-0.5 font-normal tabular-nums">
				{tag.host_count} {tag.host_count === 1 ? "host" : "hosts"}
			</Badge>

			{/* Delete */}
			<button
				type="button"
				onClick={onDelete}
				className="h-7 w-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
				aria-label={`Delete tag ${tag.name}`}
			>
				<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
			</button>
		</div>
	);
}

// Export for testing
export { TagRow };
