import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { getBadgeStyle } from "@/lib/palette";
import type { EventItem } from "@bat/shared";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";

function formatTime(unixSeconds: number): string {
	const now = Math.floor(Date.now() / 1000);
	const delta = now - unixSeconds;
	if (delta < 60) return "just now";
	if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
	if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
	return `${Math.floor(delta / 86400)}d ago`;
}

function formatBody(bodyStr: string): string {
	try {
		return JSON.stringify(JSON.parse(bodyStr), null, 2);
	} catch {
		return bodyStr;
	}
}

interface EventTableProps {
	events: EventItem[];
}

export function EventTable({ events }: EventTableProps) {
	const [expandedId, setExpandedId] = useState<number | null>(null);

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-8" />
					<TableHead className="w-32">Time</TableHead>
					<TableHead className="w-40">Host</TableHead>
					<TableHead>Title</TableHead>
					<TableHead className="w-48">Tags</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{events.map((event) => {
					const isExpanded = expandedId === event.id;
					return (
						<Fragment key={event.id}>
							<TableRow
								className="cursor-pointer hover:bg-muted/50"
								onClick={() => setExpandedId(isExpanded ? null : event.id)}
							>
								<TableCell className="py-2">
									{isExpanded ? (
										<ChevronDown className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
									) : (
										<ChevronRight className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
									)}
								</TableCell>
								<TableCell className="py-2 text-sm text-muted-foreground tabular-nums">
									{formatTime(event.created_at)}
								</TableCell>
								<TableCell className="py-2 text-sm font-medium truncate max-w-[160px]">
									{event.hostname}
								</TableCell>
								<TableCell className="py-2 text-sm">{event.title}</TableCell>
								<TableCell className="py-2">
									<div className="flex flex-wrap gap-1">
										{event.tags.map((tag) => (
											<span
												key={tag}
												className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
												style={getBadgeStyle(tag)}
											>
												{tag}
											</span>
										))}
									</div>
								</TableCell>
							</TableRow>
							{isExpanded && (
								<TableRow>
									<TableCell colSpan={5} className="bg-muted/30 py-3">
										<pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto px-2">
											{formatBody(event.body)}
										</pre>
									</TableCell>
								</TableRow>
							)}
						</Fragment>
					);
				})}
			</TableBody>
		</Table>
	);
}
